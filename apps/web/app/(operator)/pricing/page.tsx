import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin-auth";
import {
  getPricingConfig,
  getFreightRates,
  upsertPricingConfig,
  upsertFreightRate,
  deleteFreightRate,
  logPricingAudit,
  computeBreakEven,
  type PricingConfig,
  type FreightRate,
} from "@/lib/cabinets/pricing-rules";

export const metadata: Metadata = {
  title: "Pricing Rules — Operator",
  description:
    "Configure margin multiplier, freight rates by state, and minimum order value.",
};

const PAGE_STYLES = `
.pricing-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-top: 1.5rem;
}
@media (max-width: 860px) {
  .pricing-grid { grid-template-columns: 1fr; }
}
.section-card {
  border: 1px solid #d8cfc3;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
}
.section-card h2 { margin: 0 0 0.25rem; font-size: 1rem; }
.section-card p  { margin: 0 0 1rem; }
.calc-panel {
  background: #f5ede3;
  border: 1px solid #c9a87c;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  margin-top: 1.5rem;
}
.calc-panel h2 { margin: 0 0 0.75rem; font-size: 1rem; }
.calc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.4rem 0;
  border-bottom: 1px solid #ddd3c0;
}
.calc-row:last-child { border-bottom: none; }
.calc-label  { font-size: 0.85rem; color: #555; }
.calc-value  { font-size: 0.9rem; font-weight: 600; }
.calc-value.highlight { color: #7a5020; font-size: 1rem; }
.freight-table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; }
.freight-table th { text-align: left; font-size: 0.78rem; padding: 0.4rem 0.5rem;
  background: #f5f0e8; border-bottom: 1px solid #d8cfc3; }
.freight-table td { font-size: 0.83rem; padding: 0.4rem 0.5rem;
  border-bottom: 1px solid #ede8e0; vertical-align: middle; }
.freight-table tr:last-child td { border-bottom: none; }
.freight-add-row { display: flex; gap: 0.5rem; margin-top: 0.75rem; flex-wrap: wrap; }
.freight-add-row input { flex: 1; min-width: 80px; }
.field-group { margin-bottom: 0.9rem; }
.field-group label { display: block; font-size: 0.82rem; font-weight: 600; margin-bottom: 0.3rem; }
.hint { font-size: 0.77rem; color: #888; margin-top: 0.2rem; }
.form-actions { margin-top: 1rem; display: flex; gap: 0.5rem; }
`;

const CALC_SCRIPT = `
(function() {
  var multInput  = document.getElementById('margin_multiplier');
  var minInput   = document.getElementById('min_order_value_dollars');
  var pctEl      = document.getElementById('calc-margin-pct');
  var breakEvenEl = document.getElementById('calc-breakeven');
  var markupEl   = document.getElementById('calc-markup');

  function update() {
    var mult = parseFloat(multInput ? multInput.value : '0') || 0;
    var minDollars = parseFloat(minInput ? minInput.value : '0') || 0;
    var pct = mult > 0 ? ((1 - 1/mult) * 100) : 0;
    var markup = mult > 0 ? ((mult - 1) * 100) : 0;
    var breakEven = pct > 0 ? (minDollars / (pct / 100)) : 0;
    if (pctEl) pctEl.textContent = pct.toFixed(1) + '%';
    if (markupEl) markupEl.textContent = markup.toFixed(1) + '%';
    if (breakEvenEl) breakEvenEl.textContent = '$' + breakEven.toFixed(2);
  }

  if (multInput) multInput.addEventListener('input', update);
  if (minInput) minInput.addEventListener('input', update);
  update();
})();
`;

function dollarFromCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function PricingConfigForm({
  config,
  saveConfigAction,
}: {
  config: PricingConfig | null;
  saveConfigAction: (fd: FormData) => Promise<void>;
}) {
  const mult = config?.margin_multiplier ?? 1.45;
  const minCents = config?.min_order_value_cents ?? 50000;
  const minDollars = (minCents / 100).toFixed(2);

  return (
    <div className="section-card">
      <h2>Margin &amp; Order Settings</h2>
      <p className="muted">
        Margin multiplier is applied to unit cost to produce the customer selling
        price. Minimum order value is the floor before freight.
      </p>
      <form action={saveConfigAction}>
        <div className="field-group">
          <label htmlFor="margin_multiplier">Margin Multiplier</label>
          <input
            id="margin_multiplier"
            type="number"
            name="margin_multiplier"
            step="0.0001"
            min="1"
            max="10"
            defaultValue={mult}
            required
          />
          <div className="hint">
            e.g. 1.45 = 45% gross margin / 45% markup on cost
          </div>
        </div>
        <div className="field-group">
          <label htmlFor="min_order_value_dollars">
            Minimum Order Value (dollars)
          </label>
          <input
            id="min_order_value_dollars"
            type="number"
            name="min_order_value_dollars"
            step="0.01"
            min="0"
            defaultValue={minDollars}
            required
          />
          <div className="hint">
            Orders below this value will be rejected at checkout.
          </div>
        </div>
        <div className="field-group">
          <label htmlFor="notes">Internal Notes</label>
          <input
            id="notes"
            type="text"
            name="notes"
            defaultValue={config?.notes ?? ""}
            placeholder="Optional notes for this pricing revision"
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn">
            Save Pricing Config
          </button>
        </div>
      </form>
    </div>
  );
}

function FreightRatesPanel({
  rates,
  addRateAction,
  deleteRateAction,
}: {
  rates: FreightRate[];
  addRateAction: (fd: FormData) => Promise<void>;
  deleteRateAction: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="section-card">
      <h2>Freight Rates by State</h2>
      <p className="muted">
        Per-order freight cost added at checkout based on the shipping state.
        Stored in cents.
      </p>

      {rates.length > 0 ? (
        <table className="freight-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>State</th>
              <th>Rate</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.state_code}</strong>
                </td>
                <td>{r.state_name}</td>
                <td>{dollarFromCents(r.rate_cents)}</td>
                <td>
                  <form action={deleteRateAction} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      className="btn secondary"
                      style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}
                    >
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          No freight rates configured. Add a state below.
        </p>
      )}

      <form action={addRateAction}>
        <div
          className="freight-add-row"
          style={{ alignItems: "flex-end", marginTop: "1rem" }}
        >
          <div style={{ flex: "0 0 60px" }}>
            <label
              htmlFor="new-state-code"
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                display: "block",
                marginBottom: "0.25rem",
              }}
            >
              Code
            </label>
            <input
              id="new-state-code"
              type="text"
              name="state_code"
              maxLength={2}
              placeholder="CA"
              required
            />
          </div>
          <div style={{ flex: "1" }}>
            <label
              htmlFor="new-state-name"
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                display: "block",
                marginBottom: "0.25rem",
              }}
            >
              State Name
            </label>
            <input
              id="new-state-name"
              type="text"
              name="state_name"
              placeholder="California"
              required
            />
          </div>
          <div style={{ flex: "0 0 130px" }}>
            <label
              htmlFor="new-rate"
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                display: "block",
                marginBottom: "0.25rem",
              }}
            >
              Rate (cents)
            </label>
            <input
              id="new-rate"
              type="number"
              name="rate_cents"
              min="0"
              placeholder="e.g. 5000"
              required
            />
          </div>
          <div style={{ flexShrink: 0 }}>
            <button type="submit" className="btn">
              Add / Update
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default async function OperatorPricingPage() {
  const user = await getAdminUser();
  if (!user) redirect("/login");

  let config: PricingConfig | null = null;
  let rates: FreightRate[] = [];

  try {
    [config, rates] = await Promise.all([getPricingConfig(), getFreightRates()]);
  } catch {
    // Tables not ready yet — show form with defaults
  }

  const mult = config?.margin_multiplier ?? 1.45;
  const minCents = config?.min_order_value_cents ?? 50000;
  const { grossMarginPct, breakEvenRevenueCents } = computeBreakEven(
    mult,
    minCents
  );

  async function handleSaveConfig(formData: FormData) {
    "use server";
    const admin = await getAdminUser();
    if (!admin) redirect("/login");

    const multVal = parseFloat(
      (formData.get("margin_multiplier") as string) ?? "1.45"
    );
    const minDollars = parseFloat(
      (formData.get("min_order_value_dollars") as string) ?? "500"
    );
    const notes = (formData.get("notes") as string) || null;

    const saved = await upsertPricingConfig(
      {
        margin_multiplier: isNaN(multVal) ? 1.45 : multVal,
        min_order_value_cents: isNaN(minDollars)
          ? 50000
          : Math.round(minDollars * 100),
        notes,
      },
      admin.id
    );

    await logPricingAudit(
      admin.id,
      "pricing_config.updated",
      "cabinet_pricing_config",
      saved.id,
      {
        margin_multiplier: saved.margin_multiplier,
        min_order_value_cents: saved.min_order_value_cents,
      }
    );

    redirect("/pricing");
  }

  async function handleAddRate(formData: FormData) {
    "use server";
    const admin = await getAdminUser();
    if (!admin) redirect("/login");

    const stateCode = (
      (formData.get("state_code") as string) ?? ""
    ).toUpperCase();
    const stateName = (formData.get("state_name") as string) ?? "";
    const rateCents = parseInt(
      (formData.get("rate_cents") as string) ?? "0",
      10
    );

    const saved = await upsertFreightRate({
      state_code: stateCode,
      state_name: stateName,
      rate_cents: isNaN(rateCents) ? 0 : rateCents,
    });

    await logPricingAudit(
      admin.id,
      "freight_rate.upserted",
      "cabinet_freight_rate",
      saved.id,
      { state_code: stateCode, rate_cents: rateCents }
    );

    redirect("/pricing");
  }

  async function handleDeleteRate(formData: FormData) {
    "use server";
    const admin = await getAdminUser();
    if (!admin) redirect("/login");

    const id = (formData.get("id") as string) ?? "";
    await deleteFreightRate(id);

    await logPricingAudit(
      admin.id,
      "freight_rate.deleted",
      "cabinet_freight_rate",
      id,
      {}
    );

    redirect("/pricing");
  }

  const lastUpdated = config
    ? new Date(config.updated_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
      <main>
        <h1>Pricing Rules — Operator</h1>
        <p>
          Configure margin multiplier, minimum order value, and freight rates by
          state. All cost data is operator-only and never returned to
          customer-facing routes. Changes are recorded in the audit log.
          {lastUpdated && (
            <span className="muted"> Last updated: {lastUpdated}.</span>
          )}
        </p>

        <div className="pricing-grid">
          <PricingConfigForm
            config={config}
            saveConfigAction={handleSaveConfig}
          />
          <FreightRatesPanel
            rates={rates}
            addRateAction={handleAddRate}
            deleteRateAction={handleDeleteRate}
          />
        </div>

        <div className="calc-panel">
          <h2>Live Margin Calculator</h2>
          <div className="calc-row">
            <span className="calc-label">Gross Margin %</span>
            <span className="calc-value highlight" id="calc-margin-pct">
              {grossMarginPct.toFixed(1)}%
            </span>
          </div>
          <div className="calc-row">
            <span className="calc-label">Markup on Cost %</span>
            <span className="calc-value" id="calc-markup">
              {mult > 0 ? ((mult - 1) * 100).toFixed(1) : "0.0"}%
            </span>
          </div>
          <div className="calc-row">
            <span className="calc-label">
              Break-Even Revenue (to recover min order value at current margin)
            </span>
            <span className="calc-value highlight" id="calc-breakeven">
              {dollarFromCents(breakEvenRevenueCents)}
            </span>
          </div>
          <div className="calc-row">
            <span className="calc-label">Current Min Order Value</span>
            <span className="calc-value">{dollarFromCents(minCents)}</span>
          </div>
          <div className="calc-row">
            <span className="calc-label">Current Multiplier</span>
            <span className="calc-value">{mult.toFixed(4)}×</span>
          </div>
          <p
            className="muted"
            style={{ fontSize: "0.78rem", marginTop: "0.75rem", marginBottom: 0 }}
          >
            Calculator updates live as you edit the form above. Formula: Gross
            Margin = 1 − (1 ÷ multiplier). Break-even = min order value ÷ gross
            margin %.
          </p>
        </div>

        <script
          dangerouslySetInnerHTML={{ __html: CALC_SCRIPT }}
        />
      </main>
    </>
  );
}
