import { syncOrderMilestones } from "@/lib/cabinets/order-tracker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Vercel Cron handler — syncs cabinet order milestones with their current
 * order status and fires milestone-reached events for any transitions.
 *
 * Protect with CRON_SECRET in Vercel dashboard / env vars.
 * Add to vercel.json:  { "crons": [{ "path": "/api/cron/order-status-sync", "schedule": "0 * * * *" }] }
 */
export async function GET(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const startMs = Date.now();

  try {
    const result = await syncOrderMilestones();
    const durationMs = Date.now() - startMs;

    console.info(
      `[cron/order-status-sync] completed synced=${result.synced} notifications=${result.notifications} duration=${durationMs}ms`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        synced: result.synced,
        notifications: result.notifications,
        duration_ms: durationMs,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/order-status-sync] error:", err);

    return new Response(
      JSON.stringify({ ok: false, error: message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
