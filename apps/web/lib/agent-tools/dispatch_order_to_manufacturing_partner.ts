/**
 * Agent tool handler: dispatch_order_to_manufacturing_partner
 *
 * Confirm-gated mutation. Sends the approved cut list package (PDF + JSON)
 * to the assigned manufacturing partner via their configured API endpoint or
 * email, updates cabinet_orders.status to 'dispatched', and records the
 * dispatch timestamp and partner acknowledgment.
 *
 * Autonomy = human_review — this handler is reached only after the cross-
 * boundary bridge has obtained explicit user confirmation.
 */

import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";

type Args = Record<string, unknown>;

interface CabinetOrderRow {
  readonly id: string;
  readonly status: string;
  readonly cut_list_pdf_url: string | null;
  readonly cut_list_json: unknown;
  readonly partner_id: string | null;
  readonly order_reference: string;
}

interface ManufacturingPartnerRow {
  readonly id: string;
  readonly name: string;
  readonly dispatch_method: string;
  readonly api_endpoint: string | null;
  readonly api_key: string | null;
  readonly contact_email: string | null;
}

interface PartnerApiAck {
  readonly acknowledgment_id?: string;
  readonly id?: string;
  readonly reference?: string;
}

export async function handleDispatchOrderToManufacturingPartner(
  ctx: HandlerContext,
  args: Args,
): Promise<HandlerResult> {
  const orderId = args["order_id"];
  if (!orderId || typeof orderId !== "string") {
    return { status: 400, body: "order_id (UUID string) is required" };
  }

  // Fetch the cabinet order
  let orders: CabinetOrderRow[];
  try {
    orders = await ctx.db.query<CabinetOrderRow>(
      `SELECT id, status, cut_list_pdf_url, cut_list_json, partner_id, order_reference
       FROM cabinet_orders
       WHERE id = $1::uuid`,
      orderId,
    );
  } catch {
    return { status: 500, body: "Database error fetching order" };
  }

  if (orders.length === 0) {
    return { status: 404, body: "Order not found" };
  }

  const order = orders[0];

  if (order.status === "dispatched") {
    return { status: 409, body: "Order has already been dispatched" };
  }

  if (order.status !== "approved") {
    return {
      status: 400,
      body: `Order must be in 'approved' status before dispatch; current status: ${order.status}`,
    };
  }

  if (!order.partner_id) {
    return { status: 400, body: "Order has no assigned manufacturing partner" };
  }

  if (!order.cut_list_json && !order.cut_list_pdf_url) {
    return { status: 400, body: "Order has no cut list package to dispatch" };
  }

  // Fetch manufacturing partner config
  let partners: ManufacturingPartnerRow[];
  try {
    partners = await ctx.db.query<ManufacturingPartnerRow>(
      `SELECT id, name, dispatch_method, api_endpoint, api_key, contact_email
       FROM manufacturing_partners
       WHERE id = $1::uuid`,
      order.partner_id,
    );
  } catch {
    return { status: 500, body: "Database error fetching manufacturing partner" };
  }

  if (partners.length === 0) {
    return { status: 404, body: "Assigned manufacturing partner not found" };
  }

  const partner = partners[0];

  // Dispatch via configured method
  let acknowledgment: string;

  if (partner.dispatch_method === "api" && partner.api_endpoint) {
    // Send cut list package to partner's REST API
    let apiResponse: Response;
    try {
      apiResponse = await fetch(partner.api_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(partner.api_key
            ? { Authorization: `Bearer ${partner.api_key}` }
            : {}),
        },
        body: JSON.stringify({
          order_reference: order.order_reference,
          order_id: order.id,
          cut_list: order.cut_list_json ?? null,
          cut_list_pdf_url: order.cut_list_pdf_url ?? null,
        }),
      });
    } catch {
      return { status: 502, body: "Failed to reach manufacturing partner API" };
    }

    if (!apiResponse.ok) {
      return {
        status: 502,
        body: `Manufacturing partner API returned HTTP ${apiResponse.status}`,
      };
    }

    let ackPayload: PartnerApiAck = {};
    try {
      ackPayload = (await apiResponse.json()) as PartnerApiAck;
    } catch {
      // Non-JSON response is acceptable — generate a local acknowledgment ID
    }
    acknowledgment =
      ackPayload.acknowledgment_id ??
      ackPayload.id ??
      ackPayload.reference ??
      `api-ack-${crypto.randomUUID()}`;
  } else if (partner.dispatch_method === "email" && partner.contact_email) {
    // Dispatch via email notification event — the notifications lego handles delivery
    try {
      await ctx.events.publish("dispatch.order_to_partner_email", {
        to: partner.contact_email,
        partner_name: partner.name,
        order_id: order.id,
        order_reference: order.order_reference,
        cut_list_pdf_url: order.cut_list_pdf_url ?? null,
        cut_list_json: order.cut_list_json ?? null,
      });
    } catch {
      return { status: 500, body: "Failed to enqueue dispatch email" };
    }
    acknowledgment = `email-dispatched-${new Date().toISOString()}`;
  } else {
    return {
      status: 400,
      body: `Partner dispatch method '${partner.dispatch_method}' is not configured or missing required credentials`,
    };
  }

  // Persist dispatched status, timestamp, and partner acknowledgment
  const dispatchedAt = new Date().toISOString();
  try {
    await ctx.db.execute(
      `UPDATE cabinet_orders
       SET status = 'dispatched',
           dispatched_at = $2::timestamptz,
           partner_acknowledgment = $3
       WHERE id = $1::uuid`,
      orderId,
      dispatchedAt,
      acknowledgment,
    );
  } catch {
    return { status: 500, body: "Database error recording dispatch" };
  }

  // Emit domain event for downstream listeners (audit log, notifications, etc.)
  await ctx.events.publish("order.dispatched", {
    order_id: orderId,
    order_reference: order.order_reference,
    partner_id: partner.id,
    partner_name: partner.name,
    dispatch_method: partner.dispatch_method,
    dispatched_at: dispatchedAt,
    acknowledgment,
  });

  return {
    status: 200,
    body: {
      order_id: orderId,
      order_reference: order.order_reference,
      status: "dispatched",
      partner_name: partner.name,
      dispatch_method: partner.dispatch_method,
      dispatched_at: dispatchedAt,
      acknowledgment,
    },
  };
}
