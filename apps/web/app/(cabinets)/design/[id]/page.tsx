import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/admin-auth";
import { buildDb } from "@/lib/db";
import { getMaterialById } from "@/lib/cabinets/materials-catalogue";
import type { CabinetDesign, CutListItem } from "@/lib/cabinets/configurator-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return {
    title: `Cabinet Design — ${params.id.substring(0, 8).toUpperCase()}`,
    description: "View and manage your saved cabinet design.",
  };
}

const PAGE_STYLES = `
.design-detail-header { display: flex; align-items: flex-start; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
.design-detail-header h1 { margin: 0; }
.design-meta { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
.meta-card { background: #fafaf9; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem 1.25rem; min-width: 110px; }
.meta-card dt { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #888; margin-bottom: 0.3rem; }
.meta-card dd { font-size: 1.1rem; font-weight: 600; margin: 0; }
.materials-row { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
.mat-badge { display: flex; align-items: center; gap: 0.5rem; border: 1px solid #e5e7eb; border-radius: 6px; padding: 0.5rem 0.75rem; background: #fff; font-size: 0.85rem; }
.mat-badge-label { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #888; display: block; margin-bottom: 0.1rem; }
.cut-list-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; margin-bottom: 2rem; }
.cut-list-table th { text-align: left; padding: 0.5rem 0.75rem; font-size: 0.72rem; letter-spacing: 0.05em; text-transform: uppercase; color: #666; border-bottom: 2px solid #e5e7eb; }
.cut-list-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
.cut-list-table tr:last-child td { border-bottom: none; }
.action-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 2rem; }
.status-pill {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  background: #e6f4ea;
  color: #1b5e1f;
}
.status-pill.draft { background: #f3f4f6; color: #6b7280; }
.status-pill.quoted { background: #fef9c3; color: #854d0e; }
.status-pill.ordered { background: #dbeafe; color: #1e40af; }
`;

interface RawDesignRow {
  id: string;
  user_id: string;
  name: string;
  dimensions: string | { width: number; height: number; depth: number };
  wood_species_material_id: string | null;
  door_style_material_id: string | null;
  hardware_material_id: string | null;
  mozaik_project_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface CutListRow {
  items: string | CutListItem[];
  source: string;
  created_at: string;
}

export default async function DesignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = buildDb();
  let design: CabinetDesign | null = null;
  let cutListItems: CutListItem[] = [];
  let cutListSource = "parametric";
  let cutListDate: string | null = null;

  try {
    const rows = await db.query<RawDesignRow>(
      `SELECT * FROM cabinet_designs WHERE id = $1 AND user_id = $2 LIMIT 1`,
      params.id,
      user.id
    );
    if (rows[0]) {
      const row = rows[0];
      const dims =
        typeof row.dimensions === "string"
          ? (JSON.parse(row.dimensions) as { width: number; height: number; depth: number })
          : row.dimensions;
      design = { ...row, dimensions: dims } as CabinetDesign;
    }
  } catch {
    // Table may not exist yet
  }

  if (!design) notFound();

  // Fetch cut list
  try {
    const clRows = await db.query<CutListRow>(
      `SELECT items, source, created_at FROM cabinet_cut_lists
       WHERE design_id = $1 ORDER BY created_at DESC LIMIT 1`,
      design.id
    );
    if (clRows[0]) {
      const clRow = clRows[0];
      cutListItems =
        typeof clRow.items === "string"
          ? (JSON.parse(clRow.items) as CutListItem[])
          : clRow.items;
      cutListSource = clRow.source;
      cutListDate = clRow.created_at;
    }
  } catch {
    // Cut list table may not exist
  }

  // Fetch material names
  const [woodMat, doorMat, hwMat] = await Promise.all([
    design.wood_species_material_id ? getMaterialById(design.wood_species_material_id) : Promise.resolve(null),
    design.door_style_material_id ? getMaterialById(design.door_style_material_id) : Promise.resolve(null),
    design.hardware_material_id ? getMaterialById(design.hardware_material_id) : Promise.resolve(null),
  ]).catch(() => [null, null, null] as const);

  const { width, height, depth } = design.dimensions;
  const statusLabel = design.status ?? "draft";
  const updatedAt = new Date(design.updated_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
      <main>
        {/* Header */}
        <div className="design-detail-header">
          <div style={{ flex: 1 }}>
            <h1>{design.name}</h1>
            <p className="muted" style={{ marginTop: "0.25rem" }}>
              Last updated {updatedAt}
              {design.mozaik_project_id && (
                <span style={{ marginLeft: "0.75rem" }}>· Mozaik project linked</span>
              )}
            </p>
          </div>
          <span className={`status-pill ${statusLabel}`}>{statusLabel}</span>
        </div>

        {/* Dimension summary */}
        <dl className="design-meta">
          {(
            [
              ["Width", `${width}"`],
              ["Height", `${height}"`],
              ["Depth", `${depth}"`],
            ] as [string, string][]
          ).map(([label, val]) => (
            <div key={label} className="meta-card card">
              <dt>{label}</dt>
              <dd>{val}</dd>
            </div>
          ))}
        </dl>

        {/* Materials */}
        {(woodMat || doorMat || hwMat) && (
          <>
            <h2>Selected Materials</h2>
            <div className="materials-row">
              {woodMat && (
                <div className="mat-badge card">
                  <div>
                    <span className="mat-badge-label">Wood Species</span>
                    <span>{woodMat.name}</span>
                  </div>
                </div>
              )}
              {doorMat && (
                <div className="mat-badge card">
                  <div>
                    <span className="mat-badge-label">Door Style</span>
                    <span>{doorMat.name}</span>
                  </div>
                </div>
              )}
              {hwMat && (
                <div className="mat-badge card">
                  <div>
                    <span className="mat-badge-label">Hardware</span>
                    <span>{hwMat.name}</span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Cut list */}
        <h2>
          Cut List{" "}
          <span className="muted" style={{ fontSize: "0.8rem", fontWeight: 400 }}>
            ({cutListItems.length} parts · source: {cutListSource}
            {cutListDate && ` · ${new Date(cutListDate).toLocaleDateString()}`})
          </span>
        </h2>

        {cutListItems.length > 0 ? (
          <table className="cut-list-table">
            <thead>
              <tr>
                <th>Part</th>
                <th>Qty</th>
                <th>Width&Prime;</th>
                <th>Height&Prime;</th>
                <th>Thick&Prime;</th>
                <th>Material</th>
                <th>Edge Banding</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {cutListItems.map((item, idx) => (
                <tr key={idx}>
                  <td>{item.part_name}</td>
                  <td>{item.quantity}</td>
                  <td>{item.width_in.toFixed(2)}</td>
                  <td>{item.height_in.toFixed(2)}</td>
                  <td>{item.thickness_in.toFixed(2)}</td>
                  <td>{item.material}</td>
                  <td>{item.edge_banding ?? "—"}</td>
                  <td className="muted">{item.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            <p>No cut list generated yet. Save the design in the configurator to generate one.</p>
          </div>
        )}

        {/* Action row */}
        <div className="action-row">
          <Link href={`/design?id=${design.id}`} className="btn">
            Edit in Configurator
          </Link>
          <Link href={`/design/${design.id}/quote`} className="btn secondary">
            Get Quote
          </Link>
          <Link href="/design" className="btn secondary">
            New Design
          </Link>
        </div>
      </main>
    </>
  );
}
