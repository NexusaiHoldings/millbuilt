"use server";

import { buildDb } from "@/lib/db";
import { getSessionUser } from "@/lib/admin-auth";
import { getMaterialsByCategory, type Material } from "@/lib/cabinets/materials-catalogue";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CabinetDimensions {
  width: number;   // inches, 9–60
  height: number;  // inches, 12–96
  depth: number;   // inches, 12–30
}

export interface CabinetDesign {
  id: string;
  user_id: string;
  name: string;
  dimensions: CabinetDimensions;
  wood_species_material_id: string | null;
  door_style_material_id: string | null;
  hardware_material_id: string | null;
  mozaik_project_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CutListItem {
  part_name: string;
  quantity: number;
  width_in: number;
  height_in: number;
  thickness_in: number;
  material: string;
  edge_banding: string | null;
  notes: string | null;
}

export type MaterialsForConfigurator = {
  wood: Material[];
  doorStyles: Material[];
  hardware: Material[];
};

// ── Table bootstrap ──────────────────────────────────────────────────────────

let _tablesReady = false;

async function ensureTables(): Promise<void> {
  if (_tablesReady) return;
  const db = buildDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS cabinet_designs (
      id                      uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                 text    NOT NULL,
      name                    text    NOT NULL DEFAULT 'Untitled Design',
      dimensions              jsonb   NOT NULL DEFAULT '{"width":24,"height":36,"depth":12}'::jsonb,
      wood_species_material_id text,
      door_style_material_id   text,
      hardware_material_id     text,
      mozaik_project_id        text,
      status                  text    NOT NULL DEFAULT 'draft',
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS cabinet_cut_lists (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      design_id   text NOT NULL,
      items       jsonb NOT NULL DEFAULT '[]'::jsonb,
      source      text NOT NULL DEFAULT 'parametric',
      raw_output  text,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
  _tablesReady = true;
}

// ── Server actions ───────────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  return getSessionUser();
}

export async function getMaterialsForConfigurator(): Promise<MaterialsForConfigurator> {
  try {
    const [wood, doorStyles, hardware] = await Promise.all([
      getMaterialsByCategory("wood"),
      getMaterialsByCategory("door_style"),
      getMaterialsByCategory("hardware"),
    ]);
    return { wood, doorStyles, hardware };
  } catch {
    return { wood: [], doorStyles: [], hardware: [] };
  }
}

export async function saveDesign(
  dimensions: CabinetDimensions,
  woodMaterialId: string | null,
  doorStyleMaterialId: string | null,
  hardwareMaterialId: string | null,
  designId?: string | null,
  name?: string | null
): Promise<{ ok: true; design: CabinetDesign } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  await ensureTables();
  const db = buildDb();

  try {
    if (designId) {
      const rows = await db.query<CabinetDesign>(
        `UPDATE cabinet_designs
         SET dimensions             = $1::jsonb,
             wood_species_material_id = $2,
             door_style_material_id   = $3,
             hardware_material_id     = $4,
             name                   = COALESCE($5, name),
             updated_at             = now()
         WHERE id = $6 AND user_id = $7
         RETURNING *`,
        JSON.stringify(dimensions),
        woodMaterialId,
        doorStyleMaterialId,
        hardwareMaterialId,
        name ?? null,
        designId,
        user.id
      );
      if (rows.length === 0) return { ok: false, error: "design_not_found" };
      return { ok: true, design: rows[0] };
    }

    const rows = await db.query<CabinetDesign>(
      `INSERT INTO cabinet_designs
         (user_id, name, dimensions, wood_species_material_id, door_style_material_id, hardware_material_id)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)
       RETURNING *`,
      user.id,
      name ?? "Untitled Design",
      JSON.stringify(dimensions),
      woodMaterialId,
      doorStyleMaterialId,
      hardwareMaterialId
    );
    return { ok: true, design: rows[0] };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function getDesignById(designId: string): Promise<CabinetDesign | null> {
  const user = await getSessionUser();
  if (!user) return null;

  await ensureTables();
  const db = buildDb();
  try {
    const rows = await db.query<CabinetDesign>(
      `SELECT * FROM cabinet_designs WHERE id = $1 AND user_id = $2 LIMIT 1`,
      designId,
      user.id
    );
    const row = rows[0];
    if (!row) return null;
    if (typeof row.dimensions === "string") {
      row.dimensions = JSON.parse(row.dimensions) as CabinetDimensions;
    }
    return row;
  } catch {
    return null;
  }
}

export async function listUserDesigns(): Promise<CabinetDesign[]> {
  const user = await getSessionUser();
  if (!user) return [];

  await ensureTables();
  const db = buildDb();
  try {
    const rows = await db.query<CabinetDesign>(
      `SELECT * FROM cabinet_designs WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50`,
      user.id
    );
    return rows.map((r) => {
      if (typeof r.dimensions === "string") {
        r.dimensions = JSON.parse(r.dimensions) as CabinetDimensions;
      }
      return r;
    });
  } catch {
    return [];
  }
}

export async function saveCutList(
  designId: string,
  items: CutListItem[],
  source: "mozaik" | "parametric",
  rawOutput?: string | null
): Promise<void> {
  await ensureTables();
  const db = buildDb();
  await db.execute(
    `INSERT INTO cabinet_cut_lists (design_id, items, source, raw_output)
     VALUES ($1, $2::jsonb, $3, $4)`,
    designId,
    JSON.stringify(items),
    source,
    rawOutput ?? null
  );
}

export async function getDesignCutList(
  designId: string
): Promise<{ items: CutListItem[]; source: string; created_at: string } | null> {
  await ensureTables();
  const db = buildDb();
  try {
    const rows = await db.query<{ items: CutListItem[] | string; source: string; created_at: string }>(
      `SELECT items, source, created_at FROM cabinet_cut_lists
       WHERE design_id = $1 ORDER BY created_at DESC LIMIT 1`,
      designId
    );
    if (!rows[0]) return null;
    const row = rows[0];
    const items: CutListItem[] =
      typeof row.items === "string" ? JSON.parse(row.items) : (row.items as CutListItem[]);
    return { items, source: row.source, created_at: row.created_at };
  } catch {
    return null;
  }
}
