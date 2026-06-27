import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { randomUUID } from "node:crypto";
import type { CabinetOrder } from "./order-creation";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MilestoneKey =
  | "design_locked"
  | "order_confirmed"
  | "cnc_cutting"
  | "finishing"
  | "qa"
  | "shipped"
  | "delivered";

export type MilestoneStatus = "pending" | "in_progress" | "complete";

export interface OrderMilestone {
  id: string;
  order_id: string;
  milestone: MilestoneKey;
  status: MilestoneStatus;
  description: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DesignSummary {
  width_inches: number | null;
  height_inches: number | null;
  depth_inches: number | null;
  wood_species: string | null;
  door_style: string | null;
  hardware_style: string | null;
}

export interface OrderDetail {
  order: CabinetOrder & { delivery_address: string | null };
  milestones: OrderMilestone[];
  design: DesignSummary;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const MILESTONE_LABELS: Record<MilestoneKey, string> = {
  design_locked: "Design Locked",
  order_confirmed: "Order Confirmed",
  cnc_cutting: "CNC Cutting",
  finishing: "Finishing",
  qa: "QA Inspection",
  shipped: "Shipped",
  delivered: "Delivered",
};

export const MILESTONE_DESCRIPTIONS: Record<MilestoneKey, string> = {
  design_locked:
    "Your cabinet design has been finalised and locked for production. No further changes can be made.",
  order_confirmed:
    "Your order has been reviewed by our production team and added to the build queue.",
  cnc_cutting:
    "Our CNC machines are precision-cutting every component of your cabinet to exact dimensions.",
  finishing:
    "Components are being sanded, stained, and finished to your chosen specification.",
  qa: "Our quality assurance team is inspecting every joint, finish, and fitting before dispatch.",
  shipped:
    "Your cabinets have been carefully packed and dispatched with our freight partner.",
  delivered: "Your cabinets have been delivered. Thank you — enjoy your new space!",
};

export const MILESTONE_ORDER: MilestoneKey[] = [
  "design_locked",
  "order_confirmed",
  "cnc_cutting",
  "finishing",
  "qa",
  "shipped",
  "delivered",
];

// ── Lazy DDL ──────────────────────────────────────────────────────────────────

let _tableReady = false;

async function ensureMilestoneTable(): Promise<void> {
  if (_tableReady) return;
  const db = buildDb();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS cabinet_order_milestones (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id     text NOT NULL,
      milestone    text NOT NULL,
      status       text NOT NULL DEFAULT 'pending',
      description  text,
      completed_at timestamptz,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      UNIQUE (order_id, milestone)
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS cabinet_order_milestones_order_id_idx
      ON cabinet_order_milestones (order_id)
  `);

  await db.execute(`
    ALTER TABLE IF EXISTS cabinet_orders
      ADD COLUMN IF NOT EXISTS delivery_address text
  `);

  _tableReady = true;
}

// ── Internal helper ───────────────────────────────────────────────────────────

function getExpectedMilestoneStates(
  orderStatus: CabinetOrder["status"],
): Record<MilestoneKey, MilestoneStatus> {
  const states: Record<MilestoneKey, MilestoneStatus> = {
    design_locked: "pending",
    order_confirmed: "pending",
    cnc_cutting: "pending",
    finishing: "pending",
    qa: "pending",
    shipped: "pending",
    delivered: "pending",
  };

  switch (orderStatus) {
    case "deposit_paid":
      states.design_locked = "complete";
      states.order_confirmed = "in_progress";
      break;
    case "in_production":
      states.design_locked = "complete";
      states.order_confirmed = "complete";
      states.cnc_cutting = "in_progress";
      break;
    case "ready":
      states.design_locked = "complete";
      states.order_confirmed = "complete";
      states.cnc_cutting = "complete";
      states.finishing = "complete";
      states.qa = "complete";
      states.shipped = "in_progress";
      break;
    case "delivered":
      for (const mk of MILESTONE_ORDER) {
        states[mk] = "complete";
      }
      break;
    case "cancelled":
      break;
  }

  return states;
}

// ── Exports ───────────────────────────────────────────────────────────────────

export async function initializeOrderMilestones(orderId: string): Promise<void> {
  await ensureMilestoneTable();
  const db = buildDb();

  for (const milestone of MILESTONE_ORDER) {
    const milestoneId = randomUUID();
    await db.execute(
      `INSERT INTO cabinet_order_milestones
         (id, order_id, milestone, status, description)
       VALUES ($1::uuid, $2, $3, 'pending', $4)
       ON CONFLICT (order_id, milestone) DO NOTHING`,
      milestoneId,
      orderId,
      milestone,
      MILESTONE_DESCRIPTIONS[milestone],
    );
  }
}

export async function getMilestonesForOrder(
  orderId: string,
): Promise<OrderMilestone[]> {
  await ensureMilestoneTable();
  const db = buildDb();

  return db.query<OrderMilestone>(
    `SELECT id, order_id, milestone, status, description,
       completed_at, created_at, updated_at
     FROM cabinet_order_milestones
     WHERE order_id = $1
     ORDER BY
       CASE milestone
         WHEN 'design_locked'   THEN 1
         WHEN 'order_confirmed' THEN 2
         WHEN 'cnc_cutting'     THEN 3
         WHEN 'finishing'       THEN 4
         WHEN 'qa'              THEN 5
         WHEN 'shipped'         THEN 6
         WHEN 'delivered'       THEN 7
         ELSE 99
       END`,
    orderId,
  );
}

export async function updateMilestone(
  orderId: string,
  milestone: MilestoneKey,
  status: MilestoneStatus,
): Promise<void> {
  await ensureMilestoneTable();
  const db = buildDb();

  await db.execute(
    `UPDATE cabinet_order_milestones
     SET status       = $1,
         completed_at = CASE
           WHEN $1 = 'complete' THEN COALESCE(completed_at, now())
           ELSE completed_at
         END,
         updated_at   = now()
     WHERE order_id = $2 AND milestone = $3`,
    status,
    orderId,
    milestone,
  );
}

export async function getOrderWithDetail(
  orderId: string,
): Promise<OrderDetail | null> {
  await ensureMilestoneTable();
  const db = buildDb();

  type OrderRow = CabinetOrder & { delivery_address: string | null };

  const orderRows = await db.query<OrderRow>(
    `SELECT id, quote_id, design_id, user_id, design_name,
       total_price_cents, deposit_paid_cents,
       stripe_session_id, stripe_payment_intent_id,
       status, estimated_lead_time_weeks, notes,
       created_at, updated_at, delivery_address
     FROM cabinet_orders
     WHERE id = $1
     LIMIT 1`,
    orderId,
  );

  if (!orderRows[0]) return null;
  const order = orderRows[0];

  const milestones = await getMilestonesForOrder(orderId);

  let design: DesignSummary = {
    width_inches: null,
    height_inches: null,
    depth_inches: null,
    wood_species: null,
    door_style: null,
    hardware_style: null,
  };

  try {
    const designRows = await db.query<DesignSummary>(
      `SELECT width_inches, height_inches, depth_inches,
         wood_species, door_style, hardware_style
       FROM cabinet_designs
       WHERE id = $1
       LIMIT 1`,
      order.design_id,
    );
    if (designRows[0]) design = designRows[0];
  } catch {
    // cabinet_designs may lack columns on older deploys — graceful fallback
  }

  return { order, milestones, design };
}

export async function sendMilestoneNotification(
  orderId: string,
  milestone: MilestoneKey,
  userId: string,
  designName: string,
): Promise<void> {
  const events = buildEventBus();

  const baseUrl =
    process.env.APP_BASE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");
  const orderUrl = baseUrl ? `${baseUrl}/orders/${orderId}` : `/orders/${orderId}`;

  await events.publish("cabinets.order_milestone_reached", {
    order_id: orderId,
    user_id: userId,
    milestone,
    milestone_label: MILESTONE_LABELS[milestone],
    milestone_description: MILESTONE_DESCRIPTIONS[milestone],
    design_name: designName,
    order_url: orderUrl,
    company_name: process.env.COMPANY_NAME ?? "Custom Cabinets",
  });
}

export async function syncOrderMilestones(): Promise<{
  synced: number;
  notifications: number;
}> {
  await ensureMilestoneTable();
  const db = buildDb();

  let synced = 0;
  let notifications = 0;

  type OrderSyncRow = {
    id: string;
    status: CabinetOrder["status"];
    user_id: string;
    design_name: string;
  };

  let allOrders: OrderSyncRow[] = [];
  try {
    allOrders = await db.query<OrderSyncRow>(
      `SELECT id, status, user_id, design_name
       FROM cabinet_orders
       WHERE status != 'cancelled'`,
    );
  } catch {
    // cabinet_orders may not exist on a fresh deploy
    return { synced: 0, notifications: 0 };
  }

  for (const order of allOrders) {
    let milestones = await getMilestonesForOrder(order.id);

    if (milestones.length === 0) {
      await initializeOrderMilestones(order.id);
      milestones = await getMilestonesForOrder(order.id);
      synced++;
    }

    const expected = getExpectedMilestoneStates(order.status);
    const currentMap = new Map<string, MilestoneStatus>(
      milestones.map((m) => [m.milestone, m.status]),
    );

    for (const mk of MILESTONE_ORDER) {
      const expectedStatus = expected[mk];
      const currentStatus = currentMap.get(mk) ?? "pending";

      if (currentStatus !== expectedStatus) {
        await updateMilestone(order.id, mk, expectedStatus);
        synced++;

        if (expectedStatus === "complete" && currentStatus !== "complete") {
          try {
            await sendMilestoneNotification(
              order.id,
              mk,
              order.user_id,
              order.design_name,
            );
            notifications++;
          } catch (err) {
            console.error(
              `[order-tracker] notification failed order=${order.id} milestone=${mk}:`,
              err,
            );
          }
        }
      }
    }
  }

  return { synced, notifications };
}
