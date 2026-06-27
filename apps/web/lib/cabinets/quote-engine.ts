import { buildDb } from "@/lib/db";
import { getPricingConfig } from "@/lib/cabinets/pricing-rules";
import type { CutListItem } from "@/lib/cabinets/configurator-state";

// ── Types ────────────────────────────────────────────────────────────────────

export interface QuoteLine {
  label: string;
  description: string;
  amount_cents: number;
}

export interface CabinetQuote {
  id: string;
  design_id: string;
  user_id: string;
  design_name: string;
  wood_species_material_id: string | null;
  door_style_material_id: string | null;
  hardware_material_id: string | null;
  dimensions_json: string;
  total_sell_price_cents: number;
  deposit_amount_cents: number;
  line_items_json: string;
  status: "valid" | "expired" | "accepted" | "ordered";
  expires_at: string;
  created_at: string;
}

interface DesignRow {
  id: string;
  user_id: string;
  name: string;
  dimensions: string | { width: number; height: number; depth: number };
  wood_species_material_id: string | null;
  door_style_material_id: string | null;
  hardware_material_id: string | null;
}

interface MaterialCostRow {
  id: string;
  name: string;
  category: string;
  unit_cost_cents: number | null;
  finish_image_url: string | null;
}

interface CutListRow {
  items: string | CutListItem[];
}

// ── Lazy DDL ─────────────────────────────────────────────────────────────────

let _quoteTableReady = false;

async function ensureQuoteTable(): Promise<void> {
  if (_quoteTableReady) return;
  const db = buildDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS cabinet_quotes (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      design_id                text NOT NULL,
      user_id                  text NOT NULL,
      design_name              text NOT NULL DEFAULT '',
      wood_species_material_id text,
      door_style_material_id   text,
      hardware_material_id     text,
      dimensions_json          text NOT NULL DEFAULT '{}',
      materials_cost_cents     integer NOT NULL DEFAULT 0,
      labor_cost_cents         integer NOT NULL DEFAULT 0,
      hardware_cost_cents      integer NOT NULL DEFAULT 0,
      freight_cost_cents       integer NOT NULL DEFAULT 0,
      subtotal_cost_cents      integer NOT NULL DEFAULT 0,
      margin_multiplier        numeric(6,4) NOT NULL DEFAULT 1.45,
      total_sell_price_cents   integer NOT NULL DEFAULT 0,
      deposit_amount_cents     integer NOT NULL DEFAULT 0,
      line_items_json          text NOT NULL DEFAULT '[]',
      status                   text NOT NULL DEFAULT 'valid',
      expires_at               timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
      created_at               timestamptz NOT NULL DEFAULT now()
    )
  `);
  _quoteTableReady = true;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function computeTotalBoardFeet(items: CutListItem[]): number {
  return items.reduce((sum, item) => {
    return sum + (item.width_in * item.height_in * item.thickness_in * item.quantity) / 144;
  }, 0);
}

function countTotalParts(items: CutListItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

// ── Quote generation ─────────────────────────────────────────────────────────

export async function generateQuote(designId: string): Promise<CabinetQuote | null> {
  await ensureQuoteTable();
  const db = buildDb();

  const designRows = await db.query<DesignRow>(
    `SELECT id, user_id, name, dimensions, wood_species_material_id,
       door_style_material_id, hardware_material_id
     FROM cabinet_designs WHERE id = $1 LIMIT 1`,
    designId
  );
  if (!designRows[0]) return null;
  const design = designRows[0];

  const cutListRows = await db.query<CutListRow>(
    `SELECT items FROM cabinet_cut_lists
     WHERE design_id = $1 ORDER BY created_at DESC LIMIT 1`,
    designId
  );
  const cutListItems: CutListItem[] = cutListRows[0]
    ? typeof cutListRows[0].items === "string"
      ? (JSON.parse(cutListRows[0].items) as CutListItem[])
      : (cutListRows[0].items as CutListItem[])
    : [];

  const pricingConfig = await getPricingConfig();
  const marginMultiplier = pricingConfig?.margin_multiplier ?? 1.45;

  const materialIds = [
    design.wood_species_material_id,
    design.door_style_material_id,
    design.hardware_material_id,
  ].filter((v): v is string => v !== null && v !== undefined);

  const materialMap: Record<string, MaterialCostRow> = {};
  if (materialIds.length > 0) {
    const placeholders = materialIds.map((_, idx) => `$${idx + 1}`).join(", ");
    const matRows = await db.query<MaterialCostRow>(
      `SELECT id, name, category, unit_cost_cents, finish_image_url
       FROM cabinet_materials WHERE id IN (${placeholders})`,
      ...materialIds
    );
    for (const mat of matRows) {
      materialMap[mat.id] = mat;
    }
  }

  const totalBoardFeet = computeTotalBoardFeet(cutListItems);
  const totalParts = countTotalParts(cutListItems);

  const woodMat = design.wood_species_material_id ? materialMap[design.wood_species_material_id] : null;
  const doorMat = design.door_style_material_id ? materialMap[design.door_style_material_id] : null;
  const hwMat = design.hardware_material_id ? materialMap[design.hardware_material_id] : null;

  const woodUnitCost = woodMat?.unit_cost_cents ?? 30000;
  const boardFeetUsed = totalBoardFeet > 0 ? totalBoardFeet : 20;
  const materialsCost = Math.ceil(boardFeetUsed * woodUnitCost);

  const doorUnitCost = doorMat?.unit_cost_cents ?? 0;
  const doorPanelCount = Math.max(1, Math.floor(totalParts / 4));
  const doorCost = doorUnitCost > 0 ? Math.ceil(doorUnitCost * doorPanelCount) : 0;

  const laborHours = Math.max(Math.ceil(totalParts * 0.5), 8);
  const laborCost = laborHours * 4500;

  const hardwareCost = hwMat?.unit_cost_cents ?? 15000;

  const freightCost = 35000;

  const subtotalCost = materialsCost + doorCost + laborCost + hardwareCost + freightCost;
  const totalSellPrice = Math.ceil(subtotalCost * marginMultiplier);
  const depositAmount = Math.ceil(totalSellPrice / 2);

  const lineItems: QuoteLine[] = [
    {
      label: "Cabinet Materials & Panels",
      description: `${woodMat?.name ?? "Premium hardwood"} — ${boardFeetUsed.toFixed(1)} bd-ft${doorMat ? ` · ${doorMat.name} doors` : ""}`,
      amount_cents: Math.ceil((materialsCost + doorCost) * marginMultiplier),
    },
    {
      label: "Expert Fabrication & Finishing",
      description: `Custom cut, edge-banding, sanding & finish — est. ${laborHours} hrs`,
      amount_cents: Math.ceil(laborCost * marginMultiplier),
    },
    {
      label: "Installation Hardware",
      description: hwMat?.name ?? "Full cabinet hardware package (hinges, slides, handles)",
      amount_cents: Math.ceil(hardwareCost * marginMultiplier),
    },
    {
      label: "Freight & White-Glove Delivery",
      description: "Crating, insured shipping, and threshold delivery",
      amount_cents: Math.ceil(freightCost * marginMultiplier),
    },
  ];

  const dimensionsJson =
    typeof design.dimensions === "string"
      ? design.dimensions
      : JSON.stringify(design.dimensions);

  const quoteRows = await db.query<CabinetQuote>(
    `INSERT INTO cabinet_quotes (
       design_id, user_id, design_name,
       wood_species_material_id, door_style_material_id, hardware_material_id,
       dimensions_json,
       materials_cost_cents, labor_cost_cents, hardware_cost_cents, freight_cost_cents,
       subtotal_cost_cents, margin_multiplier,
       total_sell_price_cents, deposit_amount_cents, line_items_json,
       status, expires_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12, $13,
       $14, $15, $16,
       'valid', now() + interval '30 days'
     )
     RETURNING id, design_id, user_id, design_name,
       wood_species_material_id, door_style_material_id, hardware_material_id,
       dimensions_json, total_sell_price_cents, deposit_amount_cents,
       line_items_json, status, expires_at, created_at`,
    designId,
    design.user_id,
    design.name,
    design.wood_species_material_id ?? null,
    design.door_style_material_id ?? null,
    design.hardware_material_id ?? null,
    dimensionsJson,
    materialsCost + doorCost,
    laborCost,
    hardwareCost,
    freightCost,
    subtotalCost,
    marginMultiplier,
    totalSellPrice,
    depositAmount,
    JSON.stringify(lineItems)
  );

  return quoteRows[0] ?? null;
}

// ── Quote retrieval ───────────────────────────────────────────────────────────

export async function getQuoteById(quoteId: string): Promise<CabinetQuote | null> {
  await ensureQuoteTable();
  const db = buildDb();
  const rows = await db.query<CabinetQuote>(
    `SELECT id, design_id, user_id, design_name,
       wood_species_material_id, door_style_material_id, hardware_material_id,
       dimensions_json, total_sell_price_cents, deposit_amount_cents,
       line_items_json, status, expires_at, created_at
     FROM cabinet_quotes WHERE id = $1 LIMIT 1`,
    quoteId
  );
  const quote = rows[0];
  if (!quote) return null;
  if (quote.status === "valid" && new Date(quote.expires_at) < new Date()) {
    await db.execute(
      `UPDATE cabinet_quotes SET status = 'expired' WHERE id = $1`,
      quoteId
    );
    return { ...quote, status: "expired" };
  }
  return quote;
}

export async function getLatestQuoteForDesign(designId: string): Promise<CabinetQuote | null> {
  await ensureQuoteTable();
  const db = buildDb();
  const rows = await db.query<CabinetQuote>(
    `SELECT id, design_id, user_id, design_name,
       wood_species_material_id, door_style_material_id, hardware_material_id,
       dimensions_json, total_sell_price_cents, deposit_amount_cents,
       line_items_json, status, expires_at, created_at
     FROM cabinet_quotes
     WHERE design_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    designId
  );
  return rows[0] ?? null;
}
