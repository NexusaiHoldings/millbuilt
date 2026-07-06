import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/admin-auth";
import { getOrdersForUser, type CabinetOrder } from "@/lib/cabinets/order-creation";
import { MILESTONE_LABELS, MILESTONE_ORDER, getMilestonesForOrder } from "@/lib/cabinets/order-tracker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "My Orders",
  description: "Track your custom cabinet orders from production through delivery.",
};

// ── Styles ────────────────────────────────────────────────────────────────────

const PAGE_STYLES = `
.orders-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.orders-table th {
  text-align: left;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #888;
  padding: 0.6rem 1rem;
  border-bottom: 2px solid #e5e7eb;
}
.orders-table td {
  padding: 1rem;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
}
.orders-table tr:last-child td { border-bottom: none; }
.orders-table tr:hover td { background: #fafaf9; }
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  padding: 0.25rem 0.7rem;
  border-radius: 999px;
  white-space: nowrap;
}
.status-pill-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.7;
}
.pill-amber { background: #fef3c7; color: #92400e; }
.pill-blue  { background: #dbeafe; color: #1e40af; }
.pill-green { background: #dcfce7; color: #166534; }
.pill-grey  { background: #f3f4f6; color: #6b7280; }
.order-id-chip {
  font-family: ui-monospace, monospace;
  font-size: 0.78rem;
  color: #555;
  background: #f3f4f6;
  border-radius: 4px;
  padding: 0.15rem 0.45rem;
}
.milestone-chip {
  font-size: 0.72rem;
  color: #888;
  white-space: nowrap;
}
.empty-orders {
  text-align: center;
  padding: 4rem 2rem;
  border: 2px dashed #e5e7eb;
  border-radius: 12px;
  margin-top: 1.5rem;
}
.empty-orders-icon {
  font-size: 3rem;
  line-height: 1;
  margin-bottom: 1rem;
  opacity: 0.4;
}
.section-heading {
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #888;
  margin: 1.75rem 0 0.75rem;
}
.completed-details {
  margin-top: 2rem;
}
.completed-summary {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  list-style: none;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #888;
  user-select: none;
  padding: 0.4rem 0;
}
.completed-summary::-webkit-details-marker { display: none; }
.completed-summary::before {
  content: "▶";
  font-size: 0.6rem;
  transition: transform 0.15s;
  display: inline-block;
}
details[open] .completed-summary::before {
  transform: rotate(90deg);
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

function statusPillClass(status: CabinetOrder["status"]): string {
  switch (status) {
    case "deposit_paid":  return "status-pill pill-amber";
    case "in_production": return "status-pill pill-blue";
    case "ready":         return "status-pill pill-green";
    case "delivered":     return "status-pill pill-green";
    case "cancelled":     return "status-pill pill-grey";
    default:              return "status-pill pill-grey";
  }
}

function statusLabel(status: CabinetOrder["status"]): string {
  switch (status) {
    case "deposit_paid":  return "Deposit Paid";
    case "in_production": return "In Production";
    case "ready":         return "Ready";
    case "delivered":     return "Delivered";
    case "cancelled":     return "Cancelled";
    default:              return status;
  }
}

function currentMilestoneLabel(status: CabinetOrder["status"]): string {
  switch (status) {
    case "deposit_paid":  return MILESTONE_LABELS["order_confirmed"];
    case "in_production": return MILESTONE_LABELS["cnc_cutting"];
    case "ready":         return MILESTONE_LABELS["shipped"];
    case "delivered":     return MILESTONE_LABELS["delivered"];
    case "cancelled":     return "Cancelled";
    default:              return "—";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES: CabinetOrder["status"][] = ["deposit_paid", "in_production", "ready"];

function isActive(order: CabinetOrder): boolean {
  return (ACTIVE_STATUSES as string[]).includes(order.status);
}

// ── Shared table component ────────────────────────────────────────────────────

function OrdersTable({ orders }: { orders: CabinetOrder[] }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <table className="orders-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Design</th>
            <th>Status</th>
            <th>Current Stage</th>
            <th>Date</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <span className="order-id-chip">
                  #{order.id.substring(0, 8).toUpperCase()}
                </span>
              </td>
              <td style={{ fontWeight: 600, color: "#111" }}>
                {order.design_name || "Custom Cabinet"}
              </td>
              <td>
                <span className={statusPillClass(order.status)}>
                  <span className="status-pill-dot" />
                  {statusLabel(order.status)}
                </span>
              </td>
              <td>
                <span className="milestone-chip">
                  {currentMilestoneLabel(order.status)}
                </span>
              </td>
              <td className="muted" style={{ fontSize: "0.85rem" }}>
                {formatDate(order.created_at)}
              </td>
              <td style={{ fontWeight: 700 }}>
                {formatCents(order.total_price_cents)}
              </td>
              <td>
                <Link
                  href={`/orders/${order.id}`}
                  className="btn secondary"
                  style={{ fontSize: "0.8rem", padding: "0.3rem 0.75rem" }}
                >
                  Track &rarr;
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OrdersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let orders: CabinetOrder[] = [];
  try {
    orders = await getOrdersForUser(user.id);
  } catch {
    // Table may not exist yet on a fresh deploy — treat as empty list
  }

  const activeOrders = orders.filter(isActive);
  const completedOrders = orders.filter((o) => !isActive(o));

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
      <main>
        <h1>My Orders</h1>
        <p className="muted">
          Track your custom cabinet orders from production through to delivery.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.75rem" }}>
          <Link href="/design" className="btn">
            Start a New Design
          </Link>
          <Link href="/design" className="btn secondary">
            View My Designs
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="empty-orders">
            <div className="empty-orders-icon">&#128230;</div>
            <h2 style={{ marginBottom: "0.5rem" }}>No orders yet</h2>
            <p className="muted" style={{ marginBottom: "1.5rem" }}>
              Your first order will appear here — start designing your custom cabinets.
            </p>
            <Link href="/design" className="btn">
              Start Designing
            </Link>
          </div>
        ) : (
          <>
            {/* Active orders section — always visible */}
            <p className="section-heading">
              Active Orders
              {activeOrders.length > 0 && (
                <span className="muted" style={{ fontWeight: 400, marginLeft: "0.5rem", textTransform: "none", letterSpacing: 0 }}>
                  ({activeOrders.length})
                </span>
              )}
            </p>

            {activeOrders.length === 0 ? (
              <div className="empty" style={{ marginBottom: "1rem" }}>
                No active orders right now.
              </div>
            ) : (
              <OrdersTable orders={activeOrders} />
            )}

            {/* Completed orders — collapsed by default */}
            {completedOrders.length > 0 && (
              <details className="completed-details">
                <summary className="completed-summary">
                  Completed Orders ({completedOrders.length})
                </summary>
                <div style={{ marginTop: "0.75rem" }}>
                  <OrdersTable orders={completedOrders} />
                </div>
              </details>
            )}

            <p
              className="muted"
              style={{ fontSize: "0.8rem", marginTop: "1rem", textAlign: "right" }}
            >
              Showing {orders.length} order{orders.length !== 1 ? "s" : ""} total
            </p>
          </>
        )}
      </main>
    </>
  );
}
