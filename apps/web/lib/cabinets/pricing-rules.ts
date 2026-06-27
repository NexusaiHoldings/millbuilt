import { buildDb } from "@/lib/db";

// ── Types ───────────────────────────────────────────────────────────────────

export interface PricingConfig {
  id: string;
  margin_multiplier: number;
  min_order_value_cents: number;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface FreightRate {
  id: string;
  state_code: string;
  state_name: string;
  rate_cents: number;
  updated_at: string;
}

export interface OperatorMaterial {
  id: string;
  name: string;
  species: string | null;
  door_style: string | null;
  hardware_line: string | null;
  category: "wood" | "door_style" | "hardware";
  finish_image_url: string | null;
  carb_cert_url: string | null;
  description: string | null;
  carb_compliant: boolean;
  prop65_warning: boolean;
  configurator_slug: string;
  unit_cost_cents: number | null;
  active: boolean;
  created_at: string;
}

export interface CreateMaterialInput {
  name: string;
  species?: string | null;
  door_style?: string | null;
  hardware_line?: string | null;
  category: "wood" | "door_style" | "hardware";
  finish_image_url?: string | null;
  carb_cert_url?: string | null;
  description?: string | null;
  carb_compliant: boolean;
  prop65_warning: boolean;
  configurator_slug: string;
  unit_cost_cents?: number | null;
}

export type UpdateMaterialInput = Partial<CreateMaterialInput>;

/** Pure helper — computes effective gross margin % and break-even revenue. */
export function computeBreakEven(
  marginMultiplier: number,
  minOrderValueCents: number
): { grossMarginPct: number; breakEvenRevenueCents: number } {
  const grossMarginPct =
    marginMultiplier > 0 ? (1 - 1 / marginMultiplier) * 100 : 0;
  const breakEvenRevenueCents =
    grossMarginPct > 0
      ? Math.ceil(minOrderValueCents / (grossMarginPct / 100))
      : 0;
  return { grossMarginPct, breakEvenRevenueCents };
}

// ── Lazy DDL ─────────────────────────────────────────────────────────────────

let _tablesReady = false;

async function ensureTablesExist(): Promise<void> {
  if (_tablesReady) return;
  const db = buildDb();

  await db.execute(
    `CREATE TABLE IF NOT EXISTS cabinet_materials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      species TEXT,
      door_style TEXT,
      hardware_line TEXT,
      category TEXT NOT NULL DEFAULT 'wood',
      finish_image_url TEXT,
      description TEXT,
      carb_compliant BOOLEAN NOT NULL DEFAULT FALSE,
      prop65_warning BOOLEAN NOT NULL DEFAULT FALSE,
      configurator_slug TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await db.execute(
    `ALTER TABLE cabinet_materials ADD COLUMN IF NOT EXISTS unit_cost_cents INTEGER DEFAULT NULL`
  );
  await db.execute(
    `ALTER TABLE cabinet_materials ADD COLUMN IF NOT EXISTS carb_cert_url TEXT DEFAULT NULL`
  );
  await db.execute(
    `CREATE TABLE IF NOT EXISTS cabinet_pricing_config (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      margin_multiplier NUMERIC(6,4) NOT NULL DEFAULT 1.45,
      min_order_value_cents INTEGER NOT NULL DEFAULT 50000,
      notes TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT
    )`
  );
  await db.execute(
    `CREATE TABLE IF NOT EXISTS cabinet_freight_rates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      state_code TEXT NOT NULL,
      state_name TEXT NOT NULL,
      rate_cents INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS cabinet_freight_rates_state_idx
     ON cabinet_freight_rates (state_code)`
  );

  _tablesReady = true;
}

// ── Pricing config ────────────────────────────────────────────────────────────

export async function getPricingConfig(): Promise<PricingConfig | null> {
  await ensureTablesExist();
  const db = buildDb();
  const rows = await db.query<PricingConfig>(
    `SELECT id, CAST(margin_multiplier AS FLOAT) AS margin_multiplier,
       min_order_value_cents, notes, updated_at, updated_by
     FROM cabinet_pricing_config
     ORDER BY updated_at DESC LIMIT 1`
  );
  return rows[0] ?? null;
}

export async function upsertPricingConfig(
  data: {
    margin_multiplier?: number;
    min_order_value_cents?: number;
    notes?: string | null;
  },
  adminUserId: string
): Promise<PricingConfig> {
  await ensureTablesExist();
  const db = buildDb();
  const existing = await getPricingConfig();

  if (existing) {
    const rows = await db.query<PricingConfig>(
      `UPDATE cabinet_pricing_config
       SET margin_multiplier = $1, min_order_value_cents = $2, notes = $3,
           updated_at = NOW(), updated_by = $4
       WHERE id = $5
       RETURNING id, CAST(margin_multiplier AS FLOAT) AS margin_multiplier,
         min_order_value_cents, notes, updated_at, updated_by`,
      data.margin_multiplier ?? existing.margin_multiplier,
      data.min_order_value_cents ?? existing.min_order_value_cents,
      data.notes !== undefined ? data.notes : existing.notes,
      adminUserId,
      existing.id
    );
    return rows[0];
  }

  const rows = await db.query<PricingConfig>(
    `INSERT INTO cabinet_pricing_config
       (margin_multiplier, min_order_value_cents, notes, updated_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, CAST(margin_multiplier AS FLOAT) AS margin_multiplier,
       min_order_value_cents, notes, updated_at, updated_by`,
    data.margin_multiplier ?? 1.45,
    data.min_order_value_cents ?? 50000,
    data.notes ?? null,
    adminUserId
  );
  return rows[0];
}

// ── Freight rates ─────────────────────────────────────────────────────────────

export async function getFreightRates(): Promise<FreightRate[]> {
  await ensureTablesExist();
  const db = buildDb();
  return db.query<FreightRate>(
    `SELECT id, state_code, state_name, rate_cents, updated_at
     FROM cabinet_freight_rates
     ORDER BY state_name ASC`
  );
}

export async function upsertFreightRate(
  data: { id?: string; state_code: string; state_name: string; rate_cents: number }
): Promise<FreightRate> {
  await ensureTablesExist();
  const db = buildDb();

  if (data.id) {
    const rows = await db.query<FreightRate>(
      `UPDATE cabinet_freight_rates
       SET state_code = $1, state_name = $2, rate_cents = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, state_code, state_name, rate_cents, updated_at`,
      data.state_code,
      data.state_name,
      data.rate_cents,
      data.id
    );
    return rows[0];
  }

  const rows = await db.query<FreightRate>(
    `INSERT INTO cabinet_freight_rates (state_code, state_name, rate_cents)
     VALUES ($1, $2, $3)
     ON CONFLICT (state_code)
     DO UPDATE SET state_name = EXCLUDED.state_name,
                   rate_cents = EXCLUDED.rate_cents,
                   updated_at = NOW()
     RETURNING id, state_code, state_name, rate_cents, updated_at`,
    data.state_code,
    data.state_name,
    data.rate_cents
  );
  return rows[0];
}

export async function deleteFreightRate(id: string): Promise<void> {
  await ensureTablesExist();
  const db = buildDb();
  await db.execute(`DELETE FROM cabinet_freight_rates WHERE id = $1`, id);
}

// ── Materials (operator view, includes cost + inactive) ──────────────────────

export async function getOperatorMaterials(): Promise<OperatorMaterial[]> {
  await ensureTablesExist();
  const db = buildDb();
  return db.query<OperatorMaterial>(
    `SELECT id, name, species, door_style, hardware_line, category,
       finish_image_url, carb_cert_url, description, carb_compliant, prop65_warning,
       configurator_slug, unit_cost_cents, active, created_at
     FROM cabinet_materials
     ORDER BY
       CASE category
         WHEN 'wood'       THEN 1
         WHEN 'door_style' THEN 2
         WHEN 'hardware'   THEN 3
         ELSE 4
       END,
       name ASC`
  );
}

export async function createMaterial(
  input: CreateMaterialInput
): Promise<OperatorMaterial> {
  await ensureTablesExist();
  const db = buildDb();
  const rows = await db.query<OperatorMaterial>(
    `INSERT INTO cabinet_materials
       (name, species, door_style, hardware_line, category,
        finish_image_url, carb_cert_url, description,
        carb_compliant, prop65_warning, configurator_slug, unit_cost_cents, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE)
     RETURNING id, name, species, door_style, hardware_line, category,
       finish_image_url, carb_cert_url, description, carb_compliant, prop65_warning,
       configurator_slug, unit_cost_cents, active, created_at`,
    input.name,
    input.species ?? null,
    input.door_style ?? null,
    input.hardware_line ?? null,
    input.category,
    input.finish_image_url ?? null,
    input.carb_cert_url ?? null,
    input.description ?? null,
    input.carb_compliant,
    input.prop65_warning,
    input.configurator_slug,
    input.unit_cost_cents ?? null
  );
  return rows[0];
}

export async function updateMaterial(
  id: string,
  input: UpdateMaterialInput
): Promise<OperatorMaterial | null> {
  await ensureTablesExist();
  const db = buildDb();

  const colMap: Array<[keyof UpdateMaterialInput, string]> = [
    ["name", "name"],
    ["species", "species"],
    ["door_style", "door_style"],
    ["hardware_line", "hardware_line"],
    ["category", "category"],
    ["finish_image_url", "finish_image_url"],
    ["carb_cert_url", "carb_cert_url"],
    ["description", "description"],
    ["carb_compliant", "carb_compliant"],
    ["prop65_warning", "prop65_warning"],
    ["configurator_slug", "configurator_slug"],
    ["unit_cost_cents", "unit_cost_cents"],
  ];

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, col] of colMap) {
    if (key in input) {
      setClauses.push(`${col} = $${idx}`);
      values.push(input[key] ?? null);
      idx++;
    }
  }

  if (setClauses.length === 0) return null;

  values.push(id);
  const rows = await db.query<OperatorMaterial>(
    `UPDATE cabinet_materials SET ${setClauses.join(", ")}
     WHERE id = $${idx}
     RETURNING id, name, species, door_style, hardware_line, category,
       finish_image_url, carb_cert_url, description, carb_compliant, prop65_warning,
       configurator_slug, unit_cost_cents, active, created_at`,
    ...values
  );
  return rows[0] ?? null;
}

export async function setMaterialActive(
  id: string,
  active: boolean
): Promise<void> {
  await ensureTablesExist();
  const db = buildDb();
  await db.execute(
    `UPDATE cabinet_materials SET active = $1 WHERE id = $2`,
    active,
    id
  );
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function logPricingAudit(
  adminUserId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  payload: Record<string, unknown>
): Promise<void> {
  const db = buildDb();
  const safeUserId =
    adminUserId && adminUserId.length > 0
      ? adminUserId
      : "00000000-0000-0000-0000-000000000000";
  try {
    await db.execute(
      `INSERT INTO admin_audit_log
         (admin_user_id, action, target_type, target_id, payload)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb)`,
      safeUserId,
      action,
      targetType,
      targetId,
      JSON.stringify(payload)
    );
  } catch {
    // Audit log write failures are non-fatal — never block the primary operation
  }
}
