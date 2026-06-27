import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/admin-auth";
import { getQuoteById, type CabinetQuote } from "@/lib/cabinets/quote-engine";
import {
  createStripeCheckoutSession,
  recordDisclaimerAcknowledgment,
  getOrderByStripeSession,
  createOrderFromQuote,
  type CabinetOrder,
} from "@/lib/cabinets/order-creation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({
  params,
}: {
  params: { quoteId: string };
}): Promise<Metadata> {
  return {
    title: `Checkout — Quote #${params.quoteId.substring(0, 8).toUpperCase()}`,
    description: "Complete your 50% deposit to start production on your custom cabinets.",
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────

const PAGE_STYLES = `
.checkout-layout {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 2.5rem;
  align-items: start;
}
@media (max-width: 900px) {
  .checkout-layout { grid-template-columns: 1fr; }
  .checkout-sidebar { order: -1; }
}
.progress-bar {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 2rem;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.03em;
}
.progress-step {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: #bbb;
}
.progress-step.active { color: #b45309; }
.progress-step.done { color: #16a34a; }
.progress-dot {
  width: 22px; height: 22px;
  border-radius: 50%;
  border: 2px solid currentColor;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.65rem; font-weight: 800;
  background: transparent;
  flex-shrink: 0;
}
.progress-step.active .progress-dot { background: #b45309; color: #fff; border-color: #b45309; }
.progress-step.done .progress-dot { background: #16a34a; color: #fff; border-color: #16a34a; }
.progress-connector {
  flex: 1; height: 2px; background: #e5e7eb; margin: 0 0.25rem; min-width: 24px;
}
.section-heading {
  font-size: 0.7rem; font-weight: 800; letter-spacing: 0.1em;
  text-transform: uppercase; color: #888; margin-bottom: 0.85rem;
}
.disclaimer-card {
  border: 1px solid #e5e7eb; border-radius: 10px;
  overflow: hidden; margin-bottom: 1.25rem;
}
.disclaimer-item {
  display: flex; gap: 0.9rem; align-items: flex-start;
  padding: 1rem 1.1rem; border-bottom: 1px solid #f3f4f6;
}
.disclaimer-item:last-child { border-bottom: none; }
.disclaimer-check {
  margin-top: 0.15rem; flex-shrink: 0;
  width: 17px; height: 17px; cursor: pointer; accent-color: #b45309;
}
.disclaimer-text { flex: 1; font-size: 0.85rem; line-height: 1.55; color: #333; }
.disclaimer-text strong { color: #111; }
.trust-row {
  display: flex; flex-wrap: wrap; gap: 0.6rem;
  margin-top: 1.5rem;
}
.trust-badge {
  display: flex; align-items: center; gap: 0.4rem;
  background: #f0fdf4; border: 1px solid #bbf7d0;
  border-radius: 6px; padding: 0.35rem 0.7rem;
  font-size: 0.74rem; font-weight: 600; color: #15803d;
}
.sidebar-card {
  border: 1px solid #e5e7eb; border-radius: 12px;
  padding: 1.5rem; background: #fff;
  position: sticky; top: 1.5rem;
}
.sidebar-title {
  font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em;
  text-transform: uppercase; color: #888; margin-bottom: 1rem;
}
.price-row {
  display: flex; justify-content: space-between;
  align-items: baseline; padding: 0.5rem 0;
  border-bottom: 1px solid #f3f4f6; font-size: 0.88rem;
}
.price-row:last-of-type { border-bottom: none; }
.price-row-label { color: #555; }
.price-row-value { font-weight: 700; color: #111; }
.deposit-total-block {
  background: #fef3c7; border-radius: 8px;
  padding: 1rem 1.1rem; margin: 1rem 0;
  text-align: center;
}
.deposit-total-label {
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: #92400e; display: block;
  margin-bottom: 0.25rem;
}
.deposit-total-amount {
  font-size: 2.2rem; font-weight: 800; color: #78350f;
  letter-spacing: -0.02em;
}
.deposit-total-sub {
  font-size: 0.74rem; color: #a16207; margin-top: 0.2rem; display: block;
}
.pay-btn {
  display: block; width: 100%; text-align: center;
  background: #b45309; color: #fff; font-size: 1rem;
  font-weight: 700; letter-spacing: 0.01em;
  padding: 0.9rem 1.5rem; border-radius: 8px;
  border: none; cursor: pointer;
  text-decoration: none; transition: background 0.15s;
}
.pay-btn:hover { background: #92400e; }
.pay-btn:disabled { background: #9ca3af; cursor: not-allowed; }
.stripe-note {
  font-size: 0.72rem; color: #aaa; text-align: center; margin-top: 0.6rem;
}
.confirm-hero {
  text-align: center; padding: 2rem 0 1rem;
}
.confirm-icon {
  font-size: 3rem; line-height: 1; margin-bottom: 0.75rem;
}
.confirm-order-chip {
  display: inline-block;
  background: #f0fdf4; border: 1px solid #bbf7d0;
  color: #15803d; font-weight: 700; font-size: 0.85rem;
  border-radius: 6px; padding: 0.3rem 0.9rem;
  margin-bottom: 1.5rem;
}
.confirm-details-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 0.75rem; margin-bottom: 1.5rem;
}
@media (max-width: 600px) {
  .confirm-details-grid { grid-template-columns: 1fr; }
}
.confirm-detail-cell {
  border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 0.85rem 1rem; background: #fafaf9;
}
.confirm-detail-label {
  display: block; font-size: 0.65rem; font-weight: 700;
  letter-spacing: 0.07em; text-transform: uppercase;
  color: #aaa; margin-bottom: 0.25rem;
}
.confirm-detail-value {
  font-size: 1rem; font-weight: 700; color: #111;
}
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// ── Stripe session fetch (for confirmation) ───────────────────────────────────

interface StripeSessionData {
  payment_status: string;
  metadata: Record<string, string>;
  payment_intent: string | null;
  customer_email: string | null;
  amount_total: number | null;
}

async function fetchStripeSession(
  sessionId: string,
): Promise<StripeSessionData | null> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  try {
    const resp = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as Record<string, unknown>;
    return {
      payment_status: (data.payment_status as string) ?? "unpaid",
      metadata: (data.metadata as Record<string, string>) ?? {},
      payment_intent:
        typeof data.payment_intent === "string" ? data.payment_intent : null,
      customer_email:
        typeof data.customer_email === "string" ? data.customer_email : null,
      amount_total:
        typeof data.amount_total === "number" ? data.amount_total : null,
    };
  } catch {
    return null;
  }
}

// ── Confirmation view ─────────────────────────────────────────────────────────

function ConfirmationView({
  order,
  quoteId,
}: {
  order: CabinetOrder;
  quoteId: string;
}) {
  const orderShort = order.id.substring(0, 8).toUpperCase();
  const leadTimeRange = `${order.estimated_lead_time_weeks - 1}–${order.estimated_lead_time_weeks + 1} weeks`;

  return (
    <>
      <div className="confirm-hero">
        <div className="confirm-icon">&#10003;</div>
        <h1>Deposit Received!</h1>
        <p className="muted">
          Your custom cabinets are now in the production queue.
          We&apos;ll send you updates at each milestone.
        </p>
        <span className="confirm-order-chip">Order #{orderShort}</span>
      </div>

      <div className="confirm-details-grid">
        <div className="confirm-detail-cell card">
          <span className="confirm-detail-label">Order Number</span>
          <span className="confirm-detail-value">#{orderShort}</span>
        </div>
        <div className="confirm-detail-cell card">
          <span className="confirm-detail-label">Status</span>
          <span className="confirm-detail-value" style={{ color: "#16a34a" }}>
            Deposit Paid
          </span>
        </div>
        <div className="confirm-detail-cell card">
          <span className="confirm-detail-label">Design</span>
          <span className="confirm-detail-value">
            {order.design_name || "Custom Cabinet"}
          </span>
        </div>
        <div className="confirm-detail-cell card">
          <span className="confirm-detail-label">Estimated Lead Time</span>
          <span className="confirm-detail-value">{leadTimeRange}</span>
        </div>
        <div className="confirm-detail-cell card">
          <span className="confirm-detail-label">Deposit Paid</span>
          <span className="confirm-detail-value">
            {formatCents(order.deposit_paid_cents)}
          </span>
        </div>
        <div className="confirm-detail-cell card">
          <span className="confirm-detail-label">Balance Due on Delivery</span>
          <span className="confirm-detail-value">
            {formatCents(order.total_price_cents - order.deposit_paid_cents)}
          </span>
        </div>
      </div>

      <div
        className="card"
        style={{ padding: "1.25rem", marginBottom: "1.5rem", background: "#f0fdf4", borderColor: "#bbf7d0" }}
      >
        <p style={{ margin: 0, fontSize: "0.88rem", color: "#166534" }}>
          <strong>What happens next:</strong> Our production team reviews your
          design within 1 business day and sends a confirmation email with your
          production schedule. The remaining balance of{" "}
          {formatCents(order.total_price_cents - order.deposit_paid_cents)} is
          due upon delivery.
        </p>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Link href={`/orders/${order.id}`} className="btn">
          Track Order
        </Link>
        <Link href={`/quote/${quoteId}`} className="btn secondary">
          View Original Quote
        </Link>
        <Link href="/design" className="btn secondary">
          Start Another Design
        </Link>
      </div>
    </>
  );
}

// ── Server action ─────────────────────────────────────────────────────────────

async function initiateCheckout(formData: FormData): Promise<void> {
  "use server";

  const quoteId = formData.get("quote_id") as string | null;
  const userId = formData.get("user_id") as string | null;
  const designId = formData.get("design_id") as string | null;
  const userEmail = formData.get("user_email") as string | null;

  if (!quoteId || !userId || !designId) {
    redirect(`/checkout/${quoteId ?? ""}?error=missing_data`);
    return;
  }

  // Validate all three disclaimer boxes are checked.
  const d1 = formData.get("disclaimer_design_reference") === "on";
  const d2 = formData.get("disclaimer_no_warranty") === "on";
  const d3 = formData.get("disclaimer_fabricator_indemnification") === "on";

  if (!d1 || !d2 || !d3) {
    redirect(`/checkout/${quoteId}?error=disclaimers_required`);
    return;
  }

  // Record disclaimer acknowledgment on the design.
  try {
    await recordDisclaimerAcknowledgment(designId);
  } catch (err) {
    console.error("[checkout] disclaimer acknowledgment failed:", err);
    // Non-fatal — proceed to payment.
  }

  const baseUrl =
    process.env.APP_BASE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");

  const successUrl = baseUrl
    ? `${baseUrl}/checkout/${quoteId}?status=success&session_id={CHECKOUT_SESSION_ID}`
    : `/checkout/${quoteId}?status=success&session_id={CHECKOUT_SESSION_ID}`;

  const cancelUrl = baseUrl
    ? `${baseUrl}/checkout/${quoteId}?error=cancelled`
    : `/checkout/${quoteId}?error=cancelled`;

  // Fetch quote for deposit amount.
  const quote = await getQuoteById(quoteId);
  if (!quote) {
    redirect(`/checkout/${quoteId}?error=quote_not_found`);
    return;
  }

  const result = await createStripeCheckoutSession(
    quoteId,
    quote.deposit_amount_cents,
    quote.design_name,
    userId,
    userEmail ?? "",
    successUrl,
    cancelUrl,
  );

  if (!result) {
    // Stripe not configured or error — fallback: go back with error.
    redirect(`/checkout/${quoteId}?error=stripe_unavailable`);
    return;
  }

  redirect(result.url);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: { quoteId: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { quoteId } = params;
  const status = typeof searchParams.status === "string" ? searchParams.status : null;
  const sessionId =
    typeof searchParams.session_id === "string" ? searchParams.session_id : null;
  const errorCode =
    typeof searchParams.error === "string" ? searchParams.error : null;

  // ── Confirmation branch ────────────────────────────────────────────────────
  if (status === "success" && sessionId) {
    let order: CabinetOrder | null = null;

    // Check if the webhook already created the order.
    try {
      order = await getOrderByStripeSession(sessionId);
    } catch {
      // Table might not exist yet on first run.
    }

    // Fallback: create order now if webhook hasn't fired (race condition guard).
    if (!order) {
      const stripeSession = await fetchStripeSession(sessionId);
      if (
        stripeSession &&
        stripeSession.payment_status === "paid" &&
        stripeSession.metadata.type === "cabinet_deposit" &&
        stripeSession.metadata.quote_id
      ) {
        const resolvedUserId =
          stripeSession.metadata.user_id ?? user.id;
        try {
          order = await createOrderFromQuote(
            stripeSession.metadata.quote_id,
            resolvedUserId,
            sessionId,
            stripeSession.payment_intent,
          );
        } catch {
          // If order creation fails here, continue with minimal confirmation.
        }
      }
    }

    const displayQuoteId = order?.quote_id ?? quoteId;

    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
        <main>
          {order ? (
            <ConfirmationView order={order} quoteId={displayQuoteId} />
          ) : (
            <>
              <h1>Payment Received</h1>
              <p className="muted">
                Your deposit has been processed. Your order is being finalized
                — you will receive a confirmation email shortly.
              </p>
              <div
                className="card"
                style={{ padding: "1.25rem", marginBottom: "1.5rem", background: "#f0fdf4", borderColor: "#bbf7d0" }}
              >
                <p style={{ margin: 0, fontSize: "0.88rem", color: "#166534" }}>
                  We&apos;re setting up your order. If your confirmation email
                  doesn&apos;t arrive within a few minutes, please contact us.
                </p>
              </div>
              <Link href="/design" className="btn">
                Back to My Designs
              </Link>
            </>
          )}
        </main>
      </>
    );
  }

  // ── Checkout form branch ───────────────────────────────────────────────────
  let quote: CabinetQuote | null = null;
  try {
    quote = await getQuoteById(quoteId);
  } catch {
    // Table may not exist yet on fresh deploy.
  }

  if (!quote) notFound();

  if (quote.status === "expired") {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
        <main>
          <div className="empty" style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
            <h2>This Quote Has Expired</h2>
            <p className="muted">
              Quotes are valid for 30 days. Please request a new quote.
            </p>
            <Link href={`/design/${quote.design_id}`} className="btn">
              Recalculate Quote
            </Link>
          </div>
        </main>
      </>
    );
  }

  if (quote.status === "ordered") {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
        <main>
          <div className="empty" style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
            <h2>This Quote Is Already Ordered</h2>
            <p className="muted">
              A deposit has already been paid for this quote.
            </p>
            <Link href="/design" className="btn">
              View My Designs
            </Link>
          </div>
        </main>
      </>
    );
  }

  const errorMessages: Record<string, string> = {
    disclaimers_required: "Please acknowledge all liability disclaimers before proceeding.",
    stripe_unavailable: "Payment processing is temporarily unavailable. Please try again shortly.",
    cancelled: "Payment was cancelled. You can try again below.",
    missing_data: "Something went wrong. Please refresh and try again.",
    quote_not_found: "This quote could not be found. Please contact support.",
  };

  const errorMessage = errorCode ? (errorMessages[errorCode] ?? "An error occurred.") : null;

  const depositFormatted = formatCents(quote.deposit_amount_cents);
  const totalFormatted = formatCents(quote.total_sell_price_cents);
  const balanceFormatted = formatCents(
    quote.total_sell_price_cents - quote.deposit_amount_cents,
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
      <main>
        {/* Progress indicator */}
        <div className="progress-bar">
          <div className="progress-step done">
            <div className="progress-dot">&#10003;</div>
            <span>Design</span>
          </div>
          <div className="progress-connector" />
          <div className="progress-step done">
            <div className="progress-dot">&#10003;</div>
            <span>Quote</span>
          </div>
          <div className="progress-connector" />
          <div className="progress-step active">
            <div className="progress-dot">3</div>
            <span>Deposit</span>
          </div>
          <div className="progress-connector" />
          <div className="progress-step">
            <div className="progress-dot">4</div>
            <span>Production</span>
          </div>
        </div>

        <h1>Complete Your 50% Deposit</h1>
        <p className="muted">
          Review and acknowledge the liability disclosures below, then proceed
          to our secure Stripe checkout to pay your deposit.
        </p>

        {errorMessage && (
          <div
            className="card"
            style={{
              padding: "0.9rem 1.1rem",
              marginBottom: "1.25rem",
              background: "#fef2f2",
              borderColor: "#fca5a5",
              color: "#991b1b",
              fontSize: "0.88rem",
            }}
          >
            {errorMessage}
          </div>
        )}

        <div className="checkout-layout">
          {/* Left column: disclaimers + form */}
          <div>
            <form id="main-checkout-form" action={initiateCheckout}>
              {/* Hidden fields */}
              <input type="hidden" name="quote_id" value={quote.id} />
              <input type="hidden" name="user_id" value={user.id} />
              <input type="hidden" name="design_id" value={quote.design_id} />
              <input type="hidden" name="user_email" value={user.email} />

              {/* Liability disclaimers */}
              <p className="section-heading">Required Disclosures</p>
              <div className="disclaimer-card">
                <div className="disclaimer-item">
                  <input
                    type="checkbox"
                    id="disclaimer_design_reference"
                    name="disclaimer_design_reference"
                    className="disclaimer-check"
                    required
                  />
                  <label htmlFor="disclaimer_design_reference" className="disclaimer-text">
                    <strong>Design for Reference Only:</strong> The 3D renderings
                    and dimensions provided are for visualization purposes. Final
                    cabinet dimensions are determined during fabrication and may
                    vary slightly to accommodate materials and joinery tolerances.
                    I understand this design is not a certified structural drawing.
                  </label>
                </div>

                <div className="disclaimer-item">
                  <input
                    type="checkbox"
                    id="disclaimer_no_warranty"
                    name="disclaimer_no_warranty"
                    className="disclaimer-check"
                    required
                  />
                  <label htmlFor="disclaimer_no_warranty" className="disclaimer-text">
                    <strong>No Warranty of Fitness for a Particular Purpose:</strong>{" "}
                    Cabinets are fabricated to the specification provided and are
                    warranted against manufacturing defects for 1 year. No warranty
                    is made that the cabinets will fit a specific space not
                    professionally measured, nor for use-cases not disclosed at
                    the time of order.
                  </label>
                </div>

                <div className="disclaimer-item">
                  <input
                    type="checkbox"
                    id="disclaimer_fabricator_indemnification"
                    name="disclaimer_fabricator_indemnification"
                    className="disclaimer-check"
                    required
                  />
                  <label
                    htmlFor="disclaimer_fabricator_indemnification"
                    className="disclaimer-text"
                  >
                    <strong>Fabricator Indemnification Notice:</strong> By placing
                    this order I agree to indemnify and hold harmless the fabricator
                    from claims arising from improper installation, unauthorized
                    modifications, or use outside the intended residential /
                    light-commercial scope. Installation must comply with all
                    applicable local building codes.
                  </label>
                </div>
              </div>

              {/* Trust badges */}
              <div className="trust-row">
                <span className="trust-badge">&#10003; CARB Compliant Materials</span>
                <span className="trust-badge">&#10003; Licensed Fabricators</span>
                <span className="trust-badge">&#10003; 30-Day Quote Validity</span>
                <span className="trust-badge">&#10003; Secure Stripe Checkout</span>
              </div>

              {/* Submit button inside the form so it submits this form */}
              <button
                type="submit"
                className="pay-btn"
                style={{ marginTop: "1.75rem" }}
              >
                Pay {depositFormatted} Deposit &rarr;
              </button>
            </form>
          </div>

          {/* Right column: order summary sidebar */}
          <div className="checkout-sidebar">
            <div className="sidebar-card">
              <p className="sidebar-title">Order Summary</p>

              <div className="price-row">
                <span className="price-row-label">
                  {quote.design_name || "Custom Cabinet"}
                </span>
                <span className="price-row-value">{totalFormatted}</span>
              </div>

              <div className="price-row">
                <span className="price-row-label muted" style={{ fontSize: "0.8rem" }}>
                  Quote #{quoteId.substring(0, 8).toUpperCase()}
                </span>
                <span className="price-row-value muted" style={{ fontSize: "0.8rem" }}>
                  &nbsp;
                </span>
              </div>

              <div className="deposit-total-block">
                <span className="deposit-total-label">Due Today (50% Deposit)</span>
                <span className="deposit-total-amount">{depositFormatted}</span>
                <span className="deposit-total-sub">
                  Remaining {balanceFormatted} due upon delivery
                </span>
              </div>

              <p
                style={{
                  fontSize: "0.75rem",
                  color: "#888",
                  margin: "0.75rem 0",
                }}
              >
                &#9432; Acknowledge all disclaimers on the left, then click the
                button below to pay securely via Stripe.
              </p>
              {/* form attribute links this button to the main checkout form */}
              <button
                type="submit"
                form="main-checkout-form"
                className="pay-btn"
              >
                Pay {depositFormatted} Deposit
              </button>

              <p className="stripe-note">
                Secured by Stripe &mdash; your card details are never stored
                on our servers.
              </p>

              <div
                style={{
                  borderTop: "1px solid #f3f4f6",
                  paddingTop: "1rem",
                  marginTop: "1rem",
                  fontSize: "0.78rem",
                  color: "#888",
                }}
              >
                <p style={{ margin: "0 0 0.4rem" }}>
                  <strong style={{ color: "#555" }}>Lead Time:</strong> 6–8 weeks
                  from deposit
                </p>
                <p style={{ margin: 0 }}>
                  <strong style={{ color: "#555" }}>Questions?</strong>{" "}
                  <a
                    href="mailto:orders@example.com"
                    style={{ color: "#888" }}
                  >
                    orders@example.com
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
