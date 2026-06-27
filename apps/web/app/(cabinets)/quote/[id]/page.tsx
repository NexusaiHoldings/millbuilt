import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/admin-auth";
import { getQuoteById, generateQuote, type CabinetQuote, type QuoteLine } from "@/lib/cabinets/quote-engine";
import { getMaterialById } from "@/lib/cabinets/materials-catalogue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return {
    title: `Cabinet Quote — ${params.id.substring(0, 8).toUpperCase()}`,
    description: "Your custom cabinet quote with detailed pricing breakdown.",
  };
}

const PAGE_STYLES = `
.quote-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  align-items: start;
}
@media (max-width: 860px) {
  .quote-layout { grid-template-columns: 1fr; }
}
.quote-summary-col {}
.quote-pricing-col {}
.quote-header { margin-bottom: 2rem; }
.quote-header h1 { margin-bottom: 0.25rem; }
.quote-meta-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}
.quote-meta-chip {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #666;
  background: #f3f4f6;
  border-radius: 4px;
  padding: 0.2rem 0.6rem;
}
.dim-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.75rem;
}
.dim-cell {
  background: #fafaf9;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  text-align: center;
}
.dim-cell-label {
  display: block;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #999;
  margin-bottom: 0.3rem;
}
.dim-cell-value {
  font-size: 1.2rem;
  font-weight: 700;
  color: #111;
}
.materials-section { margin-bottom: 1.75rem; }
.materials-section h2 { font-size: 1rem; margin-bottom: 0.75rem; }
.mat-swatch-row { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.mat-swatch {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.5rem 0.85rem 0.5rem 0.5rem;
  background: #fff;
  font-size: 0.85rem;
}
.mat-swatch-img {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  object-fit: cover;
  background: #e5e7eb;
  flex-shrink: 0;
}
.mat-swatch-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  background: linear-gradient(135deg, #d1d5db 0%, #9ca3af 100%);
  flex-shrink: 0;
}
.mat-swatch-info {}
.mat-swatch-cat {
  display: block;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #aaa;
  margin-bottom: 0.1rem;
}
.mat-swatch-name { font-weight: 600; color: #111; }
.pricing-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.75rem;
  background: #fff;
}
.total-price-block { margin-bottom: 1.5rem; text-align: center; }
.total-price-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #888;
  margin-bottom: 0.4rem;
}
.total-price-amount {
  font-size: 2.8rem;
  font-weight: 800;
  color: #111;
  letter-spacing: -0.02em;
}
.total-price-validity {
  display: block;
  font-size: 0.75rem;
  color: #aaa;
  margin-top: 0.35rem;
}
.deposit-cta {
  display: block;
  width: 100%;
  text-align: center;
  background: #b45309;
  color: #fff;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  padding: 0.9rem 1.5rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  text-decoration: none;
  margin-bottom: 1.25rem;
  transition: background 0.15s;
}
.deposit-cta:hover { background: #92400e; color: #fff; }
.deposit-subtext {
  text-align: center;
  font-size: 0.78rem;
  color: #888;
  margin-bottom: 1.5rem;
}
.whats-included-details {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}
.whats-included-summary {
  padding: 0.85rem 1rem;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  list-style: none;
  user-select: none;
  background: #fafaf9;
  border-bottom: 1px solid transparent;
}
.whats-included-details[open] .whats-included-summary {
  border-bottom-color: #e5e7eb;
}
.whats-included-summary::-webkit-details-marker { display: none; }
.whats-included-summary::before {
  content: '▶';
  font-size: 0.6rem;
  margin-right: 0.5rem;
  transition: transform 0.15s;
  display: inline-block;
}
.whats-included-details[open] .whats-included-summary::before {
  transform: rotate(90deg);
}
.line-items-list { padding: 0; margin: 0; list-style: none; }
.line-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #f3f4f6;
}
.line-item:last-child { border-bottom: none; }
.line-item-left {}
.line-item-label { font-weight: 600; font-size: 0.88rem; display: block; margin-bottom: 0.15rem; }
.line-item-desc { font-size: 0.78rem; color: #888; }
.line-item-amount { font-weight: 700; font-size: 0.95rem; white-space: nowrap; flex-shrink: 0; }
.expired-state { text-align: center; padding: 3rem 1.5rem; }
.expired-state h2 { margin-bottom: 0.5rem; }
.expired-state p { margin-bottom: 1.5rem; }
.back-link { font-size: 0.85rem; color: #888; text-decoration: none; }
.back-link:hover { color: #333; }
`;

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

interface MaterialInfo {
  id: string;
  name: string;
  category: string;
  finish_image_url: string | null;
}

export default async function QuotePage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let quote: CabinetQuote | null = null;
  try {
    quote = await getQuoteById(params.id);
  } catch {
    // Table may not exist yet
  }

  if (!quote) {
    // Try treating params.id as a design_id and auto-generating
    try {
      quote = await generateQuote(params.id);
    } catch {
      // ignore
    }
    if (!quote) notFound();
  }

  // Expired state
  if (quote.status === "expired") {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
        <main>
          <div className="expired-state empty">
            <h2>This Quote Has Expired</h2>
            <p className="muted">
              Quotes are valid for 30 days. This one expired on{" "}
              {formatDate(quote.expires_at)}.
            </p>
            <Link href={`/design/${quote.design_id}`} className="btn">
              Recalculate Quote
            </Link>
            <p style={{ marginTop: "1rem" }}>
              <Link href="/design" className="back-link">
                ← Back to My Designs
              </Link>
            </p>
          </div>
        </main>
      </>
    );
  }

  // Parse line items
  let lineItems: QuoteLine[] = [];
  try {
    lineItems =
      typeof quote.line_items_json === "string"
        ? (JSON.parse(quote.line_items_json) as QuoteLine[])
        : [];
  } catch {
    lineItems = [];
  }

  // Parse dimensions
  let dimensions = { width: 0, height: 0, depth: 0 };
  try {
    const parsed =
      typeof quote.dimensions_json === "string"
        ? JSON.parse(quote.dimensions_json)
        : quote.dimensions_json;
    if (parsed && typeof parsed === "object") {
      dimensions = parsed as { width: number; height: number; depth: number };
    }
  } catch {
    // keep defaults
  }

  // Fetch material display info
  const materialIds = [
    quote.wood_species_material_id,
    quote.door_style_material_id,
    quote.hardware_material_id,
  ].filter((v): v is string => v !== null && v !== undefined);

  const materialInfoMap: Record<string, MaterialInfo> = {};
  await Promise.allSettled(
    materialIds.map(async (mid) => {
      const mat = await getMaterialById(mid);
      if (mat) materialInfoMap[mid] = mat as MaterialInfo;
    })
  );

  const woodInfo = quote.wood_species_material_id
    ? materialInfoMap[quote.wood_species_material_id]
    : null;
  const doorInfo = quote.door_style_material_id
    ? materialInfoMap[quote.door_style_material_id]
    : null;
  const hwInfo = quote.hardware_material_id
    ? materialInfoMap[quote.hardware_material_id]
    : null;

  const selectedMaterials: { info: MaterialInfo; categoryLabel: string }[] = [
    woodInfo ? { info: woodInfo, categoryLabel: "Wood Species" } : null,
    doorInfo ? { info: doorInfo, categoryLabel: "Door Style" } : null,
    hwInfo ? { info: hwInfo, categoryLabel: "Hardware" } : null,
  ].filter((v): v is { info: MaterialInfo; categoryLabel: string } => v !== null);

  const validUntil = formatDate(quote.expires_at);
  const createdOn = formatDate(quote.created_at);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
      <main>
        {/* Page header */}
        <div className="quote-header">
          <h1>{quote.design_name || "Custom Cabinet Quote"}</h1>
          <p className="muted">
            Your personalized quote — prepared {createdOn}
          </p>
          <div className="quote-meta-row">
            <span className="quote-meta-chip">Quote #{params.id.substring(0, 8).toUpperCase()}</span>
            <span className="quote-meta-chip">Valid until {validUntil}</span>
            <span className="quote-meta-chip" style={{ background: "#e6f4ea", color: "#1b5e1f" }}>
              Active
            </span>
          </div>
        </div>

        <div className="quote-layout">
          {/* Left column: design summary */}
          <div className="quote-summary-col">
            <h2>Design Summary</h2>

            {/* Cabinet dimensions */}
            <div className="dim-grid">
              {(
                [
                  ["Width", `${dimensions.width}"`],
                  ["Height", `${dimensions.height}"`],
                  ["Depth", `${dimensions.depth}"`],
                ] as [string, string][]
              ).map(([label, val]) => (
                <div key={label} className="dim-cell card">
                  <span className="dim-cell-label">{label}</span>
                  <span className="dim-cell-value">{val}</span>
                </div>
              ))}
            </div>

            {/* Selected materials */}
            {selectedMaterials.length > 0 && (
              <div className="materials-section">
                <h2>Selected Materials & Finishes</h2>
                <div className="mat-swatch-row">
                  {selectedMaterials.map(({ info, categoryLabel }) => (
                    <div key={info.id} className="mat-swatch">
                      {info.finish_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={info.finish_image_url}
                          alt={`${info.name} finish`}
                          className="mat-swatch-img"
                        />
                      ) : (
                        <div className="mat-swatch-placeholder" />
                      )}
                      <div className="mat-swatch-info">
                        <span className="mat-swatch-cat">{categoryLabel}</span>
                        <span className="mat-swatch-name">{info.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedMaterials.length === 0 && (
              <div className="empty" style={{ padding: "1.25rem" }}>
                <p className="muted">No specific materials selected — standard grade used.</p>
              </div>
            )}

            {/* Craftsmanship note */}
            <div className="card" style={{ padding: "1.25rem", marginTop: "1rem" }}>
              <h3 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>
                Our Craftsmanship Promise
              </h3>
              <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
                Every cabinet is custom-built to your exact specifications in our
                shop. We use solid wood dovetail joinery, soft-close hardware, and
                multiple finish coats. Lead time is typically 6–8 weeks from deposit.
              </p>
            </div>
          </div>

          {/* Right column: pricing */}
          <div className="quote-pricing-col">
            <div className="pricing-card">
              <div className="total-price-block">
                <span className="total-price-label">Total Project Price</span>
                <span className="total-price-amount">
                  {formatCents(quote.total_sell_price_cents)}
                </span>
                <span className="total-price-validity">
                  Valid until {validUntil} · No obligation
                </span>
              </div>

              <a
                href={`/design/${quote.design_id}/order?quote=${quote.id}`}
                className="deposit-cta"
              >
                Pay 50% Deposit to Order —{" "}
                {formatCents(quote.deposit_amount_cents)}
              </a>

              <p className="deposit-subtext">
                Remaining {formatCents(quote.total_sell_price_cents - quote.deposit_amount_cents)} due
                upon delivery. Secure checkout powered by Stripe.
              </p>

              {/* What's included accordion */}
              <details className="whats-included-details">
                <summary className="whats-included-summary">
                  What&apos;s included in your price
                </summary>
                <ul className="line-items-list">
                  {lineItems.map((item, idx) => (
                    <li key={idx} className="line-item">
                      <div className="line-item-left">
                        <span className="line-item-label">{item.label}</span>
                        <span className="line-item-desc">{item.description}</span>
                      </div>
                      <span className="line-item-amount">
                        {formatCents(item.amount_cents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>

            {/* Secondary actions */}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
              <Link href={`/design/${quote.design_id}`} className="btn secondary">
                Edit Design
              </Link>
              <Link href="/design" className="btn secondary">
                New Design
              </Link>
            </div>

            <p style={{ marginTop: "1.25rem", fontSize: "0.78rem", color: "#aaa" }}>
              Questions? Contact us at{" "}
              <a href="mailto:quotes@example.com" style={{ color: "#888" }}>
                quotes@example.com
              </a>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
