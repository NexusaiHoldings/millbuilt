import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { randomUUID } from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CabinetOrder {
  id: string;
  quote_id: string;
  design_id: string;
  user_id: string;
  design_name: string;
  total_price_cents: number;
  deposit_paid_cents: number;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  status: "deposit_paid" | "in_production" | "ready" | "delivered" | "cancelled";
  estimated_lead_time_weeks: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Lazy DDL ──────────────────────────────────────────────────────────────────

let _tableReady = false;

async function ensureOrderTable(): Promise<void> {
  if (_tableReady) return;
  const db = buildDb();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS cabinet_orders (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      quote_id                  text NOT NULL,
      design_id                 text NOT NULL,
      user_id                   text NOT NULL,
      design_name               text NOT NULL DEFAULT '',
      total_price_cents         integer NOT NULL DEFAULT 0,
      deposit_paid_cents        integer NOT NULL DEFAULT 0,
      stripe_session_id         text UNIQUE,
      stripe_payment_intent_id  text,
      status                    text NOT NULL DEFAULT 'deposit_paid',
      estimated_lead_time_weeks integer NOT NULL DEFAULT 7,
      notes                     text,
      created_at                timestamptz NOT NULL DEFAULT now(),
      updated_at                timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Add disclaimer and lock columns to cabinet_designs if they do not exist yet.
  await db.execute(`
    ALTER TABLE IF EXISTS cabinet_designs
      ADD COLUMN IF NOT EXISTS disclaimer_acknowledged_at timestamptz
  `);
  await db.execute(`
    ALTER TABLE IF EXISTS cabinet_designs
      ADD COLUMN IF NOT EXISTS locked_at timestamptz
  `);

  _tableReady = true;
}

// ── Order creation ────────────────────────────────────────────────────────────

interface QuoteRow {
  id: string;
  design_id: string;
  user_id: string;
  design_name: string;
  total_sell_price_cents: number;
  deposit_amount_cents: number;
}

/**
 * Create a cabinet_orders record from a paid Stripe checkout session.
 * Idempotent: uses ON CONFLICT on stripe_session_id so re-delivery of the
 * webhook does not create duplicate rows.
 * Also marks the quote as 'ordered' and locks the design.
 */
export async function createOrderFromQuote(
  quoteId: string,
  userId: string,
  stripeSessionId: string,
  stripePaymentIntentId?: string | null,
): Promise<CabinetOrder | null> {
  await ensureOrderTable();
  const db = buildDb();
  const events = buildEventBus();

  const quoteRows = await db.query<QuoteRow>(
    `SELECT id, design_id, user_id, design_name,
       total_sell_price_cents, deposit_amount_cents
     FROM cabinet_quotes WHERE id = $1 LIMIT 1`,
    quoteId,
  );
  if (!quoteRows[0]) return null;
  const quote = quoteRows[0];

  const orderId = randomUUID();

  const rows = await db.query<CabinetOrder>(
    `INSERT INTO cabinet_orders (
       id, quote_id, design_id, user_id, design_name,
       total_price_cents, deposit_paid_cents,
       stripe_session_id, stripe_payment_intent_id,
       status, estimated_lead_time_weeks
     ) VALUES (
       $1::uuid, $2, $3, $4, $5,
       $6, $7,
       $8, $9,
       'deposit_paid', 7
     )
     ON CONFLICT (stripe_session_id) DO UPDATE
       SET updated_at = now()
     RETURNING id, quote_id, design_id, user_id, design_name,
       total_price_cents, deposit_paid_cents,
       stripe_session_id, stripe_payment_intent_id,
       status, estimated_lead_time_weeks, notes, created_at, updated_at`,
    orderId,
    quoteId,
    quote.design_id,
    userId,
    quote.design_name,
    quote.total_sell_price_cents,
    quote.deposit_amount_cents,
    stripeSessionId,
    stripePaymentIntentId ?? null,
  );

  const order = rows[0];
  if (!order) return null;

  // Mark quote as ordered and lock the design.
  await db.execute(
    `UPDATE cabinet_quotes SET status = 'ordered' WHERE id = $1`,
    quoteId,
  );
  await db.execute(
    `UPDATE cabinet_designs SET locked_at = now() WHERE id = $1 AND locked_at IS NULL`,
    quote.design_id,
  );

  // Publish order-created event for downstream consumers.
  await events.publish("cabinets.order_created", {
    order_id: order.id,
    quote_id: quoteId,
    design_id: quote.design_id,
    user_id: userId,
    deposit_paid_cents: quote.deposit_amount_cents,
    stripe_session_id: stripeSessionId,
  });

  return order;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getOrderById(orderId: string): Promise<CabinetOrder | null> {
  await ensureOrderTable();
  const db = buildDb();
  const rows = await db.query<CabinetOrder>(
    `SELECT id, quote_id, design_id, user_id, design_name,
       total_price_cents, deposit_paid_cents,
       stripe_session_id, stripe_payment_intent_id,
       status, estimated_lead_time_weeks, notes, created_at, updated_at
     FROM cabinet_orders WHERE id = $1 LIMIT 1`,
    orderId,
  );
  return rows[0] ?? null;
}

export async function getOrderByStripeSession(
  stripeSessionId: string,
): Promise<CabinetOrder | null> {
  await ensureOrderTable();
  const db = buildDb();
  const rows = await db.query<CabinetOrder>(
    `SELECT id, quote_id, design_id, user_id, design_name,
       total_price_cents, deposit_paid_cents,
       stripe_session_id, stripe_payment_intent_id,
       status, estimated_lead_time_weeks, notes, created_at, updated_at
     FROM cabinet_orders WHERE stripe_session_id = $1 LIMIT 1`,
    stripeSessionId,
  );
  return rows[0] ?? null;
}

export async function getOrdersForUser(userId: string): Promise<CabinetOrder[]> {
  await ensureOrderTable();
  const db = buildDb();
  return db.query<CabinetOrder>(
    `SELECT id, quote_id, design_id, user_id, design_name,
       total_price_cents, deposit_paid_cents,
       stripe_session_id, stripe_payment_intent_id,
       status, estimated_lead_time_weeks, notes, created_at, updated_at
     FROM cabinet_orders
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    userId,
  );
}

// ── Disclaimer acknowledgment ─────────────────────────────────────────────────

/**
 * Stamps disclaimer_acknowledged_at on the design so it is permanently
 * recorded that the customer accepted the liability disclaimers before checkout.
 */
export async function recordDisclaimerAcknowledgment(designId: string): Promise<void> {
  await ensureOrderTable();
  const db = buildDb();
  await db.execute(
    `UPDATE cabinet_designs
     SET disclaimer_acknowledged_at = now()
     WHERE id = $1 AND disclaimer_acknowledged_at IS NULL`,
    designId,
  );
}

// ── Notifications ─────────────────────────────────────────────────────────────

/**
 * Fires a cabinets.order_confirmation_requested event so the notifications
 * lego (or the substrate EventBus) can send the confirmation email/SMS.
 */
export async function sendOrderConfirmationNotification(
  order: CabinetOrder,
  userEmail: string,
): Promise<void> {
  const events = buildEventBus();
  const companyName = process.env.COMPANY_NAME ?? "Custom Cabinets";
  const baseUrl =
    process.env.APP_BASE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");
  const orderUrl = baseUrl ? `${baseUrl}/orders/${order.id}` : `/orders/${order.id}`;

  const depositFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(order.deposit_paid_cents / 100);

  const totalFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(order.total_price_cents / 100);

  await events.publish("cabinets.order_confirmation_requested", {
    order_id: order.id,
    user_id: order.user_id,
    user_email: userEmail,
    design_name: order.design_name,
    deposit_paid_formatted: depositFormatted,
    total_price_formatted: totalFormatted,
    estimated_lead_time_weeks: order.estimated_lead_time_weeks,
    order_url: orderUrl,
    company_name: companyName,
  });
}

// ── Stripe checkout session ───────────────────────────────────────────────────

interface StripeCheckoutResult {
  url: string;
  sessionId: string;
}

/**
 * Create a Stripe Checkout Session for the 50% deposit.
 * Stores quote_id, user_id and type=cabinet_deposit in metadata so the
 * webhook can route the event back to createOrderFromQuote.
 *
 * Returns null when STRIPE_SECRET_KEY is not configured (local dev without
 * Stripe) so callers can degrade gracefully.
 */
export async function createStripeCheckoutSession(
  quoteId: string,
  depositAmountCents: number,
  designName: string,
  userId: string,
  userEmail: string,
  successUrl: string,
  cancelUrl: string,
): Promise<StripeCheckoutResult | null> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.warn("[cabinets] STRIPE_SECRET_KEY not set — Stripe session not created");
    return null;
  }

  const productName =
    `${designName || "Custom Cabinet"} — 50% Deposit`.slice(0, 127);

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("payment_method_types[]", "card");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(depositAmountCents));
  params.set("line_items[0][price_data][product_data][name]", productName);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  params.set("customer_email", userEmail);
  params.set("metadata[quote_id]", quoteId);
  params.set("metadata[user_id]", userId);
  params.set("metadata[type]", "cabinet_deposit");
  params.set("payment_intent_data[metadata][quote_id]", quoteId);
  params.set("payment_intent_data[metadata][type]", "cabinet_deposit");

  try {
    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    });

    const body = (await resp.json()) as Record<string, unknown>;

    if (resp.status >= 400) {
      console.error(
        `[cabinets] Stripe session creation failed (${resp.status}):`,
        (body.error as Record<string, unknown>)?.message ?? JSON.stringify(body).slice(0, 300),
      );
      return null;
    }

    const url = body.url as string | undefined;
    const sessionId = body.id as string | undefined;
    if (!url || !sessionId) return null;

    return { url, sessionId };
  } catch (err) {
    console.error("[cabinets] Stripe session creation error:", err);
    return null;
  }
}
