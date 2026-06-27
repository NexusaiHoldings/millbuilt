import type { Metadata } from "next";
import { getMaterials, type Material } from "@/lib/cabinets/materials-catalogue";

export const metadata: Metadata = {
  title: "Materials & Finishes",
  description:
    "Browse our curated catalogue of CARB-compliant wood species, door styles, and hardware finishes for your custom cabinet design.",
};

const PAGE_STYLES = `
.materials-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin-top: 2rem;
}
@media (max-width: 900px) {
  .materials-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .materials-grid { grid-template-columns: 1fr; }
}
.mat-img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--substrate-radius, 6px) var(--substrate-radius, 6px) 0 0;
  display: block;
}
.mat-img-ph {
  width: 100%;
  aspect-ratio: 4 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #ede0d0 0%, #cdb89a 100%);
  border-radius: var(--substrate-radius, 6px) var(--substrate-radius, 6px) 0 0;
  font-size: 2.75rem;
}
.mat-body { padding: 1rem 1rem 1.25rem; }
.mat-name { font-weight: 600; font-size: 1rem; margin: 0 0 0.2rem; }
.mat-sub  { font-size: 0.82rem; margin: 0 0 0.65rem; }
.badge-carb {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  background: #e6f4ea;
  color: #1b5e1f;
  border-radius: 999px;
  padding: 0.18rem 0.6rem;
  margin-bottom: 0.6rem;
}
.prop65 {
  font-size: 0.72rem;
  color: #7a5200;
  background: #fffbea;
  border: 1px solid #f0c040;
  border-radius: 4px;
  padding: 0.35rem 0.55rem;
  margin-bottom: 0.65rem;
  line-height: 1.45;
}
.mat-desc { font-size: 0.85rem; margin-bottom: 0.8rem; }
.empty-illo { display: block; margin: 0 auto 1.5rem; opacity: 0.4; }
`;

function categorySubtitle(m: Material): string {
  if (m.category === "wood") return m.species ?? "Wood Species";
  if (m.category === "door_style") return m.door_style ?? "Door Style";
  if (m.category === "hardware") return m.hardware_line ?? "Hardware Line";
  return m.category;
}

function MaterialCard({ material: m }: { material: Material }) {
  const configuratorHref = `/design?material=${encodeURIComponent(m.configurator_slug)}`;

  return (
    <article className="card lift">
      {m.finish_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.finish_image_url}
          alt={`${m.name} finish sample`}
          className="mat-img"
          loading="lazy"
        />
      ) : (
        <div className="mat-img-ph" aria-hidden="true">
          🪵
        </div>
      )}

      <div className="mat-body">
        <p className="mat-name">{m.name}</p>
        <p className="mat-sub muted">{categorySubtitle(m)}</p>

        {m.carb_compliant && (
          <div className="badge-carb">✓ CARB ATCM / EPA TSCA Title VI</div>
        )}

        {m.prop65_warning && (
          <div className="prop65">
            <strong>⚠ CA Prop 65 Warning:</strong> This product can expose you to chemicals known
            to the State of California to cause cancer or reproductive harm.{" "}
            <a
              href="https://www.p65warnings.ca.gov"
              target="_blank"
              rel="noopener noreferrer"
            >
              www.P65Warnings.ca.gov
            </a>
          </div>
        )}

        {m.description && <p className="mat-desc muted">{m.description}</p>}

        <a href={configuratorHref} className="btn">
          Use in Design
        </a>
      </div>
    </article>
  );
}

export default async function MaterialsPage() {
  let materials: Material[] = [];
  try {
    materials = await getMaterials();
  } catch {
    // Table may not be seeded yet — show empty state gracefully
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
      <main>
        <h1>Materials &amp; Finishes</h1>
        <p>
          Explore our curated catalogue of wood species, door styles, and hardware finishes —
          all CARB-compliant and built to last. Select any material to instantly preview it in
          your custom cabinet design.
        </p>

        {materials.length === 0 ? (
          <div className="empty">
            <svg
              className="empty-illo"
              width="120"
              height="120"
              viewBox="0 0 120 120"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <rect width="120" height="120" rx="16" fill="#ede0d0" />
              <rect x="18" y="28" width="84" height="14" rx="5" fill="#c9a87c" />
              <rect x="18" y="50" width="64" height="9" rx="4" fill="#d4bfa0" />
              <rect x="18" y="67" width="74" height="9" rx="4" fill="#d4bfa0" />
              <rect x="18" y="84" width="52" height="9" rx="4" fill="#d4bfa0" />
              <circle cx="94" cy="86" r="19" fill="#f5ede3" stroke="#c9a87c" strokeWidth="2" />
              <path
                d="M86 86l5 5 10-10"
                stroke="#7a5020"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p>No materials available yet — check back soon.</p>
          </div>
        ) : (
          <div className="materials-grid">
            {materials.map((m) => (
              <MaterialCard key={m.id} material={m} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
