import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin-auth";
import {
  getOrderReviewData,
  dispatchOrderToPartner,
  requestDesignRevision,
  escalateToEngineering,
} from "@/lib/cabinets/partner-dispatch";

export const metadata: Metadata = {
  title: "Order Review — Operator",
  description: "Review cut list and dispatch order to manufacturing partner.",
};

const PAGE_STYLES = `
.review-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.5rem;
  margin-top: 1.5rem;
}
@media (max-width: 900px) {
  .review-grid { grid-template-columns: 1fr; }
}
.section-card {
  border: 1px solid #d8cfc3;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.25rem;
}
.section-card h2 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}
.section-card h3 {
  margin: 0 0 0.35rem;
  font-size: 0.9rem;
}
.kv-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}
.kv-label { color: #666; font-weight: 600; white-space: nowrap; }
.kv-value { color: #111; }
.cut-list-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  margin-top: 0.75rem;
}
.cut-list-table th {
  text-align: left;
  padding: 0.35rem 0.5rem;
  background: #f5f0e8;
  border-bottom: 1px solid #d8cfc3;
  font-size: 0.73rem;
  white-space: nowrap;
}
.cut-list-table td {
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid #ede8e0;
  vertical-align: top;
}
.cut-list-table tr:last-child td { border-bottom: none; }
.rule-row {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid #ede8e0;
  font-size: 0.83rem;
}
.rule-row:last-child { border-bottom: none; }
.rule-badge {
  flex-shrink: 0;
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
}
.rule-pass { background: #d1fae5; color: #065f46; }
.rule-warn { background: #fef3c7; color: #92400e; }
.rule-fail { background: #fee2e2; color: #991b1b; }
.checklist-item {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  margin-bottom: 0.65rem;
  font-size: 0.85rem;
}
.checklist-item input[type="checkbox"] { margin-top: 0.15rem; flex-shrink: 0; }
.checklist-label { line-height: 1.4; }
.checklist-sub { font-size: 0.75rem; color: #777; margin-top: 0.15rem; }
.action-panel { display: flex; flex-direction: column; gap: 1rem; }
.action-form { display: flex; flex-direction: column; gap: 0.5rem; }
.action-form select,
.action-form textarea { width: 100%; }
.action-form textarea { resize: vertical; min-height: 64px; }
.status-pill {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
}
.status-deposit_paid  { background: #fef3c7; color: #92400e; }
.status-in_production { background: #d1fae5; color: #065f46; }
.status-ready         { background: #dbeafe; color: #1e40af; }
.status-delivered     { background: #e0e7ff; color: #3730a3; }
.status-cancelled     { background: #fee2e2; color: #991b1b; }
.ack-badge {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  background: #d1fae5;
  color: #065f46;
}
.no-ack-badge {
  background: #fee2e2;
  color: #991b1b;
}
.partner-card {
  border: 1px solid #d8cfc3;
  border-radius: 6px;
  padding: 0.65rem 0.85rem;
  font-size: 0.82rem;
  margin-bottom: 0.5rem;
}
.partner-card strong { display: block; margin-bottom: 0.2rem; }
.review-history-item {
  padding: 0.4rem 0;
  border-bottom: 1px solid #ede8e0;
  font-size: 0.8rem;
}
.review-history-item:last-child { border-bottom: none; }
.action-badge {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
  margin-right: 0.35rem;
}
.action-approved { background: #d1fae5; color: #065f46; }
.action-revision_requested { background: #fef3c7; color: #92400e; }
.action-escalated_to_engineering { background: #fee2e2; color: #991b1b; }
.back-link { font-size: 0.82rem; margin-bottom: 1rem; display: inline-block; }
.validation-summary {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
}
.overall-pass { color: #065f46; font-weight: 700; }
.overall-warn { color: #92400e; font-weight: 700; }
.overall-fail { color: #991b1b; font-weight: 700; }
.alert-box {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}
.alert-warn { background: #fffbeb; border: 1px solid #f59e0b; color: #78350f; }
.alert-fail { background: #fef2f2; border: 1px solid #ef4444; color: #991b1b; }
`;

function fmtCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface PageProps {
  params: { id: string };
}

export default async function OrderReviewPage({ params }: PageProps) {
  const user = await getAdminUser();
  if (!user) redirect("/login");

  const data = await getOrderReviewData(params.id);
  if (!data) notFound();

  const { order, design, cut_list, validation, active_partners, past_reviews } = data;

  const dims = design?.dimensions;
  const isAlreadyReviewed = order.status !== "deposit_paid";

  // ── Server actions ────────────────────────────────────────────────────────

  async function handleApprove(formData: FormData) {
    "use server";
    const admin = await getAdminUser();
    if (!admin) redirect("/login");

    const partnerId = (formData.get("partner_id") as string) ?? "";
    const notes = (formData.get("notes") as string) || null;

    if (!partnerId) return;

    await dispatchOrderToPartner(params.id, partnerId, admin.id, notes);
    redirect(`/orders?status=in_production`);
  }

  async function handleRevision(formData: FormData) {
    "use server";
    const admin = await getAdminUser();
    if (!admin) redirect("/login");

    const notes = (formData.get("notes") as string) || null;
    const reData = await getOrderReviewData(params.id);
    if (!reData) redirect("/operator/orders");

    await requestDesignRevision(
      params.id,
      admin.id,
      reData.order.user_id,
      reData.order.design_name,
      notes,
    );
    redirect(`/orders?status=deposit_paid`);
  }

  async function handleEscalate(formData: FormData) {
    "use server";
    const admin = await getAdminUser();
    if (!admin) redirect("/login");

    const notes = (formData.get("notes") as string) || null;
    const reData = await getOrderReviewData(params.id);
    if (!reData) redirect("/operator/orders");

    await escalateToEngineering(
      params.id,
      admin.id,
      reData.order.design_name,
      notes,
    );
    redirect(`/orders?status=deposit_paid`);
  }

  const validationFails = validation?.rules.filter((r) => r.status === "fail") ?? [];
  const validationWarns = validation?.rules.filter((r) => r.status === "warn") ?? [];

  const carbCompliant =
    !validation ||
    validation.rules.every(
      (r) => !(r.rule_id === "carb_compliance" && r.status === "fail"),
    );

  const dimensionsOk = dims
    ? dims.width >= 9 &&
      dims.width <= 60 &&
      dims.height >= 12 &&
      dims.height <= 96 &&
      dims.depth >= 12 &&
      dims.depth <= 30
    : false;

  const structuralOk = validationFails.length === 0;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
      <main>
        <a href="/orders" className="back-link btn secondary">
          &larr; Back to Order Queue
        </a>

        <h1>Order Review: {order.design_name || "Untitled Design"}</h1>
        <p>
          Review the cut list, design validation, and compliance checklist before
          dispatching this order to a manufacturing partner.
          Order received {fmtDate(order.created_at)}.
        </p>

        {isAlreadyReviewed && (
          <div className="alert-box alert-warn">
            This order has already been actioned (status:{" "}
            <strong>{order.status}</strong>). Review-only mode.
          </div>
        )}

        {validationFails.length > 0 && (
          <div className="alert-box alert-fail">
            <strong>{validationFails.length} validation failure(s)</strong> detected.
            Approval is not recommended until failures are resolved.
          </div>
        )}

        <div className="review-grid">
          {/* Left column: order data */}
          <div>
            {/* Order summary */}
            <div className="section-card">
              <h2>Order Summary</h2>
              <div className="kv-grid">
                <span className="kv-label">Order ID</span>
                <span className="kv-value" style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                  {order.id}
                </span>
                <span className="kv-label">Status</span>
                <span className="kv-value">
                  <span className={`status-pill status-${order.status}`}>
                    {order.status.replace(/_/g, " ")}
                  </span>
                </span>
                <span className="kv-label">Design Name</span>
                <span className="kv-value">{order.design_name || "—"}</span>
                <span className="kv-label">Total Price</span>
                <span className="kv-value">{fmtCents(order.total_price_cents)}</span>
                <span className="kv-label">Deposit Paid</span>
                <span className="kv-value">{fmtCents(order.deposit_paid_cents)}</span>
                <span className="kv-label">Balance Due</span>
                <span className="kv-value">
                  {fmtCents(order.total_price_cents - order.deposit_paid_cents)}
                </span>
                <span className="kv-label">Lead Time</span>
                <span className="kv-value">{order.estimated_lead_time_weeks} weeks</span>
                <span className="kv-label">Customer Disclaimer</span>
                <span className="kv-value">
                  {design?.disclaimer_acknowledged_at ? (
                    <span className="ack-badge">
                      Acknowledged {fmtDate(design.disclaimer_acknowledged_at)}
                    </span>
                  ) : (
                    <span className="ack-badge no-ack-badge">Not acknowledged</span>
                  )}
                </span>
                <span className="kv-label">Design Locked</span>
                <span className="kv-value">
                  {design?.locked_at ? (
                    <span className="ack-badge">
                      Locked {fmtDate(design.locked_at)}
                    </span>
                  ) : (
                    <span className="ack-badge no-ack-badge">Not locked</span>
                  )}
                </span>
              </div>
            </div>

            {/* Design dimensions */}
            {design && (
              <div className="section-card">
                <h2>Design Specifications</h2>
                <div className="kv-grid">
                  <span className="kv-label">Width</span>
                  <span className="kv-value">{dims?.width ?? "—"}&Prime;</span>
                  <span className="kv-label">Height</span>
                  <span className="kv-value">{dims?.height ?? "—"}&Prime;</span>
                  <span className="kv-label">Depth</span>
                  <span className="kv-value">{dims?.depth ?? "—"}&Prime;</span>
                  <span className="kv-label">Wood Species</span>
                  <span className="kv-value">
                    {design.wood_species_material_id ?? "Not specified"}
                  </span>
                  <span className="kv-label">Door Style</span>
                  <span className="kv-value">
                    {design.door_style_material_id ?? "Not specified"}
                  </span>
                  <span className="kv-label">Hardware</span>
                  <span className="kv-value">
                    {design.hardware_material_id ?? "Not specified"}
                  </span>
                </div>
              </div>
            )}

            {/* Cut list */}
            <div className="section-card">
              <h2>Cut List</h2>
              {cut_list && cut_list.items.length > 0 ? (
                <>
                  <p className="muted" style={{ marginBottom: "0.5rem", fontSize: "0.8rem" }}>
                    {cut_list.items.length} parts &mdash; source: {cut_list.source} &mdash;
                    generated {fmtDate(cut_list.created_at)}
                  </p>
                  <table className="cut-list-table">
                    <thead>
                      <tr>
                        <th>Part</th>
                        <th>Qty</th>
                        <th>W&Prime;</th>
                        <th>H&Prime;</th>
                        <th>T&Prime;</th>
                        <th>Material</th>
                        <th>Edge Banding</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cut_list.items.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.part_name}</td>
                          <td>{item.quantity}</td>
                          <td>{item.width_in}</td>
                          <td>{item.height_in}</td>
                          <td>{item.thickness_in}</td>
                          <td>{item.material}</td>
                          <td>{item.edge_banding ?? "—"}</td>
                          <td>{item.notes ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <p className="muted">
                  No cut list generated yet. The customer may not have completed
                  the Mozaik design export.
                </p>
              )}
            </div>

            {/* Design validation */}
            <div className="section-card">
              <h2>Design Validation Results</h2>
              {validation ? (
                <>
                  <div className="validation-summary">
                    <span>Overall:</span>
                    <span
                      className={
                        validation.overall_status === "pass"
                          ? "overall-pass"
                          : validation.overall_status === "warn"
                          ? "overall-warn"
                          : "overall-fail"
                      }
                    >
                      {validation.overall_status.toUpperCase()}
                    </span>
                    <span className="muted" style={{ fontSize: "0.78rem" }}>
                      &mdash; {validation.rules.length} rules checked &mdash;{" "}
                      {validationFails.length} fail, {validationWarns.length} warn
                    </span>
                  </div>
                  {validation.rules.map((rule) => (
                    <div className="rule-row" key={rule.rule_id}>
                      <span className={`rule-badge rule-${rule.status}`}>
                        {rule.status.toUpperCase()}
                      </span>
                      <div>
                        <strong style={{ fontSize: "0.83rem" }}>{rule.rule_name}</strong>
                        <div style={{ color: "#444", marginTop: "0.15rem" }}>
                          {rule.message}
                        </div>
                        {rule.suggestion && (
                          <div className="muted" style={{ fontSize: "0.75rem", marginTop: "0.15rem" }}>
                            Suggestion: {rule.suggestion}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <p className="muted">
                  No validation data available for this design.
                </p>
              )}
            </div>

            {/* Review history */}
            {past_reviews.length > 0 && (
              <div className="section-card">
                <h2>Review History</h2>
                {past_reviews.map((review) => (
                  <div key={review.id} className="review-history-item">
                    <span className={`action-badge action-${review.action}`}>
                      {review.action.replace(/_/g, " ")}
                    </span>
                    <span className="muted" style={{ fontSize: "0.75rem" }}>
                      {fmtDate(review.created_at)}
                      {review.partner_id && ` — Partner: ${review.partner_id.slice(0, 8)}…`}
                    </span>
                    {review.notes && (
                      <div style={{ marginTop: "0.2rem", color: "#444" }}>
                        {review.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right column: checklist + actions */}
          <div>
            {/* Review checklist */}
            <div className="section-card">
              <h2>Review Checklist</h2>
              <p className="muted" style={{ fontSize: "0.78rem", marginBottom: "0.75rem" }}>
                Confirm each item before approving. Human-in-loop required per
                liability policy (autonomous_operation_score 15/100).
              </p>

              <div className="checklist-item">
                <input
                  type="checkbox"
                  id="chk-structural"
                  defaultChecked={structuralOk}
                />
                <div className="checklist-label">
                  <label htmlFor="chk-structural">
                    <strong>Structural feasibility confirmed</strong>
                  </label>
                  <div className="checklist-sub">
                    No span failures, load capacity within material limits.
                    {structuralOk ? (
                      <span style={{ color: "#065f46" }}> ✓ Validation passed.</span>
                    ) : (
                      <span style={{ color: "#991b1b" }}>
                        {" "}
                        ✗ {validationFails.length} validation failure(s).
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="checklist-item">
                <input
                  type="checkbox"
                  id="chk-carb"
                  defaultChecked={carbCompliant}
                />
                <div className="checklist-label">
                  <label htmlFor="chk-carb">
                    <strong>Material CARB compliance verified</strong>
                  </label>
                  <div className="checklist-sub">
                    All sheet goods meet CARB Phase 2 / TSCA Title VI
                    formaldehyde emission standards.
                    {carbCompliant ? (
                      <span style={{ color: "#065f46" }}> ✓ No CARB failures detected.</span>
                    ) : (
                      <span style={{ color: "#991b1b" }}> ✗ CARB compliance issue.</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="checklist-item">
                <input
                  type="checkbox"
                  id="chk-dims"
                  defaultChecked={dimensionsOk}
                />
                <div className="checklist-label">
                  <label htmlFor="chk-dims">
                    <strong>Dimensions within partner capacity</strong>
                  </label>
                  <div className="checklist-sub">
                    Width 9–60&Prime;, height 12–96&Prime;, depth 12–30&Prime;.
                    {dims ? (
                      dimensionsOk ? (
                        <span style={{ color: "#065f46" }}>
                          {" "}✓ {dims.width}&Prime; × {dims.height}&Prime; × {dims.depth}&Prime; OK.
                        </span>
                      ) : (
                        <span style={{ color: "#991b1b" }}>
                          {" "}✗ {dims.width}&Prime; × {dims.height}&Prime; × {dims.depth}&Prime; out of range.
                        </span>
                      )
                    ) : (
                      <span style={{ color: "#666" }}> No dimension data.</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="checklist-item">
                <input type="checkbox" id="chk-ack" defaultChecked={!!design?.disclaimer_acknowledged_at} />
                <div className="checklist-label">
                  <label htmlFor="chk-ack">
                    <strong>Customer acknowledgment on file</strong>
                  </label>
                  <div className="checklist-sub">
                    Customer accepted liability disclaimers prior to checkout.
                    {design?.disclaimer_acknowledged_at ? (
                      <span style={{ color: "#065f46" }}> ✓ Acknowledged.</span>
                    ) : (
                      <span style={{ color: "#666" }}> Not on record.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            {!isAlreadyReviewed ? (
              <div className="section-card">
                <h2>Review Actions</h2>

                <div className="action-panel">
                  <div>
                    <h3>Approve &amp; Dispatch</h3>
                    <p className="muted" style={{ fontSize: "0.78rem", marginBottom: "0.5rem" }}>
                      Select a manufacturing partner and approve this order.
                      Status will change to &ldquo;in production&rdquo;.
                    </p>
                    <form action={handleApprove} className="action-form">
                      <label htmlFor="partner_id" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                        Manufacturing Partner
                      </label>
                      {active_partners.length > 0 ? (
                        <select id="partner_id" name="partner_id" required>
                          <option value="">— Select partner —</option>
                          {active_partners.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {p.carb_certified ? " (CARB✓)" : ""}
                              {" — "}
                              {p.lead_time_days}d lead
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="muted" style={{ fontSize: "0.78rem" }}>
                          No active manufacturing partners. Add one via Partners.
                        </p>
                      )}
                      <label htmlFor="approve-notes" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                        Notes (optional)
                      </label>
                      <textarea
                        id="approve-notes"
                        name="notes"
                        placeholder="Dispatch notes for the record…"
                      />
                      <button
                        type="submit"
                        className="btn"
                        disabled={active_partners.length === 0}
                      >
                        Approve &amp; Dispatch
                      </button>
                    </form>
                  </div>

                  <hr style={{ border: "none", borderTop: "1px solid #ede8e0" }} />

                  {/* Request Revision */}
                  <div>
                    <h3>Request Design Revision</h3>
                    <p className="muted" style={{ fontSize: "0.78rem", marginBottom: "0.5rem" }}>
                      Send the order back to the customer for design changes.
                      The customer will be notified via the notifications lego.
                    </p>
                    <form action={handleRevision} className="action-form">
                      <label htmlFor="revision-notes" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                        Reason for revision (required)
                      </label>
                      <textarea
                        id="revision-notes"
                        name="notes"
                        required
                        placeholder="Describe what needs to change (e.g. span too wide, material not CARB certified)…"
                      />
                      <button type="submit" className="btn secondary">
                        Request Revision
                      </button>
                    </form>
                  </div>

                  <hr style={{ border: "none", borderTop: "1px solid #ede8e0" }} />

                  {/* Escalate */}
                  <div>
                    <h3>Escalate to Engineering</h3>
                    <p className="muted" style={{ fontSize: "0.78rem", marginBottom: "0.5rem" }}>
                      Flag this order for engineering review. Order remains
                      in the queue pending engineering sign-off.
                    </p>
                    <form action={handleEscalate} className="action-form">
                      <label htmlFor="escalate-notes" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                        Escalation notes
                      </label>
                      <textarea
                        id="escalate-notes"
                        name="notes"
                        placeholder="Describe the engineering concern…"
                      />
                      <button type="submit" className="btn secondary">
                        Escalate to Engineering
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ) : (
              <div className="section-card">
                <h2>Review Actions</h2>
                <p className="muted">
                  This order is no longer awaiting review (status:{" "}
                  <strong>{order.status}</strong>). No further actions available
                  on this page.
                </p>
                <a href="/orders" className="btn secondary">
                  Return to Queue
                </a>
              </div>
            )}

            {/* Active partners reference */}
            {active_partners.length > 0 && (
              <div className="section-card">
                <h2>Active Manufacturing Partners</h2>
                {active_partners.map((p) => (
                  <div key={p.id} className="partner-card">
                    <strong>{p.name}</strong>
                    <span className="muted" style={{ fontSize: "0.75rem" }}>
                      {p.carb_certified && (
                        <span style={{ color: "#065f46", marginRight: "0.5rem" }}>
                          CARB✓
                        </span>
                      )}
                      Lead: {p.lead_time_days}d &mdash; Cap:{" "}
                      {p.capacity_orders_per_week}/wk
                      {p.contact_email && ` — ${p.contact_email}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
