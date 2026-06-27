"use server";

import { buildDb } from "@/lib/db";
import { getSessionUser } from "@/lib/admin-auth";
import type { CabinetDesign, CabinetDimensions } from "@/lib/cabinets/configurator-state";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RuleStatus = "pass" | "warn" | "fail";

export interface ValidationRuleResult {
  rule_id: string;
  rule_name: string;
  status: RuleStatus;
  message: string;
  suggestion: string | null;
  affected_dimension: string | null;
}

export interface DesignValidationResult {
  overall_status: RuleStatus;
  can_proceed_to_quote: boolean;
  rules: ValidationRuleResult[];
  validated_at: string;
  design_id: string;
}

// ── Structural constants ──────────────────────────────────────────────────────

const MAX_SPAN_STANDARD = 36;       // inches — safe span for 3/4" material
const MAX_SPAN_THIN = 28;           // inches — safe span for 1/2" material
const MAX_SPAN_HARD_FAIL = 48;      // inches — above this always fails
const WALL_CABINET_MAX_DEPTH = 15;  // inches — deeper units are floor-standing
const THICKNESS_STANDARD = 0.75;   // inches (3/4")
const THICKNESS_THIN = 0.5;        // inches (1/2")
const TALL_CABINET_HEIGHT = 54;    // inches — above this = tall/pantry unit
const MAX_WALL_WEIGHT_STANDARD = 150; // lbs — per standard dual-anchor pair
const MAX_WALL_WEIGHT_HARD_FAIL = 225; // lbs — 1.5× standard; requires French cleat + 3+ studs
const WOOD_DENSITY = 0.025;        // lbs per cubic inch (mixed hardwood approx.)

// ── Thickness inference ───────────────────────────────────────────────────────

function inferThickness(dims: CabinetDimensions): number {
  // Shallow wall cabinets (depth ≤ 12") typically use 1/2" sheet goods.
  // All deeper units use 3/4" as standard case construction.
  return dims.depth <= 12 ? THICKNESS_THIN : THICKNESS_STANDARD;
}

function cabinetType(dims: CabinetDimensions): "wall" | "base" | "tall" {
  if (dims.depth <= WALL_CABINET_MAX_DEPTH) return "wall";
  if (dims.height > TALL_CABINET_HEIGHT) return "tall";
  return "base";
}

// ── Rule: span limit ──────────────────────────────────────────────────────────

function checkSpanLimit(
  dims: CabinetDimensions,
  thickness: number
): ValidationRuleResult {
  const { width } = dims;
  const maxSafe = thickness >= THICKNESS_STANDARD ? MAX_SPAN_STANDARD : MAX_SPAN_THIN;
  const thicknessLabel = thickness >= THICKNESS_STANDARD ? '3/4"' : '1/2"';

  if (width > MAX_SPAN_HARD_FAIL) {
    return {
      rule_id: "span_limit",
      rule_name: "Unsupported Span Limit",
      status: "fail",
      message: `Width ${width}" exceeds the ${MAX_SPAN_HARD_FAIL}" maximum unsupported span for ${thicknessLabel} material. Risk of catastrophic deflection under load.`,
      suggestion: `Reduce width to ≤${MAX_SPAN_HARD_FAIL}" or add a center stile at the midpoint (allows up to ${MAX_SPAN_HARD_FAIL * 2}" total width with two bays).`,
      affected_dimension: "width",
    };
  }

  if (width > maxSafe) {
    return {
      rule_id: "span_limit",
      rule_name: "Unsupported Span Limit",
      status: "warn",
      message: `Width ${width}" exceeds the ${maxSafe}" safe span for ${thicknessLabel} material. Long-term sagging risk with heavy loads.`,
      suggestion: `Reduce span to ≤${maxSafe}" or add a center stile. Alternatively upgrade case stock to 3/4" plywood if using 1/2" material.`,
      affected_dimension: "width",
    };
  }

  return {
    rule_id: "span_limit",
    rule_name: "Unsupported Span Limit",
    status: "pass",
    message: `Width ${width}" is within the ${maxSafe}" safe span for ${thicknessLabel} material.`,
    suggestion: null,
    affected_dimension: "width",
  };
}

// ── Rule: hinge clearance ─────────────────────────────────────────────────────

function checkHingeClearance(dims: CabinetDimensions): ValidationRuleResult {
  const { width, height, depth } = dims;

  // Tall or deep cabinets with wide doors need heavy-duty hinge sets
  if (height > TALL_CABINET_HEIGHT && width > 24) {
    const estDoorWeightLbs = Math.round((width * height * THICKNESS_STANDARD * WOOD_DENSITY) / 2);
    return {
      rule_id: "hinge_clearance",
      rule_name: "Hinge & Door Swing Clearance",
      status: "warn",
      message: `Tall cabinet (${height}"H × ${width}"W) requires heavy-duty hinges. Estimated door weight: ~${estDoorWeightLbs} lbs.`,
      suggestion: `Use three-point hinge sets (top/middle/bottom) rated ≥${estDoorWeightLbs + 10} lbs per door. Verify 2" minimum clearance on both door-swing sides.`,
      affected_dimension: "height",
    };
  }

  // Deep cabinets with wide doors risk swing obstruction at corners
  if (depth > 24 && width > 18) {
    return {
      rule_id: "hinge_clearance",
      rule_name: "Hinge & Door Swing Clearance",
      status: "warn",
      message: `Depth ${depth}" with width ${width}" may restrict full door swing in corner or tight-clearance installations.`,
      suggestion: `Verify ≥2" clearance between fully-opened door edge and any adjacent surface. Consider 165° soft-close hinges or a lazy-Susan configuration.`,
      affected_dimension: "depth",
    };
  }

  // Wide single-door swing radius alert (> 24" is awkward)
  if (width > 24) {
    return {
      rule_id: "hinge_clearance",
      rule_name: "Hinge & Door Swing Clearance",
      status: "warn",
      message: `Single-door swing radius of ${width}" requires significant front clearance.`,
      suggestion: `Convert to double-door configuration to reduce each leaf to ${Math.ceil(width / 2)}", or verify at least ${Math.ceil(width * 0.9)}" of unobstructed swing space.`,
      affected_dimension: "width",
    };
  }

  return {
    rule_id: "hinge_clearance",
    rule_name: "Hinge & Door Swing Clearance",
    status: "pass",
    message: `Door swing radius of ${width}" and depth ${depth}" are within clearance limits for standard installation.`,
    suggestion: null,
    affected_dimension: null,
  };
}

// ── Rule: material thickness ──────────────────────────────────────────────────

function checkMaterialThickness(
  dims: CabinetDimensions,
  thickness: number
): ValidationRuleResult {
  const { width, height, depth } = dims;
  const cabinet = cabinetType(dims);
  const thicknessLabel = thickness >= THICKNESS_STANDARD ? '3/4"' : '1/2"';

  // Thin material on tall (load-bearing) units is a hard fail
  if (thickness < THICKNESS_STANDARD && cabinet === "tall") {
    return {
      rule_id: "material_thickness",
      rule_name: "Material Thickness — Load Bearing",
      status: "fail",
      message: `Tall cabinet (${height}"H) with inferred ${thicknessLabel} case stock does not meet structural requirements. Minimum 3/4" required for units taller than ${TALL_CABINET_HEIGHT}".`,
      suggestion: `Upgrade all case panels to 3/4" (0.75") plywood. Reserve ${thicknessLabel} stock for the cabinet back and drawer bottoms only.`,
      affected_dimension: "height",
    };
  }

  // Thin material on wide base cabinets — warn
  if (thickness < THICKNESS_STANDARD && cabinet === "base" && width > 30) {
    return {
      rule_id: "material_thickness",
      rule_name: "Material Thickness — Load Bearing",
      status: "warn",
      message: `Base cabinet ${width}"W with inferred ${thicknessLabel} panels may flex under countertop load. Standard requires 3/4" for widths over 30".`,
      suggestion: `Upgrade side, top, and bottom panels to 3/4" plywood. The back panel may remain ${thicknessLabel}.`,
      affected_dimension: "width",
    };
  }

  // Abnormally shallow floor-standing unit
  if (cabinet !== "wall" && depth < 12) {
    return {
      rule_id: "material_thickness",
      rule_name: "Material Thickness — Load Bearing",
      status: "warn",
      message: `Floor-standing unit with depth ${depth}" is unusually shallow and may tip under load. Standard base cabinet depth is 24".`,
      suggestion: `Increase depth to ≥12" minimum, or ≥24" for standard base cabinet proportions. Tip-over risk increases significantly below 12".`,
      affected_dimension: "depth",
    };
  }

  return {
    rule_id: "material_thickness",
    rule_name: "Material Thickness — Load Bearing",
    status: "pass",
    message: `${thicknessLabel} case stock is appropriate for a ${cabinet} cabinet (${width}"W × ${height}"H × ${depth}"D).`,
    suggestion: null,
    affected_dimension: null,
  };
}

// ── Rule: wall-mount weight ───────────────────────────────────────────────────

function checkWallMountWeight(
  dims: CabinetDimensions,
  thickness: number
): ValidationRuleResult {
  const { width, height, depth } = dims;
  const cabinet = cabinetType(dims);

  if (cabinet !== "wall") {
    return {
      rule_id: "wall_mount_weight",
      rule_name: "Wall-Mount Weight Threshold",
      status: "pass",
      message: `Floor-standing ${cabinet} cabinet — wall-mount weight rules do not apply.`,
      suggestion: null,
      affected_dimension: null,
    };
  }

  // Shell surface area (two sides + top + bottom + back)
  const shellAreaIn2 = 2 * height * depth + 2 * width * depth + width * height;
  const shellWeightLbs = shellAreaIn2 * thickness * WOOD_DENSITY;

  // Contents estimate: assume ~3 lbs/sq-ft per shelf, one shelf per 12" of height
  const shelfCount = Math.max(1, Math.ceil(height / 12));
  const contentsLbs = ((width * depth) / 144) * 3 * shelfCount;

  const totalLbs = Math.round(shellWeightLbs + contentsLbs);
  if (totalLbs > MAX_WALL_WEIGHT_HARD_FAIL) {
    return {
      rule_id: "wall_mount_weight",
      rule_name: "Wall-Mount Weight Threshold",
      status: "fail",
      message: `Estimated loaded weight of ${totalLbs} lbs exceeds the ${MAX_WALL_WEIGHT_HARD_FAIL} lb hard-fail threshold for standard wall anchors.`,
      suggestion: `Reduce to ≤36"W × 42"H × 15"D for standard mounting. For oversized units, use continuous French cleats rated ≥${Math.ceil(totalLbs * 1.5)} lbs and anchor into at least 3 studs.`,
      affected_dimension: "weight",
    };
  }

  if (totalLbs > MAX_WALL_WEIGHT_STANDARD) {
    return {
      rule_id: "wall_mount_weight",
      rule_name: "Wall-Mount Weight Threshold",
      status: "warn",
      message: `Estimated loaded weight of ${totalLbs} lbs exceeds the ${MAX_WALL_WEIGHT_STANDARD} lb standard threshold. Heavy-duty mounting hardware required.`,
      suggestion: `Anchor into ≥2 studs with 3" #10 wood screws. Consider a French cleat system rated for ≥${Math.ceil(totalLbs * 2)} lbs for added safety margin.`,
      affected_dimension: "weight",
    };
  }

  return {
    rule_id: "wall_mount_weight",
    rule_name: "Wall-Mount Weight Threshold",
    status: "pass",
    message: `Estimated loaded weight of ${totalLbs} lbs is within the ${MAX_WALL_WEIGHT_STANDARD} lb standard wall-mount threshold.`,
    suggestion: null,
    affected_dimension: null,
  };
}

// ── Aggregation ───────────────────────────────────────────────────────────────

function deriveOverall(rules: ValidationRuleResult[]): RuleStatus {
  if (rules.some((r) => r.status === "fail")) return "fail";
  if (rules.some((r) => r.status === "warn")) return "warn";
  return "pass";
}

// ── Column migration (idempotent) ─────────────────────────────────────────────

let _migrated = false;

async function ensureValidationColumn(): Promise<void> {
  if (_migrated) return;
  const db = buildDb();
  await db.execute(
    `ALTER TABLE cabinet_designs ADD COLUMN IF NOT EXISTS validation_result jsonb`
  );
  _migrated = true;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function validateDesign(
  designId: string
): Promise<DesignValidationResult | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const db = buildDb();
  let design: CabinetDesign | null = null;

  try {
    const rows = await db.query<CabinetDesign>(
      `SELECT * FROM cabinet_designs WHERE id = $1 AND user_id = $2 LIMIT 1`,
      designId,
      user.id
    );
    if (!rows[0]) return null;
    const row = rows[0];
    if (typeof row.dimensions === "string") {
      row.dimensions = JSON.parse(row.dimensions) as CabinetDimensions;
    }
    design = row;
  } catch {
    return null;
  }

  const dims = design.dimensions;
  const thickness = inferThickness(dims);

  const rules: ValidationRuleResult[] = [
    checkSpanLimit(dims, thickness),
    checkHingeClearance(dims),
    checkMaterialThickness(dims, thickness),
    checkWallMountWeight(dims, thickness),
  ];

  const overall_status = deriveOverall(rules);
  const result: DesignValidationResult = {
    overall_status,
    can_proceed_to_quote: overall_status !== "fail",
    rules,
    validated_at: new Date().toISOString(),
    design_id: designId,
  };

  try {
    await ensureValidationColumn();
    await db.execute(
      `UPDATE cabinet_designs
       SET validation_result = $1::jsonb, updated_at = now()
       WHERE id = $2 AND user_id = $3`,
      JSON.stringify(result),
      designId,
      user.id
    );
  } catch {
    // Non-fatal: return result even if persistence fails
  }

  return result;
}

export async function getValidationResult(
  designId: string
): Promise<DesignValidationResult | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const db = buildDb();
  try {
    await ensureValidationColumn();
    const rows = await db.query<{ validation_result: string | DesignValidationResult | null }>(
      `SELECT validation_result FROM cabinet_designs WHERE id = $1 AND user_id = $2 LIMIT 1`,
      designId,
      user.id
    );
    if (!rows[0] || rows[0].validation_result == null) return null;
    const raw = rows[0].validation_result;
    if (typeof raw === "string") return JSON.parse(raw) as DesignValidationResult;
    return raw as DesignValidationResult;
  } catch {
    return null;
  }
}
