import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin-auth";
import {
  getOperatorMaterials,
  createMaterial,
  updateMaterial,
  setMaterialActive,
  logPricingAudit,
  type OperatorMaterial,
  type CreateMaterialInput,
  type UpdateMaterialInput,
} from "@/lib/cabinets/pricing-rules";

export const metadata: Metadata = {
  title: "Material Catalogue — Operator",
  description:
    "Manage materials, finishes, and hardware for the cabinet configurator.",
};

const PAGE_STYLES = `
.op-mat-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.op-mat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.25rem;
  margin-top: 1.5rem;
}
.status-pill {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  border-radius: 999px;
  padding: 0.18rem 0.7rem;
}
.status-pill.active   { background: #e6f4ea; color: #1b5e1f; }
.status-pill.inactive { background: #fce8e6; color: #7a0000; }
.mat-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}
.mat-card-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  flex-wrap: wrap;
}
.cost-badge {
  font-size: 0.78rem;
  color: #5a3e00;
  background: #fff8e1;
  border: 1px solid #ffe082;
  border-radius: 4px;
  padding: 0.2rem 0.55rem;
  display: inline-block;
  margin-top: 0.4rem;
}
.edit-form-card {
  background: #fafafa;
  border: 1.5px solid #c8a96a;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.5rem;
}
.edit-form-card h3 { margin: 0 0 1rem; font-size: 1rem; }
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.field-row.full { grid-template-columns: 1fr; }
label { display: block; font-size: 0.82rem; font-weight: 600; margin-bottom: 0.3rem; }
input[type=text],input[type=url],input[type=number],select,textarea {
  width: 100%; box-sizing: border-box;
}
.form-actions { display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap; }
`;

function categoryLabel(cat: string): string {
  if (cat === "wood") return "Wood Species";
  if (cat === "door_style") return "Door Style";
  if (cat === "hardware") return "Hardware";
  return cat;
}

function dollarFromCents(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function MaterialEditForm({
  material,
  updateAction,
}: {
  material: OperatorMaterial;
  updateAction: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="edit-form-card">
      <h3>Edit: {material.name}</h3>
      <form action={updateAction}>
        <input type="hidden" name="id" value={material.id} />
        <div className="field-row">
          <div>
            <label htmlFor={`name-${material.id}`}>Name *</label>
            <input
              id={`name-${material.id}`}
              type="text"
              name="name"
              defaultValue={material.name}
              required
            />
          </div>
          <div>
            <label htmlFor={`cat-${material.id}`}>Category *</label>
            <select
              id={`cat-${material.id}`}
              name="category"
              defaultValue={material.category}
              required
            >
              <option value="wood">Wood Species</option>
              <option value="door_style">Door Style</option>
              <option value="hardware">Hardware</option>
            </select>
          </div>
        </div>
        <div className="field-row">
          <div>
            <label htmlFor={`species-${material.id}`}>Species</label>
            <input
              id={`species-${material.id}`}
              type="text"
              name="species"
              defaultValue={material.species ?? ""}
            />
          </div>
          <div>
            <label htmlFor={`door-${material.id}`}>Door Style</label>
            <input
              id={`door-${material.id}`}
              type="text"
              name="door_style"
              defaultValue={material.door_style ?? ""}
            />
          </div>
        </div>
        <div className="field-row">
          <div>
            <label htmlFor={`hw-${material.id}`}>Hardware Line</label>
            <input
              id={`hw-${material.id}`}
              type="text"
              name="hardware_line"
              defaultValue={material.hardware_line ?? ""}
            />
          </div>
          <div>
            <label htmlFor={`slug-${material.id}`}>Configurator Slug *</label>
            <input
              id={`slug-${material.id}`}
              type="text"
              name="configurator_slug"
              defaultValue={material.configurator_slug}
              required
            />
          </div>
        </div>
        <div className="field-row">
          <div>
            <label htmlFor={`cost-${material.id}`}>Unit Cost (cents)</label>
            <input
              id={`cost-${material.id}`}
              type="number"
              name="unit_cost_cents"
              min="0"
              defaultValue={material.unit_cost_cents ?? ""}
              placeholder="e.g. 4500 = $45.00"
            />
          </div>
          <div>
            <label htmlFor={`img-${material.id}`}>Finish Photo URL</label>
            <input
              id={`img-${material.id}`}
              type="url"
              name="finish_image_url"
              defaultValue={material.finish_image_url ?? ""}
              placeholder="https://..."
            />
          </div>
        </div>
        <div className="field-row">
          <div>
            <label htmlFor={`cert-${material.id}`}>CARB Cert URL (@nexus/files-and-media)</label>
            <input
              id={`cert-${material.id}`}
              type="url"
              name="carb_cert_url"
              defaultValue={material.carb_cert_url ?? ""}
              placeholder="https://..."
            />
          </div>
          <div>
            <label htmlFor={`desc-${material.id}`}>Description</label>
            <input
              id={`desc-${material.id}`}
              type="text"
              name="description"
              defaultValue={material.description ?? ""}
            />
          </div>
        </div>
        <div className="field-row">
          <div>
            <label>
              <input
                type="checkbox"
                name="carb_compliant"
                value="true"
                defaultChecked={material.carb_compliant}
              />{" "}
              CARB ATCM / EPA TSCA Compliant
            </label>
          </div>
          <div>
            <label>
              <input
                type="checkbox"
                name="prop65_warning"
                value="true"
                defaultChecked={material.prop65_warning}
              />{" "}
              CA Prop 65 Warning Required
            </label>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn">Save Changes</button>
          <a href="/admin/materials" className="btn secondary">Cancel</a>
        </div>
      </form>
    </div>
  );
}

function MaterialCard({
  material,
  isEditing,
  updateAction,
  toggleAction,
}: {
  material: OperatorMaterial;
  isEditing: boolean;
  updateAction: (fd: FormData) => Promise<void>;
  toggleAction: (fd: FormData) => Promise<void>;
}) {
  if (isEditing) {
    return <MaterialEditForm material={material} updateAction={updateAction} />;
  }

  return (
    <article className="card">
      <div style={{ padding: "1rem 1rem 0.25rem" }}>
        <div className="mat-card-header">
          <strong>{material.name}</strong>
          <span
            className={`status-pill ${material.active ? "active" : "inactive"}`}
          >
            {material.active ? "Active" : "Inactive"}
          </span>
        </div>
        <p className="muted" style={{ margin: "0 0 0.4rem", fontSize: "0.82rem" }}>
          {categoryLabel(material.category)}
          {material.species ? ` · ${material.species}` : ""}
          {material.door_style ? ` · ${material.door_style}` : ""}
          {material.hardware_line ? ` · ${material.hardware_line}` : ""}
        </p>

        {material.carb_compliant && (
          <div
            style={{
              fontSize: "0.72rem",
              color: "#1b5e1f",
              marginBottom: "0.35rem",
            }}
          >
            ✓ CARB ATCM / EPA TSCA Title VI
          </div>
        )}
        {material.prop65_warning && (
          <div
            style={{
              fontSize: "0.72rem",
              color: "#7a5200",
              marginBottom: "0.35rem",
            }}
          >
            ⚠ CA Prop 65 Warning
          </div>
        )}

        <div className="cost-badge">
          Unit cost: {dollarFromCents(material.unit_cost_cents)}
        </div>

        {material.carb_cert_url && (
          <div style={{ marginTop: "0.4rem" }}>
            <a
              href={material.carb_cert_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "0.78rem" }}
            >
              CARB Certificate ↗
            </a>
          </div>
        )}
      </div>

      <div className="mat-card-actions" style={{ padding: "0 1rem 1rem" }}>
        <a
          href={`/admin/materials?edit=${material.id}`}
          className="btn secondary"
          style={{ fontSize: "0.82rem" }}
        >
          Edit
        </a>
        <form action={toggleAction} style={{ display: "inline" }}>
          <input type="hidden" name="id" value={material.id} />
          <input
            type="hidden"
            name="active"
            value={material.active ? "false" : "true"}
          />
          <button
            type="submit"
            className="btn secondary"
            style={{ fontSize: "0.82rem" }}
          >
            {material.active ? "Deactivate" : "Reactivate"}
          </button>
        </form>
      </div>
    </article>
  );
}

function AddMaterialForm({
  addAction,
}: {
  addAction: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="edit-form-card">
      <h3>Add New Material</h3>
      <form action={addAction}>
        <div className="field-row">
          <div>
            <label htmlFor="add-name">Name *</label>
            <input
              id="add-name"
              type="text"
              name="name"
              required
              placeholder="e.g. White Oak"
            />
          </div>
          <div>
            <label htmlFor="add-cat">Category *</label>
            <select id="add-cat" name="category" required>
              <option value="wood">Wood Species</option>
              <option value="door_style">Door Style</option>
              <option value="hardware">Hardware</option>
            </select>
          </div>
        </div>
        <div className="field-row">
          <div>
            <label htmlFor="add-species">Species</label>
            <input
              id="add-species"
              type="text"
              name="species"
              placeholder="e.g. Quercus alba"
            />
          </div>
          <div>
            <label htmlFor="add-slug">Configurator Slug *</label>
            <input
              id="add-slug"
              type="text"
              name="configurator_slug"
              required
              placeholder="e.g. white-oak"
            />
          </div>
        </div>
        <div className="field-row">
          <div>
            <label htmlFor="add-cost">Unit Cost (cents)</label>
            <input
              id="add-cost"
              type="number"
              name="unit_cost_cents"
              min="0"
              placeholder="e.g. 4500 = $45.00"
            />
          </div>
          <div>
            <label htmlFor="add-img">Finish Photo URL</label>
            <input
              id="add-img"
              type="url"
              name="finish_image_url"
              placeholder="https://..."
            />
          </div>
        </div>
        <div className="field-row">
          <div>
            <label htmlFor="add-cert">CARB Cert URL (@nexus/files-and-media)</label>
            <input
              id="add-cert"
              type="url"
              name="carb_cert_url"
              placeholder="https://..."
            />
          </div>
          <div>
            <label htmlFor="add-desc">Description</label>
            <input
              id="add-desc"
              type="text"
              name="description"
              placeholder="Brief description"
            />
          </div>
        </div>
        <div className="field-row">
          <div>
            <label>
              <input type="checkbox" name="carb_compliant" value="true" />{" "}
              CARB ATCM / EPA TSCA Compliant
            </label>
          </div>
          <div>
            <label>
              <input type="checkbox" name="prop65_warning" value="true" />{" "}
              CA Prop 65 Warning Required
            </label>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn">Add Material</button>
          <a href="/admin/materials" className="btn secondary">Cancel</a>
        </div>
      </form>
    </div>
  );
}

export default async function OperatorMaterialsPage({
  searchParams,
}: {
  searchParams: { mode?: string; edit?: string };
}) {
  const user = await getAdminUser();
  if (!user) redirect("/login");

  let materials: OperatorMaterial[] = [];
  try {
    materials = await getOperatorMaterials();
  } catch {
    // Table not ready yet — show empty state
  }

  const isAdding = searchParams.mode === "add";
  const editingId = searchParams.edit ?? null;

  async function handleAdd(formData: FormData) {
    "use server";
    const admin = await getAdminUser();
    if (!admin) redirect("/login");

    const input: CreateMaterialInput = {
      name: (formData.get("name") as string) ?? "",
      category: (formData.get("category") as CreateMaterialInput["category"]) ?? "wood",
      species: (formData.get("species") as string) || null,
      door_style: (formData.get("door_style") as string) || null,
      hardware_line: (formData.get("hardware_line") as string) || null,
      finish_image_url: (formData.get("finish_image_url") as string) || null,
      carb_cert_url: (formData.get("carb_cert_url") as string) || null,
      description: (formData.get("description") as string) || null,
      carb_compliant: formData.get("carb_compliant") === "true",
      prop65_warning: formData.get("prop65_warning") === "true",
      configurator_slug: (formData.get("configurator_slug") as string) ?? "",
      unit_cost_cents: formData.get("unit_cost_cents")
        ? parseInt(formData.get("unit_cost_cents") as string, 10)
        : null,
    };

    const mat = await createMaterial(input);
    await logPricingAudit(
      admin.id,
      "material.created",
      "cabinet_material",
      mat.id,
      { name: mat.name, category: mat.category }
    );
    redirect("/admin/materials");
  }

  async function handleUpdate(formData: FormData) {
    "use server";
    const admin = await getAdminUser();
    if (!admin) redirect("/login");

    const id = (formData.get("id") as string) ?? "";
    const input: UpdateMaterialInput = {
      name: (formData.get("name") as string) || undefined,
      category: (formData.get("category") as UpdateMaterialInput["category"]) || undefined,
      species: (formData.get("species") as string) || null,
      door_style: (formData.get("door_style") as string) || null,
      hardware_line: (formData.get("hardware_line") as string) || null,
      finish_image_url: (formData.get("finish_image_url") as string) || null,
      carb_cert_url: (formData.get("carb_cert_url") as string) || null,
      description: (formData.get("description") as string) || null,
      carb_compliant: formData.get("carb_compliant") === "true",
      prop65_warning: formData.get("prop65_warning") === "true",
      configurator_slug: (formData.get("configurator_slug") as string) || undefined,
      unit_cost_cents: formData.get("unit_cost_cents")
        ? parseInt(formData.get("unit_cost_cents") as string, 10)
        : null,
    };

    await updateMaterial(id, input);
    await logPricingAudit(
      admin.id,
      "material.updated",
      "cabinet_material",
      id,
      { slug: input.configurator_slug }
    );
    redirect("/admin/materials");
  }

  async function handleToggle(formData: FormData) {
    "use server";
    const admin = await getAdminUser();
    if (!admin) redirect("/login");

    const id = (formData.get("id") as string) ?? "";
    const active = formData.get("active") === "true";
    await setMaterialActive(id, active);
    await logPricingAudit(
      admin.id,
      active ? "material.activated" : "material.deactivated",
      "cabinet_material",
      id,
      { active }
    );
    redirect("/admin/materials");
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
      <main>
        <div className="op-mat-header">
          <div>
            <h1>Material Catalogue — Operator</h1>
            <p>
              Manage wood species, door styles, and hardware finishes. Unit costs
              are operator-only and never exposed to customers.
            </p>
          </div>
          {!isAdding && (
            <a href="/admin/materials?mode=add" className="btn">
              + Add Material
            </a>
          )}
        </div>

        {isAdding && <AddMaterialForm addAction={handleAdd} />}

        {materials.length === 0 && !isAdding ? (
          <div className="empty">
            <p style={{ fontWeight: 600 }}>
              Add your first material to enable the configurator
            </p>
            <p className="muted">
              Materials, finishes, and hardware you add here will appear in the
              customer-facing configurator once activated.
            </p>
            <a href="/admin/materials?mode=add" className="btn">
              + Add Material
            </a>
          </div>
        ) : (
          <div className="op-mat-grid">
            {materials.map((m) => (
              <MaterialCard
                key={m.id}
                material={m}
                isEditing={m.id === editingId}
                updateAction={handleUpdate}
                toggleAction={handleToggle}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
