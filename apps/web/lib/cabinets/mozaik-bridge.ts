/**
 * Mozaik bridge — translates Mozaik CAD file-exchange output (XML project
 * files and CSV cut lists) into structured JSON cut lists.
 *
 * Mozaik is a Windows desktop CAD application with no public web SDK
 * (per feasibility_analysis key_technical_risks[0]).  Integration is via
 * file-exchange: the dealer designs in the Mozaik desktop app, exports an
 * XML project file or CSV cut list, and uploads it here.  This module parses
 * that output into a `CutListItem[]` that can be stored in cabinet_cut_lists.
 */

import { buildDb } from "@/lib/db";
import type { CutListItem } from "./configurator-state";

// ── Types ────────────────────────────────────────────────────────────────────

export interface MozaikProjectMeta {
  project_name: string;
  version: string;
  cabinet_count: number;
  exported_at: string;
}

export interface MozaikCabinetSpec {
  cabinet_id: string;
  name: string;
  width_in: number;
  height_in: number;
  depth_in: number;
  door_style: string | null;
  material: string | null;
}

export interface MozaikParsedOutput {
  meta: MozaikProjectMeta;
  cabinets: MozaikCabinetSpec[];
  cut_list: CutListItem[];
  raw_format: "xml" | "csv";
}

// ── XML helpers ──────────────────────────────────────────────────────────────

function xmlAttr(tag: string, attr: string): string | null {
  const re = new RegExp(`\\b${attr}\\s*=\\s*"([^"]*)"`, "i");
  const m = tag.match(re);
  return m ? m[1] : null;
}

function findOpenTags(xml: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}(\\s[^>]*)?>`, "gi");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[0]);
  }
  return results;
}

function xmlTextContent(xml: string, tagName: string): string | null {
  const re = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

// ── XML parser ───────────────────────────────────────────────────────────────

export function parseMozaikXml(xmlContent: string): MozaikParsedOutput {
  const projectTagMatch = xmlContent.match(/<MozaikProject([^>]*)>/i);
  const projectTag = projectTagMatch ? projectTagMatch[0] : "";
  const projectName =
    xmlAttr(projectTag, "name") ??
    xmlTextContent(xmlContent, "ProjectName") ??
    "Mozaik Design";
  const version = xmlAttr(projectTag, "version") ?? "1.0";

  // Extract cabinet specs
  const cabinetTags = findOpenTags(xmlContent, "Cabinet");
  const cabinets: MozaikCabinetSpec[] = cabinetTags.map((tag, idx) => {
    const dimTag = xmlContent.match(
      new RegExp(`<Dimensions([^>]*)>`, "i")
    );
    const dim = dimTag ? dimTag[0] : "";
    return {
      cabinet_id: xmlAttr(tag, "id") ?? String(idx + 1),
      name: xmlAttr(tag, "name") ?? `Cabinet ${idx + 1}`,
      width_in: parseFloat(xmlAttr(dim, "width") ?? xmlAttr(tag, "width") ?? "24"),
      height_in: parseFloat(xmlAttr(dim, "height") ?? xmlAttr(tag, "height") ?? "36"),
      depth_in: parseFloat(xmlAttr(dim, "depth") ?? xmlAttr(tag, "depth") ?? "12"),
      door_style: xmlAttr(tag, "doorStyle") ?? xmlAttr(tag, "door_style"),
      material: xmlAttr(tag, "material") ?? xmlAttr(tag, "wood"),
    };
  });

  // Extract Part tags (within CutList sections)
  const partTags = findOpenTags(xmlContent, "Part");
  const cut_list: CutListItem[] = partTags
    .map((tag) => ({
      part_name: xmlAttr(tag, "name") ?? xmlAttr(tag, "partName") ?? "Part",
      quantity: parseInt(
        xmlAttr(tag, "qty") ?? xmlAttr(tag, "quantity") ?? "1",
        10
      ),
      width_in: parseFloat(xmlAttr(tag, "width") ?? "0"),
      height_in: parseFloat(
        xmlAttr(tag, "height") ?? xmlAttr(tag, "length") ?? "0"
      ),
      thickness_in: parseFloat(xmlAttr(tag, "thickness") ?? "0.75"),
      material:
        xmlAttr(tag, "material") ?? xmlAttr(tag, "species") ?? "Unspecified",
      edge_banding:
        xmlAttr(tag, "edgeBanding") ??
        xmlAttr(tag, "edge_banding") ??
        null,
      notes: xmlAttr(tag, "notes") ?? xmlAttr(tag, "comment") ?? null,
    }))
    .filter((item) => item.width_in > 0 || item.height_in > 0);

  return {
    meta: {
      project_name: projectName,
      version,
      cabinet_count: cabinetTags.length,
      exported_at: new Date().toISOString(),
    },
    cabinets,
    cut_list,
    raw_format: "xml",
  };
}

// ── CSV parser ───────────────────────────────────────────────────────────────

export function parseMozaikCsv(csvContent: string): MozaikParsedOutput {
  const lines = csvContent
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  const emptyResult: MozaikParsedOutput = {
    meta: {
      project_name: "CSV Import",
      version: "1.0",
      cabinet_count: 0,
      exported_at: new Date().toISOString(),
    },
    cabinets: [],
    cut_list: [],
    raw_format: "csv",
  };

  if (lines.length < 2) return emptyResult;

  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/[\s\-]+/g, "_").replace(/[^a-z0-9_]/g, ""));

  function col(cols: string[], name: string, fallback = ""): string {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (cols[idx]?.trim() ?? fallback) : fallback;
  }

  const cut_list: CutListItem[] = lines
    .slice(1)
    .map((line) => {
      const cols = line.split(",");
      const partName =
        col(cols, "part_name") ||
        col(cols, "part") ||
        col(cols, "name") ||
        col(cols, "description") ||
        "Unknown";
      const qty = parseInt(
        col(cols, "qty") || col(cols, "quantity") || col(cols, "count") || "1",
        10
      );
      const width = parseFloat(col(cols, "width") || col(cols, "w") || "0");
      const height = parseFloat(
        col(cols, "height") ||
          col(cols, "h") ||
          col(cols, "length") ||
          col(cols, "l") ||
          "0"
      );
      const thickness = parseFloat(
        col(cols, "thickness") || col(cols, "thick") || col(cols, "t") || "0.75"
      );
      const material =
        col(cols, "material") ||
        col(cols, "species") ||
        col(cols, "wood") ||
        "Unspecified";
      const edgeBanding =
        col(cols, "edge_banding") ||
        col(cols, "edgebanding") ||
        col(cols, "edge") ||
        null;
      const notes =
        col(cols, "notes") || col(cols, "comment") || col(cols, "remarks") || null;

      return {
        part_name: partName,
        quantity: isNaN(qty) || qty < 1 ? 1 : qty,
        width_in: isNaN(width) ? 0 : width,
        height_in: isNaN(height) ? 0 : height,
        thickness_in: isNaN(thickness) || thickness <= 0 ? 0.75 : thickness,
        material,
        edge_banding: edgeBanding || null,
        notes: notes || null,
      };
    })
    .filter((item) => item.width_in > 0 || item.height_in > 0);

  return {
    meta: {
      project_name: "CSV Import",
      version: "1.0",
      cabinet_count: 1,
      exported_at: new Date().toISOString(),
    },
    cabinets: [],
    cut_list,
    raw_format: "csv",
  };
}

// ── Entry points ─────────────────────────────────────────────────────────────

export function processMozaikOutput(
  content: string,
  format: "xml" | "csv"
): MozaikParsedOutput {
  return format === "xml" ? parseMozaikXml(content) : parseMozaikCsv(content);
}

/**
 * Parse Mozaik file content and persist the cut list to cabinet_cut_lists.
 * Returns the parsed output so the caller can display results immediately.
 */
export async function saveMozaikCutListToDb(
  designId: string,
  content: string,
  format: "xml" | "csv"
): Promise<MozaikParsedOutput> {
  const parsed = processMozaikOutput(content, format);

  if (parsed.cut_list.length > 0) {
    const db = buildDb();
    const rawOutput = content.length <= 50_000 ? content : content.substring(0, 50_000);
    await db.execute(
      `INSERT INTO cabinet_cut_lists (design_id, items, source, raw_output)
       VALUES ($1, $2::jsonb, 'mozaik', $3)`,
      designId,
      JSON.stringify(parsed.cut_list),
      rawOutput
    );
  }

  return parsed;
}
