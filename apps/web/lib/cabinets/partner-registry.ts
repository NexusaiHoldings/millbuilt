import { buildDb } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ManufacturingPartner {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  api_endpoint: string | null;
  delivery_email: string | null;
  supported_states: string[];
  capacity_orders_per_week: number;
  carb_certified: boolean;
  lead_time_days: number;
  defect_rate_threshold: number;
  epa_tsca_cert_url: string | null;
  state_contractor_license: string | null;
  insurance_cert_url: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePartnerInput {
  name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  api_endpoint?: string | null;
  delivery_email?: string | null;
  supported_states?: string[];
  capacity_orders_per_week?: number;
  carb_certified?: boolean;
  lead_time_days?: number;
  defect_rate_threshold?: number;
  epa_tsca_cert_url?: string | null;
  state_contractor_license?: string | null;
  insurance_cert_url?: string | null;
  notes?: string | null;
}

export type UpdatePartnerInput = Partial<CreatePartnerInput>;

// ── Lazy DDL ──────────────────────────────────────────────────────────────────

let _tablesReady = false;

async function ensureTablesExist(): Promise<void> {
  if (_tablesReady) return;
  const db = buildDb();
  await db.execute(
    `CREATE TABLE IF NOT EXISTS cabinet_manufacturing_partners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      api_endpoint TEXT,
      delivery_email TEXT,
      supported_states TEXT[] NOT NULL DEFAULT '{}',
      capacity_orders_per_week INTEGER NOT NULL DEFAULT 10,
      carb_certified BOOLEAN NOT NULL DEFAULT FALSE,
      lead_time_days INTEGER NOT NULL DEFAULT 14,
      defect_rate_threshold NUMERIC(5,4) NOT NULL DEFAULT 0.0200,
      epa_tsca_cert_url TEXT,
      state_contractor_license TEXT,
      insurance_cert_url TEXT,
      notes TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  _tablesReady = true;
}

// ── Shared SELECT columns ─────────────────────────────────────────────────────

const COLS = `id, name, contact_name, contact_email, contact_phone,
  api_endpoint, delivery_email, supported_states,
  capacity_orders_per_week, carb_certified, lead_time_days,
  CAST(defect_rate_threshold AS FLOAT) AS defect_rate_threshold,
  epa_tsca_cert_url, state_contractor_license, insurance_cert_url,
  notes, active, created_at, updated_at`;

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getPartners(): Promise<ManufacturingPartner[]> {
  await ensureTablesExist();
  const db = buildDb();
  return db.query<ManufacturingPartner>(
    `SELECT ${COLS}
     FROM cabinet_manufacturing_partners
     ORDER BY active DESC, name ASC`
  );
}

export async function getActivePartners(): Promise<ManufacturingPartner[]> {
  await ensureTablesExist();
  const db = buildDb();
  return db.query<ManufacturingPartner>(
    `SELECT ${COLS}
     FROM cabinet_manufacturing_partners
     WHERE active = TRUE
     ORDER BY name ASC`
  );
}

export async function getPartnersByState(
  stateCode: string
): Promise<ManufacturingPartner[]> {
  await ensureTablesExist();
  const db = buildDb();
  const code = stateCode.trim().toUpperCase();
  return db.query<ManufacturingPartner>(
    `SELECT ${COLS}
     FROM cabinet_manufacturing_partners
     WHERE active = TRUE
       AND (supported_states = '{}' OR $1 = ANY(supported_states))
     ORDER BY lead_time_days ASC, name ASC`,
    code
  );
}

export async function getPartnerById(
  id: string
): Promise<ManufacturingPartner | null> {
  await ensureTablesExist();
  const db = buildDb();
  const rows = await db.query<ManufacturingPartner>(
    `SELECT ${COLS}
     FROM cabinet_manufacturing_partners
     WHERE id = $1`,
    id
  );
  return rows[0] ?? null;
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createPartner(
  input: CreatePartnerInput
): Promise<ManufacturingPartner> {
  await ensureTablesExist();
  const db = buildDb();
  const rows = await db.query<ManufacturingPartner>(
    `INSERT INTO cabinet_manufacturing_partners
       (name, contact_name, contact_email, contact_phone, api_endpoint,
        delivery_email, supported_states, capacity_orders_per_week,
        carb_certified, lead_time_days, defect_rate_threshold,
        epa_tsca_cert_url, state_contractor_license, insurance_cert_url, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING ${COLS}`,
    input.name,
    input.contact_name ?? null,
    input.contact_email ?? null,
    input.contact_phone ?? null,
    input.api_endpoint ?? null,
    input.delivery_email ?? null,
    input.supported_states ?? [],
    input.capacity_orders_per_week ?? 10,
    input.carb_certified ?? false,
    input.lead_time_days ?? 14,
    input.defect_rate_threshold ?? 0.02,
    input.epa_tsca_cert_url ?? null,
    input.state_contractor_license ?? null,
    input.insurance_cert_url ?? null,
    input.notes ?? null
  );
  return rows[0];
}

export async function updatePartner(
  id: string,
  input: UpdatePartnerInput
): Promise<ManufacturingPartner | null> {
  await ensureTablesExist();
  const db = buildDb();

  const colMap: Array<[keyof UpdatePartnerInput, string]> = [
    ["name", "name"],
    ["contact_name", "contact_name"],
    ["contact_email", "contact_email"],
    ["contact_phone", "contact_phone"],
    ["api_endpoint", "api_endpoint"],
    ["delivery_email", "delivery_email"],
    ["supported_states", "supported_states"],
    ["capacity_orders_per_week", "capacity_orders_per_week"],
    ["carb_certified", "carb_certified"],
    ["lead_time_days", "lead_time_days"],
    ["defect_rate_threshold", "defect_rate_threshold"],
    ["epa_tsca_cert_url", "epa_tsca_cert_url"],
    ["state_contractor_license", "state_contractor_license"],
    ["insurance_cert_url", "insurance_cert_url"],
    ["notes", "notes"],
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

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const rows = await db.query<ManufacturingPartner>(
    `UPDATE cabinet_manufacturing_partners
     SET ${setClauses.join(", ")}
     WHERE id = $${idx}
     RETURNING ${COLS}`,
    ...values
  );
  return rows[0] ?? null;
}

export async function setPartnerActive(
  id: string,
  active: boolean
): Promise<void> {
  await ensureTablesExist();
  const db = buildDb();
  await db.execute(
    `UPDATE cabinet_manufacturing_partners
     SET active = $1, updated_at = NOW()
     WHERE id = $2`,
    active,
    id
  );
}
