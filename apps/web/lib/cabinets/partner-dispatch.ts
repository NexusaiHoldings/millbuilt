import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import type { CabinetOrder } from "./order-creation";
import type { ManufacturingPartner } from "./partner-registry";
import type { CutListItem, CabinetDimensions } from "./configurator-state";
import type { DesignValidationResult } from "./design-validator";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReviewActionType =
  | "approved"
  | "revision_requested"
  | "escalated_to_engineering";

export interface OrderReview {
  id: string;
  order_id: string;
  admin_user_id: string;
  action: ReviewActionType;
  partner_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface CutListRecord {
  id: string;
  design_id: string;
  items: CutListItem[];
  source: string;
  created_at: string;
}

export interface OrderReviewData {
  order: CabinetOrder & { delivery_address: string | null };
  design: {
    id: string;
    name: string;
    dimensions: CabinetDimensions;
    wood_species_material_id: string | null;
    door_style_material_id: string | null;
    hardware_material_id: string | null;
    disclaimer_acknowledged_at: string | null;
    locked_at: string | null;
  } | null;
  cut_list: CutListRecord | null;
  validation: DesignValidationResult | null;
  active_partners: ManufacturingPartner[];
  past_reviews: OrderReview[];
}

// ── Lazy DDL ──────────────────────────────────────────────────────────────────

let _tableReady = false;

async function ensureReviewTable(): Promise<void> {
  if (_tableReady) return;
  const db = buildDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS cabinet_order_reviews (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id       text NOT NULL,
      admin_user_id  text NOT NULL,
      action         text NOT NULL,
      partner_id     text,
      notes          text,
      created_at     timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS cabinet_order_reviews_order_id_idx
      ON cabinet_order_reviews (order_id)
  `);
  _tableReady = true;
}

// ── Audit helper ──────────────────────────────────────────────────────────────

async function logAudit(
  adminUserId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = buildDb();
  const safeId =
    adminUserId && adminUserId.length > 0
      ? adminUserId
      : "00000000-0000-0000-0000-000000000000";
  try {
    await db.execute(
      `INSERT INTO admin_audit_log
         (admin_user_id, action, target_type, target_id, payload)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb)`,
      safeId,
      action,
      targetType,
      targetId,
      JSON.stringify(payload),
    );
  } catch {
    // Audit log writes are non-fatal
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** All orders with status 'deposit_paid' (or a custom filter) sorted newest first. */
export async function getOrdersAwaitingReview(
  statusFilter: string = "deposit_paid",
): Promise<(CabinetOrder & { delivery_address: string | null })[]> {
  const db = buildDb();
  type Row = CabinetOrder & { delivery_address: string | null };
  try {
    if (statusFilter === "all") {
      return db.query<Row>(
        `SELECT id, quote_id, design_id, user_id, design_name,
           total_price_cents, deposit_paid_cents,
           stripe_session_id, stripe_payment_intent_id,
           status, estimated_lead_time_weeks, notes,
           created_at, updated_at,
           NULL::text AS delivery_address
         FROM cabinet_orders
         ORDER BY created_at DESC`,
      );
    }
    return db.query<Row>(
      `SELECT id, quote_id, design_id, user_id, design_name,
         total_price_cents, deposit_paid_cents,
         stripe_session_id, stripe_payment_intent_id,
         status, estimated_lead_time_weeks, notes,
         created_at, updated_at,
         NULL::text AS delivery_address
       FROM cabinet_orders
       WHERE status = $1
       ORDER BY created_at DESC`,
      statusFilter,
    );
  } catch {
    return [];
  }
}

/** Full review data for a single order. */
export async function getOrderReviewData(
  orderId: string,
): Promise<OrderReviewData | null> {
  await ensureReviewTable();
  const db = buildDb();

  type OrderRow = CabinetOrder & { delivery_address: string | null };
  const orderRows = await db.query<OrderRow>(
    `SELECT id, quote_id, design_id, user_id, design_name,
       total_price_cents, deposit_paid_cents,
       stripe_session_id, stripe_payment_intent_id,
       status, estimated_lead_time_weeks, notes,
       created_at, updated_at,
       delivery_address
     FROM cabinet_orders
     WHERE id = $1
     LIMIT 1`,
    orderId,
  );
  if (!orderRows[0]) return null;
  const order = orderRows[0];

  // Design
  type DesignRow = {
    id: string;
    name: string;
    dimensions: CabinetDimensions;
    wood_species_material_id: string | null;
    door_style_material_id: string | null;
    hardware_material_id: string | null;
    disclaimer_acknowledged_at: string | null;
    locked_at: string | null;
  };
  let design: DesignRow | null = null;
  try {
    const designRows = await db.query<DesignRow>(
      `SELECT id, name, dimensions,
         wood_species_material_id, door_style_material_id, hardware_material_id,
         disclaimer_acknowledged_at, locked_at
       FROM cabinet_designs
       WHERE id = $1
       LIMIT 1`,
      order.design_id,
    );
    design = designRows[0] ?? null;
  } catch {
    design = null;
  }

  // Cut list
  type CutListRow = { id: string; design_id: string; items: unknown; source: string; created_at: string };
  let cut_list: CutListRecord | null = null;
  try {
    const clRows = await db.query<CutListRow>(
      `SELECT id, design_id, items, source, created_at
       FROM cabinet_cut_lists
       WHERE design_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      order.design_id,
    );
    if (clRows[0]) {
      const raw = clRows[0];
      cut_list = {
        id: raw.id,
        design_id: raw.design_id,
        items: Array.isArray(raw.items) ? (raw.items as CutListItem[]) : [],
        source: raw.source,
        created_at: raw.created_at,
      };
    }
  } catch {
    cut_list = null;
  }

  // Validation result (latest persisted)
  type ValidationRow = { id: string; design_id: string; result: unknown; created_at: string };
  let validation: DesignValidationResult | null = null;
  try {
    const vRows = await db.query<ValidationRow>(
      `SELECT id, design_id, result, created_at
       FROM cabinet_design_validations
       WHERE design_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      order.design_id,
    );
    if (vRows[0]) {
      validation = vRows[0].result as DesignValidationResult;
    }
  } catch {
    validation = null;
  }

  // Active manufacturing partners
  type PartnerRow = ManufacturingPartner;
  let active_partners: PartnerRow[] = [];
  try {
    active_partners = await db.query<PartnerRow>(
      `SELECT id, name, contact_name, contact_email, contact_phone,
         api_endpoint, delivery_email, supported_states,
         capacity_orders_per_week, carb_certified, lead_time_days,
         CAST(defect_rate_threshold AS FLOAT) AS defect_rate_threshold,
         epa_tsca_cert_url, state_contractor_license, insurance_cert_url,
         notes, active, created_at, updated_at
       FROM cabinet_manufacturing_partners
       WHERE active = TRUE
       ORDER BY lead_time_days ASC, name ASC`,
    );
  } catch {
    active_partners = [];
  }

  // Past review actions for this order
  const past_reviews = await db.query<OrderReview>(
    `SELECT id, order_id, admin_user_id, action, partner_id, notes, created_at
     FROM cabinet_order_reviews
     WHERE order_id = $1
     ORDER BY created_at DESC`,
    orderId,
  );

  return {
    order,
    design,
    cut_list,
    validation,
    active_partners,
    past_reviews,
  };
}

// ── Review actions ────────────────────────────────────────────────────────────

/** Record a review action in cabinet_order_reviews. */
export async function recordOrderReviewAction(
  orderId: string,
  adminUserId: string,
  action: ReviewActionType,
  notes: string | null,
  partnerId: string | null = null,
): Promise<OrderReview> {
  await ensureReviewTable();
  const db = buildDb();
  const rows = await db.query<OrderReview>(
    `INSERT INTO cabinet_order_reviews
       (order_id, admin_user_id, action, partner_id, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, order_id, admin_user_id, action, partner_id, notes, created_at`,
    orderId,
    adminUserId,
    action,
    partnerId,
    notes,
  );
  return rows[0];
}

/**
 * Approve an order: assign partner, update status to in_production,
 * publish dispatch event, log audit.
 */
export async function dispatchOrderToPartner(
  orderId: string,
  partnerId: string,
  adminUserId: string,
  notes: string | null = null,
): Promise<void> {
  const db = buildDb();
  const events = buildEventBus();

  // Fetch order for context
  type OrderRow = { id: string; design_id: string; user_id: string; design_name: string; status: string };
  const orderRows = await db.query<OrderRow>(
    `SELECT id, design_id, user_id, design_name, status FROM cabinet_orders WHERE id = $1 LIMIT 1`,
    orderId,
  );
  const order = orderRows[0];
  if (!order) throw new Error(`Order ${orderId} not found`);

  // Update order status to in_production
  await db.execute(
    `UPDATE cabinet_orders
     SET status = 'in_production', updated_at = now()
     WHERE id = $1`,
    orderId,
  );

  // Record the review action
  await recordOrderReviewAction(orderId, adminUserId, "approved", notes, partnerId);

  // Publish dispatch event
  await events.publish("cabinets.order_dispatched", {
    order_id: orderId,
    design_id: order.design_id,
    user_id: order.user_id,
    design_name: order.design_name,
    partner_id: partnerId,
    dispatched_by: adminUserId,
    notes,
  });

  // Log to admin audit log
  await logAudit(adminUserId, "order.dispatched", "cabinet_order", orderId, {
    partner_id: partnerId,
    previous_status: order.status,
    new_status: "in_production",
    notes,
  });
}

/**
 * Request design revision: leaves order status as deposit_paid,
 * notifies the customer, logs audit.
 */
export async function requestDesignRevision(
  orderId: string,
  adminUserId: string,
  customerUserId: string,
  designName: string,
  notes: string | null,
): Promise<void> {
  const events = buildEventBus();

  const baseUrl =
    process.env.APP_BASE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");
  const orderUrl = baseUrl ? `${baseUrl}/orders/${orderId}` : `/orders/${orderId}`;

  // Record review action
  await recordOrderReviewAction(orderId, adminUserId, "revision_requested", notes);

  // Notify customer
  await events.publish("cabinets.order_revision_requested", {
    order_id: orderId,
    user_id: customerUserId,
    design_name: designName,
    operator_notes: notes,
    order_url: orderUrl,
    company_name: process.env.COMPANY_NAME ?? "Custom Cabinets",
  });

  // Log audit
  await logAudit(adminUserId, "order.revision_requested", "cabinet_order", orderId, {
    customer_user_id: customerUserId,
    design_name: designName,
    notes,
  });
}

/**
 * Escalate an order to engineering review: logs audit and publishes event.
 */
export async function escalateToEngineering(
  orderId: string,
  adminUserId: string,
  designName: string,
  notes: string | null,
): Promise<void> {
  const events = buildEventBus();

  // Record review action
  await recordOrderReviewAction(
    orderId,
    adminUserId,
    "escalated_to_engineering",
    notes,
  );

  // Publish escalation event
  await events.publish("cabinets.order_escalated", {
    order_id: orderId,
    escalated_by: adminUserId,
    design_name: designName,
    notes,
    company_name: process.env.COMPANY_NAME ?? "Custom Cabinets",
  });

  // Log audit
  await logAudit(
    adminUserId,
    "order.escalated_to_engineering",
    "cabinet_order",
    orderId,
    { design_name: designName, notes },
  );
}
