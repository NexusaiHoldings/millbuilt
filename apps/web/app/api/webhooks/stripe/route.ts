/**
 * Company-specific Stripe webhook handler.
 *
 * Handles payment events for cabinet deposit orders (metadata.type === 'cabinet_deposit').
 * This route is separate from the billing lego's webhook at /api/stripe/webhook,
 * which handles subscription events — this one handles one-time deposit payments.
 *
 * Verification uses the billing lego's verifyStripeSignature (HMAC-SHA256,
 * timing-safe compare, 300-second timestamp tolerance).
 *
 * URL is fixed at /api/webhooks/stripe — configure this endpoint in the
 * Stripe dashboard and set STRIPE_CABINET_WEBHOOK_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyStripeSignature } from "@nexus/billing-and-subscriptions";
import {
  createOrderFromQuote,
  getOrderByStripeSession,
  sendOrderConfirmationNotification,
} from "@/lib/cabinets/order-creation";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

// ── Idempotency helpers ───────────────────────────────────────────────────────

let _eventTableReady = false;

async function ensureWebhookEventTable(): Promise<void> {
  if (_eventTableReady) return;
  const db = buildDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS cabinet_webhook_events (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      stripe_event_id  text UNIQUE NOT NULL,
      event_type       text NOT NULL,
      processed_at     timestamptz,
      processing_error text,
      created_at       timestamptz NOT NULL DEFAULT now()
    )
  `);
  _eventTableReady = true;
}

async function claimEvent(stripeEventId: string, eventType: string): Promise<boolean> {
  const db = buildDb();
  try {
    const rows = await db.query<{ id: string }>(
      `INSERT INTO cabinet_webhook_events (stripe_event_id, event_type)
       VALUES ($1, $2)
       ON CONFLICT (stripe_event_id) DO NOTHING
       RETURNING id`,
      stripeEventId,
      eventType,
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function markEventProcessed(
  stripeEventId: string,
  error: string | null,
): Promise<void> {
  const db = buildDb();
  try {
    await db.execute(
      `UPDATE cabinet_webhook_events
       SET processed_at = now(), processing_error = $2
       WHERE stripe_event_id = $1`,
      stripeEventId,
      error,
    );
  } catch {
    // Best-effort.
  }
}

// ── Stripe event types ────────────────────────────────────────────────────────

interface StripeCheckoutSession {
  id: string;
  payment_status: string;
  payment_intent: string | null;
  customer_email: string | null;
  metadata: Record<string, string>;
  amount_total: number | null;
}

interface StripePaymentIntent {
  id: string;
  status: string;
  metadata: Record<string, string>;
  latest_charge: string | null;
  amount: number;
}

// ── Handler: checkout.session.completed ──────────────────────────────────────

async function handleCheckoutSessionCompleted(
  session: StripeCheckoutSession,
): Promise<void> {
  const metadata = session.metadata ?? {};

  // Only process cabinet deposit orders.
  if (metadata.type !== "cabinet_deposit") return;

  const quoteId = metadata.quote_id;
  const userId = metadata.user_id;

  if (!quoteId || !userId) {
    console.error(
      "[cabinet-webhook] checkout.session.completed missing quote_id or user_id in metadata",
      { sessionId: session.id },
    );
    return;
  }

  if (session.payment_status !== "paid") {
    console.warn(
      "[cabinet-webhook] checkout session not paid, skipping order creation",
      { sessionId: session.id, paymentStatus: session.payment_status },
    );
    return;
  }

  // Check if order already exists (race condition with success-page fallback).
  const existing = await getOrderByStripeSession(session.id);
  if (existing) {
    console.log(
      "[cabinet-webhook] order already exists for session, skipping",
      { orderId: existing.id, sessionId: session.id },
    );
    return;
  }

  const order = await createOrderFromQuote(
    quoteId,
    userId,
    session.id,
    session.payment_intent ?? null,
  );

  if (!order) {
    console.error("[cabinet-webhook] createOrderFromQuote returned null", {
      quoteId,
      sessionId: session.id,
    });
    throw new Error(`Failed to create order for quote ${quoteId}`);
  }

  const userEmail = session.customer_email ?? "";
  await sendOrderConfirmationNotification(order, userEmail);

  // Publish domain event for analytics / CRM / other consumers.
  const events = buildEventBus();
  await events.publish("cabinets.deposit_payment_received", {
    order_id: order.id,
    quote_id: quoteId,
    design_id: order.design_id,
    user_id: userId,
    deposit_paid_cents: order.deposit_paid_cents,
    stripe_session_id: session.id,
    stripe_payment_intent: session.payment_intent,
  });

  console.log("[cabinet-webhook] order created from checkout session", {
    orderId: order.id,
    quoteId,
    userId,
  });
}

// ── Handler: payment_intent.succeeded ────────────────────────────────────────

async function handlePaymentIntentSucceeded(
  paymentIntent: StripePaymentIntent,
): Promise<void> {
  const metadata = paymentIntent.metadata ?? {};

  // Only process cabinet deposit payments.
  if (metadata.type !== "cabinet_deposit") return;
  if (!metadata.quote_id || !metadata.user_id) return;

  // payment_intent.succeeded is a secondary event; checkout.session.completed
  // is the primary. Only act if no order exists yet for this payment intent.
  const db = buildDb();
  try {
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM cabinet_orders WHERE stripe_payment_intent_id = $1 LIMIT 1`,
      paymentIntent.id,
    );
    if (existing.length > 0) return; // Already handled.
  } catch {
    // Table may not exist; safe to proceed.
  }

  const events = buildEventBus();
  await events.publish("cabinets.payment_intent_succeeded", {
    quote_id: metadata.quote_id,
    user_id: metadata.user_id,
    payment_intent_id: paymentIntent.id,
    amount_cents: paymentIntent.amount,
  });
}

// ── Main POST handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Read raw body BEFORE any other processing (required for Stripe signature verification).
  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature");

  // Prefer a company-specific webhook secret; fall back to the shared one.
  const webhookSecret =
    process.env.STRIPE_CABINET_WEBHOOK_SECRET ??
    process.env.STRIPE_WEBHOOK_SECRET ??
    "";

  if (!webhookSecret) {
    console.error("[cabinet-webhook] no webhook secret configured");
    return NextResponse.json(
      { error: "webhook secret not configured" },
      { status: 500 },
    );
  }

  if (!verifyStripeSignature(rawBody, sigHeader ?? "", webhookSecret)) {
    console.warn("[cabinet-webhook] signature verification failed");
    return NextResponse.json(
      { error: "signature verification failed" },
      { status: 400 },
    );
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const stripeEventId = (event.id as string) ?? "";
  const eventType = (event.type as string) ?? "";

  if (!stripeEventId || !eventType) {
    return NextResponse.json(
      { error: "missing event id or type" },
      { status: 400 },
    );
  }

  // Ensure idempotency table exists and claim the event.
  try {
    await ensureWebhookEventTable();
  } catch (err) {
    console.error("[cabinet-webhook] failed to ensure event table:", err);
    // Do not block processing — the claim will fail but we continue.
  }

  const claimed = await claimEvent(stripeEventId, eventType);
  if (!claimed) {
    // Duplicate delivery — respond 200 to tell Stripe not to retry.
    return NextResponse.json({ status: "duplicate" }, { status: 200 });
  }

  const eventData = (event.data as Record<string, unknown>) ?? {};
  const obj = (eventData.object as Record<string, unknown>) ?? {};

  let processingError: string | null = null;

  try {
    if (eventType === "checkout.session.completed") {
      await handleCheckoutSessionCompleted(obj as unknown as StripeCheckoutSession);
    } else if (eventType === "payment_intent.succeeded") {
      await handlePaymentIntentSucceeded(obj as unknown as StripePaymentIntent);
    } else {
      // Unknown event type for this handler — acknowledge silently.
      console.log(`[cabinet-webhook] unhandled event type: ${eventType}`);
    }
  } catch (err) {
    processingError = String(err);
    console.error(
      `[cabinet-webhook] error processing ${eventType}:`,
      processingError,
    );
    // Mark event as failed but return 200 to prevent infinite Stripe retries
    // on non-retryable errors (e.g. duplicate quote, invalid quote_id).
  }

  await markEventProcessed(stripeEventId, processingError);

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
