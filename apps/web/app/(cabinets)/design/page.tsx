"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  getMaterialsForConfigurator,
  saveDesign,
  getCurrentUser,
  saveCutList,
  type CabinetDimensions,
  type CabinetDesign,
  type CutListItem,
  type MaterialsForConfigurator,
} from "@/lib/cabinets/configurator-state";
import type { Material } from "@/lib/cabinets/materials-catalogue";

// ── Styles ───────────────────────────────────────────────────────────────────

const PAGE_STYLES = `
.design-layout {
  display: grid;
  grid-template-columns: 1fr 380px;
  min-height: calc(100vh - 80px);
  gap: 0;
  align-items: start;
}
@media (max-width: 1024px) {
  .design-layout { grid-template-columns: 1fr; }
}
.panel-left {
  padding: 1.5rem 2rem;
  border-right: 1px solid #e5e7eb;
}
.panel-right {
  padding: 1.5rem;
  background: #fafaf9;
  position: relative;
}
.preview-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 340px;
  background: linear-gradient(145deg, #f5f0ea 0%, #ede6dc 100%);
  border-radius: 8px;
  border: 1px solid #e0d8cc;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}
.dim-controls {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.dim-group label { display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 0.4rem; letter-spacing: 0.04em; text-transform: uppercase; color: #666; }
.dim-group input[type=range] { width: 100%; }
.dim-value { font-size: 1rem; font-weight: 700; text-align: center; margin-top: 0.2rem; }
.save-bar { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.5rem; }
.save-status { font-size: 0.8rem; color: #666; }
.section-label { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #888; margin: 0 0 0.6rem; }
.mat-group { margin-bottom: 1.75rem; }
.mat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
.mat-card {
  cursor: pointer;
  border: 2px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
  background: #fff;
}
.mat-card:hover { border-color: #b8895a; }
.mat-card.selected { border-color: #1a1a1a; box-shadow: 0 0 0 1px #1a1a1a; }
.mat-thumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}
.mat-thumb-ph {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  background: linear-gradient(135deg, #ede0d0 0%, #cdb89a 100%);
}
.mat-card-label { font-size: 0.72rem; font-weight: 600; padding: 0.3rem 0.4rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mat-card.selected .mat-card-label { background: #1a1a1a; color: #fff; }
.sticky-cta {
  position: sticky;
  bottom: 0;
  background: #fafaf9;
  border-top: 1px solid #e5e7eb;
  padding: 1rem 0 0;
  margin-top: 1rem;
}
.cta-stack { display: flex; flex-direction: column; gap: 0.6rem; }
.design-name-input {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
  font-size: 0.9rem;
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 0.75rem;
}
.empty-hero {
  text-align: center;
  padding: 3rem 1rem;
  max-width: 540px;
  margin: 0 auto;
}
.empty-hero svg { margin: 0 auto 1.5rem; display: block; }
.start-btn { font-size: 1.1rem; padding: 0.85rem 2.5rem; }
.name-row { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 1rem; }
.name-row label { font-size: 0.82rem; font-weight: 600; white-space: nowrap; }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function woodBaseColor(name: string | null): string {
  if (!name) return "#c9a87c";
  const n = name.toLowerCase();
  if (n.includes("walnut")) return "#5c3317";
  if (n.includes("cherry")) return "#8b4513";
  if (n.includes("ebony") || n.includes("dark")) return "#2c1a0e";
  if (n.includes("oak")) return "#b8895a";
  if (n.includes("birch")) return "#d4b483";
  if (n.includes("pine")) return "#dfc496";
  if (n.includes("white") || n.includes("paint") || n.includes("mdf")) return "#ede8e0";
  if (n.includes("maple")) return "#c9a87c";
  return "#c9a87c";
}

function adjustHex(hex: string, factor: number): string {
  const h = hex.replace("#", "");
  const num = parseInt(h, 16);
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  const r = clamp(((num >> 16) & 0xff) * factor);
  const g = clamp(((num >> 8) & 0xff) * factor);
  const b = clamp((num & 0xff) * factor);
  return `rgb(${r},${g},${b})`;
}

function generateParametricCutList(dims: CabinetDimensions): CutListItem[] {
  const { width, height, depth } = dims;
  const t = 0.75;
  const shelves = Math.max(0, Math.floor((height - 12) / 12) - 1);
  return [
    { part_name: "Left Side Panel",  quantity: 1, width_in: depth, height_in: height, thickness_in: t, material: 'Plywood 3/4"', edge_banding: "front edge", notes: null },
    { part_name: "Right Side Panel", quantity: 1, width_in: depth, height_in: height, thickness_in: t, material: 'Plywood 3/4"', edge_banding: "front edge", notes: null },
    { part_name: "Top Panel",        quantity: 1, width_in: width - 2 * t, height_in: depth, thickness_in: t, material: 'Plywood 3/4"', edge_banding: "front edge", notes: null },
    { part_name: "Bottom Panel",     quantity: 1, width_in: width - 2 * t, height_in: depth, thickness_in: t, material: 'Plywood 3/4"', edge_banding: "front edge", notes: null },
    { part_name: "Back Panel",       quantity: 1, width_in: width - 2 * t, height_in: height - 2 * t, thickness_in: 0.25, material: 'Plywood 1/4"', edge_banding: null, notes: "dadoed into sides, top, and bottom" },
    { part_name: "Door Panel",       quantity: 1, width_in: width + 0.5, height_in: height + 0.5, thickness_in: t, material: "Door panel", edge_banding: "all edges", notes: "full-overlay door" },
    ...(shelves > 0 ? [{ part_name: "Adjustable Shelf", quantity: shelves, width_in: width - 2 * t - 0.125, height_in: depth - 2, thickness_in: t, material: 'Plywood 3/4"', edge_banding: "front edge", notes: "32mm pin hole spacing" }] : []),
  ];
}

// ── Cabinet SVG preview ───────────────────────────────────────────────────────

interface CabinetPreviewProps {
  dims: CabinetDimensions;
  woodName: string | null;
  doorStyleName: string | null;
  hardwareName: string | null;
}

function CabinetPreview({ dims, woodName, doorStyleName, hardwareName }: CabinetPreviewProps) {
  const { width, height, depth } = dims;
  const CANVAS_W = 280;
  const CANVAS_H = 320;
  const scaleX = CANVAS_W / (width + depth * 0.5 + 8);
  const scaleY = CANVAS_H / (height + depth * 0.28 + 8);
  const sc = Math.min(scaleX, scaleY, 11);

  const W = width * sc;
  const H = height * sc;
  const D = depth * sc;
  const ox = D * 0.5;
  const oy = D * 0.28;

  // Front face corners
  const fx = ox + 4, fy = oy + 4;

  // Top face (parallelogram above front)
  const topPts = `${fx},${fy} ${fx + W},${fy} ${fx + W - ox},${fy - oy} ${fx - ox},${fy - oy}`;
  // Right face (parallelogram right of front)
  const rightPts = `${fx + W},${fy} ${fx + W - ox},${fy - oy} ${fx + W - ox},${fy - oy + H} ${fx + W},${fy + H}`;

  const front = woodBaseColor(woodName);
  const top = adjustHex(front.startsWith("#") ? front : front, 1.25);
  const right = adjustHex(front.startsWith("#") ? front : front, 0.72);

  // Door inset
  const doorInset = Math.max(3, W * 0.06);
  const doorX = fx + doorInset;
  const doorY = fy + doorInset;
  const doorW = W - doorInset * 2;
  const doorH = H - doorInset * 2;

  // Door color: slightly different tone based on style
  const isDoorPaint = (doorStyleName ?? "").toLowerCase().includes("paint");
  const doorFill = isDoorPaint ? "#f0ece6" : adjustHex(front.startsWith("#") ? front : "#c9a87c", 0.88);

  // Handle color
  const hwColor = (hardwareName ?? "").toLowerCase().includes("brass")
    ? "#c8a951"
    : (hardwareName ?? "").toLowerCase().includes("bronze")
    ? "#8c6839"
    : "#888";

  const handleX = doorX + doorW * 0.82;
  const handleY1 = doorY + doorH * 0.38;
  const handleY2 = doorY + doorH * 0.62;

  const svgW = CANVAS_W + 8;
  const svgH = CANVAS_H + 8;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      width={svgW}
      height={svgH}
      style={{ display: "block", margin: "0 auto" }}
      aria-label={`3D preview: ${width}" × ${height}" × ${depth}" cabinet`}
    >
      {/* Top face — lightest */}
      <polygon points={topPts} fill={top} stroke="#33333340" strokeWidth="1" />
      {/* Right face — darkest */}
      <polygon points={rightPts} fill={right} stroke="#33333340" strokeWidth="1" />
      {/* Front face */}
      <rect x={fx} y={fy} width={W} height={H} fill={front} stroke="#333" strokeWidth="1" />
      {/* Door panel */}
      <rect x={doorX} y={doorY} width={doorW} height={doorH} fill={doorFill} stroke="#33333360" strokeWidth="0.8" rx="1" />
      {/* Door rail lines (shaker style hint) */}
      {(doorStyleName ?? "").toLowerCase().includes("shaker") && (
        <>
          <rect x={doorX + 6} y={doorY + 6} width={doorW - 12} height={doorH - 12} fill="none" stroke="#33333330" strokeWidth="1" rx="1" />
        </>
      )}
      {/* Handle */}
      <line x1={handleX} y1={handleY1} x2={handleX} y2={handleY2} stroke={hwColor} strokeWidth={Math.max(2, sc * 0.3)} strokeLinecap="round" />
      {/* Dimension annotations */}
      <text x={fx + W / 2} y={fy + H + 14} textAnchor="middle" fontSize="10" fill="#777">{width}&quot;W</text>
      <text x={fx - 6} y={fy + H / 2} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#777">{height}&quot;H</text>
    </svg>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="empty-hero">
      <svg width="200" height="160" viewBox="0 0 200 160" fill="none" aria-hidden="true">
        {/* Simplified kitchen cabinet illustration */}
        <rect x="10" y="60" width="180" height="90" rx="4" fill="#e8ddd0" stroke="#c9a87c" strokeWidth="1.5" />
        <rect x="10" y="60" width="85" height="90" fill="none" stroke="#c9a87c" strokeWidth="1.5" />
        <rect x="18" y="68" width="69" height="74" rx="2" fill="#d4bfa0" />
        <rect x="105" y="68" width="77" height="74" rx="2" fill="#d4bfa0" />
        <circle cx="92" cy="105" r="4" fill="#a87c55" />
        <circle cx="108" cy="105" r="4" fill="#a87c55" />
        {/* Counter top */}
        <rect x="5" y="55" width="190" height="8" rx="2" fill="#e0d4c0" stroke="#c9a87c" strokeWidth="1" />
        {/* Upper cabinets */}
        <rect x="30" y="10" width="140" height="40" rx="3" fill="#e8ddd0" stroke="#c9a87c" strokeWidth="1.5" />
        <rect x="30" y="10" width="66" height="40" fill="none" stroke="#c9a87c" strokeWidth="1.5" />
        <rect x="36" y="16" width="54" height="28" rx="2" fill="#d4bfa0" />
        <rect x="100" y="16" width="64" height="28" rx="2" fill="#d4bfa0" />
      </svg>
      <h1>Design Your Dream Cabinets</h1>
      <p>
        Configure custom cabinet dimensions, choose your wood species, door style, and hardware — then get an instant cut list and quote.
      </p>
      <button className="btn start-btn" onClick={onStart}>
        Start Designing
      </button>
    </div>
  );
}

// ── Material card ─────────────────────────────────────────────────────────────

function MaterialCard({
  material,
  selected,
  onSelect,
  placeholder,
}: {
  material: Material;
  selected: boolean;
  onSelect: () => void;
  placeholder: string;
}) {
  return (
    <button
      className={`mat-card${selected ? " selected" : ""}`}
      onClick={onSelect}
      title={material.name}
      aria-pressed={selected}
    >
      {material.finish_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={material.finish_image_url} alt={material.name} className="mat-thumb" loading="lazy" />
      ) : (
        <div className="mat-thumb-ph" aria-hidden="true">{placeholder}</div>
      )}
      <div className="mat-card-label">{material.name}</div>
    </button>
  );
}

// ── Main configurator ─────────────────────────────────────────────────────────

function ConfiguratorBody() {
  const searchParams = useSearchParams();
  const urlDesignId = searchParams.get("id");

  const [started, setStarted] = useState(false);
  const [dims, setDims] = useState<CabinetDimensions>({ width: 24, height: 36, depth: 12 });
  const [woodId, setWoodId] = useState<string | null>(null);
  const [doorStyleId, setDoorStyleId] = useState<string | null>(null);
  const [hardwareId, setHardwareId] = useState<string | null>(null);
  const [designId, setDesignId] = useState<string | null>(urlDesignId);
  const [designName, setDesignName] = useState("Untitled Design");
  const [materials, setMaterials] = useState<MaterialsForConfigurator>({ wood: [], doorStyles: [], hardware: [] });
  const [user, setUser] = useState<{ id: string; email: string } | null | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);

  // Fetch materials + auth on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [mats, currentUser] = await Promise.all([
        getMaterialsForConfigurator(),
        getCurrentUser(),
      ]);
      if (cancelled) return;
      setMaterials(mats);
      setUser(currentUser);
    })();
    return () => { cancelled = true; };
  }, []);

  // If URL has ?id= or ?material=, start immediately
  useEffect(() => {
    if (urlDesignId || searchParams.get("material")) {
      setStarted(true);
    }
    // Pre-select material from ?material= param
    const slug = searchParams.get("material");
    if (slug && materials.wood.length > 0) {
      const found =
        materials.wood.find((m) => m.configurator_slug === slug) ??
        materials.doorStyles.find((m) => m.configurator_slug === slug) ??
        materials.hardware.find((m) => m.configurator_slug === slug);
      if (found) {
        if (found.category === "wood") setWoodId(found.id);
        else if (found.category === "door_style") setDoorStyleId(found.id);
        else if (found.category === "hardware") setHardwareId(found.id);
      }
    }
  }, [urlDesignId, searchParams, materials]);

  // Mark dirty when state changes
  useEffect(() => {
    isDirtyRef.current = true;
  }, [dims, woodId, doorStyleId, hardwareId, designName]);

  // Auto-save every 30 seconds for authenticated users
  const performSave = useCallback(async (auto = false) => {
    if (!user) return;
    if (auto && !isDirtyRef.current) return;
    setIsSaving(true);
    setSaveError(null);
    isDirtyRef.current = false;
    const result = await saveDesign(dims, woodId, doorStyleId, hardwareId, designId, designName);
    setIsSaving(false);
    if (result.ok) {
      setDesignId(result.design.id);
      setLastSaved(new Date());
      // Persist cut list alongside design
      const cutList = generateParametricCutList(dims);
      await saveCutList(result.design.id, cutList, "parametric").catch(() => {});
    } else if (result.error !== "not_authenticated") {
      setSaveError(result.error);
    }
  }, [user, dims, woodId, doorStyleId, hardwareId, designId, designName]);

  useEffect(() => {
    if (!user || !started) return;
    autoSaveRef.current = setInterval(() => {
      void performSave(true);
    }, 30_000);
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [user, started, performSave]);

  const woodName = materials.wood.find((m) => m.id === woodId)?.name ?? null;
  const doorStyleName = materials.doorStyles.find((m) => m.id === doorStyleId)?.name ?? null;
  const hardwareName = materials.hardware.find((m) => m.id === hardwareId)?.name ?? null;

  if (!started) {
    return <EmptyState onStart={() => setStarted(true)} />;
  }

  const quoteHref = designId ? `/design/${designId}/quote` : "#";

  return (
    <div className="design-layout">
      {/* ── Left panel: preview + dimension controls ── */}
      <section className="panel-left">
        <h2 style={{ marginTop: 0, marginBottom: "1rem" }}>Cabinet Preview</h2>
        <div className="preview-wrap">
          <CabinetPreview
            dims={dims}
            woodName={woodName}
            doorStyleName={doorStyleName}
            hardwareName={hardwareName}
          />
        </div>

        <div className="dim-controls">
          {(["width", "height", "depth"] as const).map((axis) => {
            const labels: Record<string, string> = { width: "Width", height: "Height", depth: "Depth" };
            const mins: Record<string, number> = { width: 9, height: 12, depth: 12 };
            const maxs: Record<string, number> = { width: 60, height: 96, depth: 30 };
            return (
              <div key={axis} className="dim-group">
                <label htmlFor={`dim-${axis}`}>{labels[axis]}</label>
                <input
                  id={`dim-${axis}`}
                  type="range"
                  min={mins[axis]}
                  max={maxs[axis]}
                  value={dims[axis]}
                  onChange={(e) => setDims((d) => ({ ...d, [axis]: Number(e.target.value) }))}
                />
                <div className="dim-value">{dims[axis]}&Prime;</div>
              </div>
            );
          })}
        </div>

        <div className="save-bar">
          {user ? (
            <>
              <button className="btn secondary" onClick={() => void performSave(false)} disabled={isSaving}>
                {isSaving ? "Saving…" : "Save Design"}
              </button>
              {lastSaved && (
                <span className="save-status muted">
                  Saved {lastSaved.toLocaleTimeString()}
                </span>
              )}
              {saveError && <span className="save-status" style={{ color: "#b91c1c" }}>{saveError}</span>}
            </>
          ) : (
            <span className="save-status muted">
              <a href="/login">Sign in</a> to save your design
            </span>
          )}
        </div>
      </section>

      {/* ── Right panel: material selectors + CTA ── */}
      <section className="panel-right">
        <div className="name-row">
          <label htmlFor="design-name">Design name</label>
          <input
            id="design-name"
            className="design-name-input"
            value={designName}
            onChange={(e) => setDesignName(e.target.value)}
            maxLength={80}
            placeholder="Untitled Design"
          />
        </div>

        {/* Wood species */}
        <div className="mat-group">
          <p className="section-label">Wood Species</p>
          {materials.wood.length > 0 ? (
            <div className="mat-grid">
              {materials.wood.map((m) => (
                <MaterialCard
                  key={m.id}
                  material={m}
                  selected={woodId === m.id}
                  onSelect={() => setWoodId((prev) => (prev === m.id ? null : m.id))}
                  placeholder="🪵"
                />
              ))}
            </div>
          ) : (
            <p className="muted" style={{ fontSize: "0.82rem" }}>No wood species configured yet.</p>
          )}
        </div>

        {/* Door style */}
        <div className="mat-group">
          <p className="section-label">Door Style</p>
          {materials.doorStyles.length > 0 ? (
            <div className="mat-grid">
              {materials.doorStyles.map((m) => (
                <MaterialCard
                  key={m.id}
                  material={m}
                  selected={doorStyleId === m.id}
                  onSelect={() => setDoorStyleId((prev) => (prev === m.id ? null : m.id))}
                  placeholder="🚪"
                />
              ))}
            </div>
          ) : (
            <p className="muted" style={{ fontSize: "0.82rem" }}>No door styles configured yet.</p>
          )}
        </div>

        {/* Hardware */}
        <div className="mat-group">
          <p className="section-label">Hardware</p>
          {materials.hardware.length > 0 ? (
            <div className="mat-grid">
              {materials.hardware.map((m) => (
                <MaterialCard
                  key={m.id}
                  material={m}
                  selected={hardwareId === m.id}
                  onSelect={() => setHardwareId((prev) => (prev === m.id ? null : m.id))}
                  placeholder="🔩"
                />
              ))}
            </div>
          ) : (
            <p className="muted" style={{ fontSize: "0.82rem" }}>No hardware lines configured yet.</p>
          )}
        </div>

        {/* Sticky CTA */}
        <div className="sticky-cta">
          <div className="cta-stack">
            {user ? (
              <button className="btn" onClick={() => void performSave(false)} disabled={isSaving}>
                {isSaving ? "Saving…" : "Save Design"}
              </button>
            ) : (
              <a href="/login" className="btn">Sign in to Save</a>
            )}
            <a
              href={quoteHref}
              className="btn secondary"
              onClick={(e) => {
                if (!designId) {
                  e.preventDefault();
                  if (user) {
                    void performSave(false).then(() => {});
                    alert("Save your design first to request a quote.");
                  } else {
                    window.location.href = "/login";
                  }
                }
              }}
            >
              Get Quote
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

function LoadingFallback() {
  return (
    <main>
      <div className="empty" style={{ margin: "4rem auto", maxWidth: 400 }}>
        <p>Loading configurator…</p>
      </div>
    </main>
  );
}

export default function DesignPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
      <main style={{ padding: 0, maxWidth: "none" }}>
        <Suspense fallback={<LoadingFallback />}>
          <ConfiguratorBody />
        </Suspense>
      </main>
    </>
  );
}
