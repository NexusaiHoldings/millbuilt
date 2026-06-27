import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/admin-auth";
import {
  getOrderWithDetail,
  MILESTONE_LABELS,
  MILESTONE_DESCRIPTIONS,
  MILESTONE_ORDER,
  type OrderMilestone,
  type MilestoneKey,
  type MilestoneStatus,
  type DesignSummary,
} from "@/lib/cabinets/order-tracker";
import type { CabinetOrder } from "@/lib/cabinets/order-creation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return {
    title: `Order #${params.id.substring(0, 8).toUpperCase()} — Track Progress`,
    description: "Follow your custom cabinet order through every production milestone.",
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────

const PAGE_STYLES = `
.order-header-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1rem;
  margin-bottom: 2rem;
}
@media (max-width: 800px) {
  .order-header-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 500px) {
  .order-header-grid { grid-template-columns: 1fr; }
}
.detail-cell {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.85rem 1rem;
  background: #fafaf9;
}
.detail-label {
  display: block;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #aaa;
  margin-bottom: 0.3rem;
}
.detail-value {
  font-size: 1rem;
  font-weight: 700;
  color: #111;
}
.detail-value-sm {
  font-size: 0.88rem;
  font-weight: 600;
  color: #333;
}
.order-layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 2.5rem;
  align-items: start;
}
@media (max-width: 900px) {
  .order-layout { grid-template-columns: 1fr; }
}
.timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.timeline-item {
  display: flex;
  gap: 1rem;
  padding-bottom: 0;
}
.timeline-spine {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 32px;
}
.timeline-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 800;
  flex-shrink: 0;
  background: #fff;
  z-index: 1;
}
.dot-complete { border-color: #16a34a; background: #16a34a; color: #fff; }
.dot-progress  { border-color: #f59e0b; background: #fef3c7; color: #92400e; }
.dot-pending  { border-color: #d1d5db; background: #f9fafb; color: #9ca3af; }
.timeline-connector {
  flex: 1;
  width: 2px;
  background: #e5e7eb;
  min-height: 28px;
  margin: 0;
}
.connector-complete { background: #16a34a; }
.connector-empty { visibility: hidden; }
.timeline-content {
  flex: 1;
  padding-bottom: 1.75rem;
}
.timeline-item:last-child .timeline-content { padding-bottom: 0; }
.milestone-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.4rem;
}
.milestone-title {
  font-size: 1rem;
  font-weight: 700;
  color: #111;
  margin: 0;
}
.milestone-title-muted { color: #9ca3af; }
.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
}
.pill-green  { background: #dcfce7; color: #166534; }
.pill-amber  { background: #fef3c7; color: #92400e; }
.pill-grey   { background: #f3f4f6; color: #9ca3af; }
.milestone-desc {
  font-size: 0.85rem;
  color: #666;
  margin: 0 0 0.3rem 0;
  line-height: 1.55;
}
.milestone-ts {
  font-size: 0.75rem;
  color: #aaa;
}
.thumbnail-box {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 10px;
  overflow: hidden;
  background: #f0ede8;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e5e7eb;
  margin-bottom: 1rem;
}
.material-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.55rem 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.85rem;
}
.material-row:last-child { border-bottom: none; }
.material-label { color: #888; }
.material-value { font-weight: 600; color: #111; }
.balance-block {
  background: #fef3c7;
  border-radius: 8px;
  padding: 1rem;
  margin-top: 1rem;
  text-align: center;
}
.balance-label {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #92400e;
  display: block;
  margin-bottom: 0.2rem;
}
.balance-amount {
  font-size: 1.75rem;
  font-weight: 800;
  color: #78350f;
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(status: CabinetOrder["status"]): string {
  const map: Record<CabinetOrder["status"], string> = {
    deposit_paid: "Deposit Paid",
    in_production: "In Production",
    ready: "Ready for Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };
  return map[status] ?? status;
}

function statusColor(status: CabinetOrder["status"]): string {
  switch (status) {
    case "deposit_paid":  return "#92400e";
    case "in_production": return "#1e40af";
    case "ready":         return "#166534";
    case "delivered":     return "#166534";
    case "cancelled":     return "#6b7280";
    default:              return "#111";
  }
}

function pillClass(milestoneStatus: MilestoneStatus): string {
  switch (milestoneStatus) {
    case "complete":    return "pill pill-green";
    case "in_progress": return "pill pill-amber";
    case "pending":     return "pill pill-grey";
  }
}

function pillLabel(milestoneStatus: MilestoneStatus): string {
  switch (milestoneStatus) {
    case "complete":    return "Complete";
    case "in_progress": return "In Progress";
    case "pending":     return "Pending";
  }
}

function dotClass(milestoneStatus: MilestoneStatus): string {
  switch (milestoneStatus) {
    case "complete":    return "timeline-dot dot-complete";
    case "in_progress": return "timeline-dot dot-progress";
    case "pending":     return "timeline-dot dot-pending";
  }
}

// ── Design Thumbnail SVG ──────────────────────────────────────────────────────

function DesignThumbnail({ design }: { design: DesignSummary }) {
  const w = design.width_inches ?? 24;
  const h = design.height_inches ?? 36;
  const depth = design.depth_inches ?? 12;

  const woodColors: Record<string, string> = {
    maple: "#f5deb3",
    oak: "#c8a97e",
    cherry: "#b5652b",
    walnut: "#6b3a2a",
    birch: "#e8d5b0",
    mdf: "#d8cfc8",
  };
  const fill =
    woodColors[(design.wood_species ?? "maple").toLowerCase()] ?? "#ddc9a8";
  const shadow = "#a0866a";
  const doorFill = fill;
  const doorStroke = shadow;

  // Scale so cabinet fits in 200×150 viewport
  const scale = Math.min(160 / w, 120 / h, 3.5);
  const cw = w * scale;
  const ch = h * scale;
  const cd = depth * scale * 0.45;

  // Isometric offsets
  const ox = 200 / 2 - cw / 2 + cd * 0.4;
  const oy = 150 / 2 - ch / 2 + cd * 0.3;

  return (
    <svg
      viewBox="0 0 200 150"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "100%", height: "100%" }}
      aria-label="Cabinet design preview"
    >
      {/* Top face */}
      <polygon
        points={`${ox},${oy} ${ox + cw},${oy} ${ox + cw + cd},${oy - cd * 0.5} ${ox + cd},${oy - cd * 0.5}`}
        fill={fill}
        stroke={shadow}
        strokeWidth="0.8"
      />
      {/* Side face */}
      <polygon
        points={`${ox + cw},${oy} ${ox + cw + cd},${oy - cd * 0.5} ${ox + cw + cd},${oy - cd * 0.5 + ch} ${ox + cw},${oy + ch}`}
        fill={shadow}
        stroke={shadow}
        strokeWidth="0.8"
      />
      {/* Front face */}
      <rect
        x={ox}
        y={oy}
        width={cw}
        height={ch}
        fill={doorFill}
        stroke={doorStroke}
        strokeWidth="0.8"
      />
      {/* Door panel inset */}
      <rect
        x={ox + cw * 0.07}
        y={oy + ch * 0.05}
        width={cw * 0.86}
        height={ch * 0.9}
        fill="none"
        stroke={doorStroke}
        strokeWidth="0.5"
        opacity={0.5}
      />
      {/* Door handle */}
      <circle
        cx={ox + cw * 0.88}
        cy={oy + ch * 0.5}
        r={2.5}
        fill={shadow}
        opacity={0.8}
      />
    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = params;

  let detail = null;
  try {
    detail = await getOrderWithDetail(id);
  } catch {
    // Table may not exist on fresh deploy
  }

  if (!detail) notFound();

  const { order, milestones, design } = detail;

  // Ownership check — customers can only see their own orders
  if (order.user_id !== user.id) notFound();

  const orderShort = order.id.substring(0, 8).toUpperCase();
  const balance = order.total_price_cents - order.deposit_paid_cents;

  // Build milestone map keyed by MilestoneKey for quick lookup
  const milestoneMap = new Map<MilestoneKey, OrderMilestone>(
    milestones.map((m) => [m.milestone as MilestoneKey, m]),
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
      <main>
        {/* Breadcrumb */}
        <p className="muted" style={{ fontSize: "0.82rem", marginBottom: "0.5rem" }}>
          <Link href="/orders" style={{ color: "#888", textDecoration: "none" }}>
            My Orders
          </Link>
          {" / "}
          <span>#{orderShort}</span>
        </p>

        <h1 style={{ marginBottom: "0.4rem" }}>
          {order.design_name || "Custom Cabinet Order"}
        </h1>
        <p className="muted" style={{ marginBottom: "1.75rem" }}>
          Order #{orderShort} &mdash; placed{" "}
          {formatDate(order.created_at)} &mdash;{" "}
          <span style={{ color: statusColor(order.status), fontWeight: 700 }}>
            {statusLabel(order.status)}
          </span>
        </p>

        {/* Summary grid */}
        <div className="order-header-grid">
          <div className="detail-cell card">
            <span className="detail-label">Total</span>
            <span className="detail-value">{formatCents(order.total_price_cents)}</span>
          </div>
          <div className="detail-cell card">
            <span className="detail-label">Deposit Paid</span>
            <span className="detail-value" style={{ color: "#16a34a" }}>
              {formatCents(order.deposit_paid_cents)}
            </span>
          </div>
          <div className="detail-cell card">
            <span className="detail-label">Balance Due on Delivery</span>
            <span className="detail-value">{formatCents(balance)}</span>
          </div>
          <div className="detail-cell card">
            <span className="detail-label">Estimated Lead Time</span>
            <span className="detail-value-sm">
              {order.estimated_lead_time_weeks - 1}–
              {order.estimated_lead_time_weeks + 1} weeks
            </span>
          </div>
          <div className="detail-cell card">
            <span className="detail-label">Order Date</span>
            <span className="detail-value-sm">{formatDate(order.created_at)}</span>
          </div>
          <div className="detail-cell card">
            <span className="detail-label">Delivery Address</span>
            <span className="detail-value-sm">
              {order.delivery_address ?? (
                <em style={{ color: "#aaa", fontStyle: "normal" }}>
                  To be confirmed
                </em>
              )}
            </span>
          </div>
        </div>

        <div className="order-layout">
          {/* Left: milestone timeline */}
          <div>
            <p
              style={{
                fontSize: "0.7rem",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#888",
                marginBottom: "1.25rem",
              }}
            >
              Production Timeline
            </p>

            <div className="timeline">
              {MILESTONE_ORDER.map((mk, idx) => {
                const ms = milestoneMap.get(mk);
                const msStatus: MilestoneStatus = ms?.status ?? "pending";
                const isLast = idx === MILESTONE_ORDER.length - 1;
                const prevKey = idx > 0 ? MILESTONE_ORDER[idx - 1] : null;
                const prevMs = prevKey ? milestoneMap.get(prevKey) : null;
                const connectorComplete = prevMs?.status === "complete";

                return (
                  <div key={mk} className="timeline-item">
                    <div className="timeline-spine">
                      {idx > 0 && (
                        <div
                          className={
                            connectorComplete
                              ? "timeline-connector connector-complete"
                              : "timeline-connector"
                          }
                        />
                      )}
                      {idx === 0 && (
                        <div
                          className="timeline-connector connector-empty"
                          style={{ minHeight: "8px" }}
                        />
                      )}
                      <div className={dotClass(msStatus)}>
                        {msStatus === "complete" ? "✓" : idx + 1}
                      </div>
                      {!isLast && (
                        <div
                          className={
                            msStatus === "complete"
                              ? "timeline-connector connector-complete"
                              : "timeline-connector"
                          }
                          style={{ flex: 1 }}
                        />
                      )}
                    </div>

                    <div className="timeline-content">
                      <div className="milestone-header">
                        <h3
                          className={
                            msStatus === "pending"
                              ? "milestone-title milestone-title-muted"
                              : "milestone-title"
                          }
                        >
                          {MILESTONE_LABELS[mk]}
                        </h3>
                        <span className={pillClass(msStatus)}>
                          {pillLabel(msStatus)}
                        </span>
                      </div>

                      <p className="milestone-desc">
                        {ms?.description ?? MILESTONE_DESCRIPTIONS[mk]}
                      </p>

                      {ms?.completed_at && (
                        <span className="milestone-ts">
                          Completed {formatDateTime(ms.completed_at)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {order.notes && (
              <div
                className="card"
                style={{
                  marginTop: "2rem",
                  padding: "1rem 1.25rem",
                  background: "#f9fafb",
                }}
              >
                <p
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#aaa",
                    marginBottom: "0.4rem",
                  }}
                >
                  Order Notes
                </p>
                <p style={{ margin: 0, fontSize: "0.88rem", color: "#555" }}>
                  {order.notes}
                </p>
              </div>
            )}
          </div>

          {/* Right: design summary + material card */}
          <div>
            {/* Design thumbnail */}
            <p
              style={{
                fontSize: "0.7rem",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#888",
                marginBottom: "0.75rem",
              }}
            >
              Design Preview
            </p>
            <div className="thumbnail-box">
              <DesignThumbnail design={design} />
            </div>

            {/* Material summary */}
            <div className="card" style={{ padding: "1rem 1.25rem", marginBottom: "1rem" }}>
              <p
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#aaa",
                  marginBottom: "0.75rem",
                }}
              >
                Material Summary
              </p>

              {design.width_inches && (
                <div className="material-row">
                  <span className="material-label">Dimensions</span>
                  <span className="material-value">
                    {design.width_inches}&Prime;&times;{design.height_inches}&Prime;&times;
                    {design.depth_inches}&Prime;
                  </span>
                </div>
              )}

              {design.wood_species && (
                <div className="material-row">
                  <span className="material-label">Wood Species</span>
                  <span className="material-value">
                    {design.wood_species.charAt(0).toUpperCase() +
                      design.wood_species.slice(1)}
                  </span>
                </div>
              )}

              {design.door_style && (
                <div className="material-row">
                  <span className="material-label">Door Style</span>
                  <span className="material-value">
                    {design.door_style.charAt(0).toUpperCase() +
                      design.door_style.slice(1)}
                  </span>
                </div>
              )}

              {design.hardware_style && (
                <div className="material-row">
                  <span className="material-label">Hardware</span>
                  <span className="material-value">
                    {design.hardware_style.charAt(0).toUpperCase() +
                      design.hardware_style.slice(1)}
                  </span>
                </div>
              )}

              {!design.wood_species && !design.door_style && !design.hardware_style && (
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  {order.design_name || "Custom Cabinet"}
                </p>
              )}
            </div>

            {/* Balance due reminder */}
            {order.status !== "delivered" && order.status !== "cancelled" && (
              <div className="balance-block">
                <span className="balance-label">Balance Due on Delivery</span>
                <div className="balance-amount">{formatCents(balance)}</div>
              </div>
            )}

            {/* Actions */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
                marginTop: "1rem",
              }}
            >
              <Link href="/orders" className="btn secondary">
                &larr; Back to All Orders
              </Link>
              <Link href={`/quote/${order.quote_id}`} className="btn secondary">
                View Original Quote
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
