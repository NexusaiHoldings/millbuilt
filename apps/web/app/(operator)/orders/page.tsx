import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin-auth";
import { getOrdersAwaitingReview } from "@/lib/cabinets/partner-dispatch";

export const metadata: Metadata = {
  title: "Order Review Queue — Operator",
  description:
    "Review and dispatch customer cabinet orders to manufacturing partners.",
};

const PAGE_STYLES = `
.order-toolbar {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 1.25rem;
}
.order-toolbar label {
  font-size: 0.82rem;
  font-weight: 600;
  margin-right: 0.25rem;
}
.orders-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.orders-table th {
  text-align: left;
  padding: 0.5rem 0.75rem;
  background: #f5f0e8;
  border-bottom: 2px solid #d8cfc3;
  font-size: 0.78rem;
  white-space: nowrap;
}
.orders-table td {
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid #ede8e0;
  vertical-align: middle;
}
.orders-table tr:last-child td { border-bottom: none; }
.orders-table tr:hover td { background: #faf7f3; }
.status-pill {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}
.status-deposit_paid  { background: #fef3c7; color: #92400e; }
.status-in_production { background: #d1fae5; color: #065f46; }
.status-ready         { background: #dbeafe; color: #1e40af; }
.status-delivered     { background: #e0e7ff; color: #3730a3; }
.status-cancelled     { background: #fee2e2; color: #991b1b; }
.order-id-cell {
  font-family: ui-monospace, monospace;
  font-size: 0.78rem;
  color: #555;
}
.filter-tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}
.filter-tab {
  padding: 0.3rem 0.85rem;
  border: 1px solid #d8cfc3;
  border-radius: 4px;
  font-size: 0.8rem;
  text-decoration: none;
  color: #444;
  background: #fff;
}
.filter-tab.active {
  background: #3b2a1a;
  color: #fff;
  border-color: #3b2a1a;
}
.badge {
  display: inline-block;
  background: #ef4444;
  color: #fff;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.05rem 0.4rem;
  margin-left: 0.35rem;
  vertical-align: middle;
}
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
  });
}

function StatusPill({ status }: { status: string }) {
  const labels: Record<string, string> = {
    deposit_paid: "Awaiting Review",
    in_production: "In Production",
    ready: "Ready",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };
  const label = labels[status] ?? status;
  return (
    <span className={`status-pill status-${status}`}>{label}</span>
  );
}

interface PageProps {
  searchParams: { status?: string };
}

export default async function OperatorOrdersPage({ searchParams }: PageProps) {
  const user = await getAdminUser();
  if (!user) redirect("/login");

  const activeFilter = searchParams.status ?? "deposit_paid";
  const validFilters = ["deposit_paid", "in_production", "ready", "delivered", "all"];
  const filter = validFilters.includes(activeFilter) ? activeFilter : "deposit_paid";

  const orders = await getOrdersAwaitingReview(filter);

  const tabDefs: Array<{ key: string; label: string }> = [
    { key: "deposit_paid", label: "Awaiting Review" },
    { key: "in_production", label: "In Production" },
    { key: "ready", label: "Ready" },
    { key: "delivered", label: "Delivered" },
    { key: "all", label: "All Orders" },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
      <main>
        <h1>Order Review Queue</h1>
        <p>
          Orders awaiting human review before dispatch to manufacturing. Each
          order must pass the structural feasibility, CARB compliance, and
          capacity checklist before approval.
          {filter === "deposit_paid" && orders.length > 0 && (
            <span className="muted">
              {" "}
              {orders.length} order{orders.length !== 1 ? "s" : ""} pending
              review.
            </span>
          )}
        </p>

        <nav className="filter-tabs" aria-label="Order status filter">
          {tabDefs.map((tab) => (
            <a
              key={tab.key}
              href={`/operator/orders?status=${tab.key}`}
              className={`filter-tab${filter === tab.key ? " active" : ""}`}
            >
              {tab.label}
            </a>
          ))}
        </nav>

        {orders.length === 0 ? (
          <div className="empty">
            <p>No orders awaiting review.</p>
            <p className="muted">
              {filter === "deposit_paid"
                ? "All deposit-paid orders have been reviewed. New orders will appear here as customers complete checkout."
                : "No orders match the selected filter."}
            </p>
          </div>
        ) : (
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Design</th>
                <th>Status</th>
                <th>Total</th>
                <th>Deposit Paid</th>
                <th>Lead Time</th>
                <th>Received</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="order-id-cell">
                    {order.id.slice(0, 8)}&hellip;
                  </td>
                  <td>
                    <strong>{order.design_name || "Untitled Design"}</strong>
                  </td>
                  <td>
                    <StatusPill status={order.status} />
                  </td>
                  <td>{fmtCents(order.total_price_cents)}</td>
                  <td>{fmtCents(order.deposit_paid_cents)}</td>
                  <td>{order.estimated_lead_time_weeks}w</td>
                  <td>{fmtDate(order.created_at)}</td>
                  <td>
                    <a
                      href={`/operator/orders/${order.id}/review`}
                      className={
                        order.status === "deposit_paid" ? "btn" : "btn secondary"
                      }
                      style={{ fontSize: "0.78rem", padding: "0.25rem 0.65rem" }}
                    >
                      {order.status === "deposit_paid" ? "Review" : "View"}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}
