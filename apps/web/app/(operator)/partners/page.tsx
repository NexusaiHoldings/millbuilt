import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin-auth";
import {
  getPartners,
  createPartner,
  updatePartner,
  setPartnerActive,
  type ManufacturingPartner,
  type CreatePartnerInput,
  type UpdatePartnerInput,
} from "@/lib/cabinets/partner-registry";
import { logPricingAudit } from "@/lib/cabinets/pricing-rules";

export const metadata: Metadata = {
  title: "Manufacturing Partners — Operator",
  description:
    "Register and manage contracted manufacturing partners for order routing.",
};

const PAGE_STYLES = `
.partner-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.partner-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;
}
.status-badge {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  border-radius: 999px;
  padding: 0.2rem 0.75rem;
  text-transform: uppercase;
}
.status-badge.active   { background: #e6f4ea; color: #1b5e1f; }
.status-badge.inactive { background: #fce8e6; color: #7a0000; }
.partner-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}
.sla-bar {
  display: flex;
  gap: 1.25rem;
  flex-wrap: wrap;
  font-size: 0.8rem;
  background: #f5f5f5;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  margin: 0.75rem 0 0.5rem;
}
.sla-item { display: flex; flex-direction: column; }
.sla-label { font-size: 0.68rem; color: #666; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.sla-value { font-size: 0.88rem; font-weight: 600; color: #1a1a1a; margin-top: 0.1rem; }
.compliance-list {
  list-style: none;
  padding: 0;
  margin: 0.6rem 0 0;
  font-size: 0.78rem;
}
.compliance-list li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.18rem 0;
  border-bottom: 1px solid #f0f0f0;
}
.compliance-list li:last-child { border-bottom: none; }
.chk-ok  { color: #1b5e1f; font-size: 0.9rem; }
.chk-miss { color: #b71c1c; font-size: 0.9rem; }
.partner-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}
.form-card {
  background: #fafafa;
  border: 1.5px solid #c8a96a;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.5rem;
}
.form-card h3 { margin: 0 0 1rem; font-size: 1rem; }
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.field-row.full { grid-template-columns: 1fr; }
.field-row.three { grid-template-columns: 1fr 1fr 1fr; }
label { display: block; font-size: 0.82rem; font-weight: 600; margin-bottom: 0.3rem; }
input[type=text],input[type=email],input[type=tel],input[type=url],input[type=number],select,textarea {
  width: 100%; box-sizing: border-box;
}
.form-actions { display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap; }
`;

function formatDefectRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function statesDisplay(states: string[]): string {
  if (!states || states.length === 0) return "All states";
  if (states.length <= 6) return states.join(", ");
  return `${states.slice(0, 6).join(", ")} +${states.length - 6} more`;
}

function ComplianceChecklist({
  partner,
}: {
  partner: ManufacturingPartner;
}) {
  const items: Array<{ label: string; ok: boolean; detail?: string }> = [
    {
      label: "CARB Certified",
      ok: partner.carb_certified,
    },
    {
      label: "EPA TSCA Title VI Cert",
      ok: !!partner.epa_tsca_cert_url,
      detail: partner.epa_tsca_cert_url
        ? "On file"
        : undefined,
    },
    {
      label: "State Contractor License",
      ok: !!partner.state_contractor_license,
      detail: partner.state_contractor_license ?? undefined,
    },
    {
      label: "Insurance Certificate",
      ok: !!partner.insurance_cert_url,
      detail: partner.insurance_cert_url ? "On file" : undefined,
    },
  ];

  return (
    <ul className="compliance-list">
      {items.map((item) => (
        <li key={item.label}>
          <span className={item.ok ? "chk-ok" : "chk-miss"}>
            {item.ok ? "✓" : "✗"}
          </span>
          <span>
            {item.label}
            {item.ok && item.detail ? (
              <span className="muted"> · {item.detail}</span>
            ) : null}
            {!item.ok ? (
              <span className="muted"> · Missing</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PartnerCard({
  partner,
  isEditing,
  editAction,
  toggleAction,
}: {
  partner: ManufacturingPartner;
  isEditing: boolean;
  editAction: (fd: FormData) => Promise<void>;
  toggleAction: (fd: FormData) => Promise<void>;
}) {
  if (isEditing) {
    return (
      <PartnerForm
        mode="edit"
        partner={partner}
        submitAction={editAction}
        cancelHref="/partners"
      />
    );
  }

  return (
    <article className="card">
      <div style={{ padding: "1rem 1rem 0.75rem" }}>
        <div className="partner-card-head">
          <div>
            <strong style={{ fontSize: "1.02rem" }}>{partner.name}</strong>
            {partner.contact_name && (
              <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.8rem" }}>
                {partner.contact_name}
              </p>
            )}
          </div>
          <span className={`status-badge ${partner.active ? "active" : "inactive"}`}>
            {partner.active ? "Active" : "Inactive"}
          </span>
        </div>

        {(partner.contact_email || partner.contact_phone) && (
          <p style={{ margin: "0 0 0.35rem", fontSize: "0.8rem" }}>
            {partner.contact_email && (
              <a href={`mailto:${partner.contact_email}`}>
                {partner.contact_email}
              </a>
            )}
            {partner.contact_email && partner.contact_phone && " · "}
            {partner.contact_phone && (
              <span className="muted">{partner.contact_phone}</span>
            )}
          </p>
        )}

        {(partner.api_endpoint || partner.delivery_email) && (
          <p style={{ margin: "0 0 0.35rem", fontSize: "0.78rem" }}>
            <span className="muted">Cut list delivery: </span>
            {partner.api_endpoint ? (
              <span title={partner.api_endpoint}>API endpoint configured</span>
            ) : (
              <a href={`mailto:${partner.delivery_email}`}>
                {partner.delivery_email}
              </a>
            )}
          </p>
        )}

        <p style={{ margin: "0 0 0.35rem", fontSize: "0.78rem" }}>
          <span className="muted">Ships to: </span>
          {statesDisplay(partner.supported_states)}
        </p>

        <p style={{ margin: "0", fontSize: "0.78rem" }}>
          <span className="muted">Capacity: </span>
          {partner.capacity_orders_per_week} orders/week
        </p>

        <div className="sla-bar">
          <div className="sla-item">
            <span className="sla-label">Lead time</span>
            <span className="sla-value">{partner.lead_time_days} days</span>
          </div>
          <div className="sla-item">
            <span className="sla-label">Defect threshold</span>
            <span className="sla-value">{formatDefectRate(partner.defect_rate_threshold)}</span>
          </div>
        </div>

        <ComplianceChecklist partner={partner} />

        {partner.notes && (
          <p className="muted" style={{ margin: "0.6rem 0 0", fontSize: "0.78rem" }}>
            {partner.notes}
          </p>
        )}
      </div>

      <div className="partner-actions" style={{ padding: "0 1rem 1rem" }}>
        <a
          href={`/partners?edit=${partner.id}`}
          className="btn secondary"
          style={{ fontSize: "0.82rem" }}
        >
          Edit
        </a>
        <form action={toggleAction} style={{ display: "inline" }}>
          <input type="hidden" name="id" value={partner.id} />
          <input
            type="hidden"
            name="active"
            value={partner.active ? "false" : "true"}
          />
          <button type="submit" className="btn secondary" style={{ fontSize: "0.82rem" }}>
            {partner.active ? "Deactivate" : "Reactivate"}
          </button>
        </form>
      </div>
    </article>
  );
}

function PartnerForm({
  mode,
  partner,
  submitAction,
  cancelHref,
}: {
  mode: "add" | "edit";
  partner?: ManufacturingPartner;
  submitAction: (fd: FormData) => Promise<void>;
  cancelHref: string;
}) {
  const title = mode === "add" ? "Add Manufacturing Partner" : `Edit: ${partner?.name}`;
  const statesDefault = partner?.supported_states?.join(", ") ?? "";

  return (
    <div className="form-card">
      <h3>{title}</h3>
      <form action={submitAction}>
        {partner && <input type="hidden" name="id" value={partner.id} />}

        <div className="field-row">
          <div>
            <label htmlFor={`${mode}-name`}>Partner Name *</label>
            <input
              id={`${mode}-name`}
              type="text"
              name="name"
              defaultValue={partner?.name ?? ""}
              required
              placeholder="e.g. Precision Cabinetry Co."
            />
          </div>
          <div>
            <label htmlFor={`${mode}-contact-name`}>Contact Name</label>
            <input
              id={`${mode}-contact-name`}
              type="text"
              name="contact_name"
              defaultValue={partner?.contact_name ?? ""}
              placeholder="Primary contact"
            />
          </div>
        </div>

        <div className="field-row">
          <div>
            <label htmlFor={`${mode}-contact-email`}>Contact Email</label>
            <input
              id={`${mode}-contact-email`}
              type="email"
              name="contact_email"
              defaultValue={partner?.contact_email ?? ""}
              placeholder="contact@partner.com"
            />
          </div>
          <div>
            <label htmlFor={`${mode}-contact-phone`}>Contact Phone</label>
            <input
              id={`${mode}-contact-phone`}
              type="tel"
              name="contact_phone"
              defaultValue={partner?.contact_phone ?? ""}
              placeholder="+1 555-000-0000"
            />
          </div>
        </div>

        <div className="field-row">
          <div>
            <label htmlFor={`${mode}-api-endpoint`}>API Endpoint (cut list)</label>
            <input
              id={`${mode}-api-endpoint`}
              type="url"
              name="api_endpoint"
              defaultValue={partner?.api_endpoint ?? ""}
              placeholder="https://api.partner.com/cutlist"
            />
          </div>
          <div>
            <label htmlFor={`${mode}-delivery-email`}>Delivery Email (cut list)</label>
            <input
              id={`${mode}-delivery-email`}
              type="email"
              name="delivery_email"
              defaultValue={partner?.delivery_email ?? ""}
              placeholder="orders@partner.com"
            />
          </div>
        </div>

        <div className="field-row full">
          <div>
            <label htmlFor={`${mode}-states`}>Supported States (comma-separated codes)</label>
            <input
              id={`${mode}-states`}
              type="text"
              name="supported_states"
              defaultValue={statesDefault}
              placeholder="CA, TX, NY, FL — leave blank for all states"
            />
          </div>
        </div>

        <div className="field-row three">
          <div>
            <label htmlFor={`${mode}-capacity`}>Capacity (orders/week)</label>
            <input
              id={`${mode}-capacity`}
              type="number"
              name="capacity_orders_per_week"
              min="1"
              defaultValue={partner?.capacity_orders_per_week ?? 10}
              required
            />
          </div>
          <div>
            <label htmlFor={`${mode}-lead-time`}>Lead Time (days)</label>
            <input
              id={`${mode}-lead-time`}
              type="number"
              name="lead_time_days"
              min="1"
              defaultValue={partner?.lead_time_days ?? 14}
              required
            />
          </div>
          <div>
            <label htmlFor={`${mode}-defect-rate`}>Defect Rate Threshold (0–1)</label>
            <input
              id={`${mode}-defect-rate`}
              type="number"
              name="defect_rate_threshold"
              min="0"
              max="1"
              step="0.001"
              defaultValue={partner?.defect_rate_threshold ?? 0.02}
              required
            />
          </div>
        </div>

        <div className="field-row">
          <div>
            <label htmlFor={`${mode}-epa`}>EPA TSCA Title VI Cert URL</label>
            <input
              id={`${mode}-epa`}
              type="url"
              name="epa_tsca_cert_url"
              defaultValue={partner?.epa_tsca_cert_url ?? ""}
              placeholder="https://..."
            />
          </div>
          <div>
            <label htmlFor={`${mode}-license`}>State Contractor License #</label>
            <input
              id={`${mode}-license`}
              type="text"
              name="state_contractor_license"
              defaultValue={partner?.state_contractor_license ?? ""}
              placeholder="e.g. CA-LIC-123456"
            />
          </div>
        </div>

        <div className="field-row">
          <div>
            <label htmlFor={`${mode}-insurance`}>Insurance Cert URL</label>
            <input
              id={`${mode}-insurance`}
              type="url"
              name="insurance_cert_url"
              defaultValue={partner?.insurance_cert_url ?? ""}
              placeholder="https://..."
            />
          </div>
          <div>
            <label>
              <input
                type="checkbox"
                name="carb_certified"
                value="true"
                defaultChecked={partner?.carb_certified ?? false}
              />{" "}
              CARB Certified (EPA TSCA Title VI)
            </label>
          </div>
        </div>

        <div className="field-row full">
          <div>
            <label htmlFor={`${mode}-notes`}>Notes</label>
            <textarea
              id={`${mode}-notes`}
              name="notes"
              rows={2}
              defaultValue={partner?.notes ?? ""}
              placeholder="Internal notes about this partner"
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn">
            {mode === "add" ? "Add Partner" : "Save Changes"}
          </button>
          <a href={cancelHref} className="btn secondary">
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}

function parseStates(raw: string): string[] {
  return raw
    .split(/[,\n]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
}

export default async function OperatorPartnersPage({
  searchParams,
}: {
  searchParams: { mode?: string; edit?: string };
}) {
  const user = await getAdminUser();
  if (!user) redirect("/login");

  let partners: ManufacturingPartner[] = [];
  try {
    partners = await getPartners();
  } catch {
    // Table not ready yet — show empty state
  }

  const isAdding = searchParams.mode === "add";
  const editingId = searchParams.edit ?? null;

  async function handleAdd(formData: FormData) {
    "use server";
    const admin = await getAdminUser();
    if (!admin) redirect("/login");

    const input: CreatePartnerInput = {
      name: (formData.get("name") as string) ?? "",
      contact_name: (formData.get("contact_name") as string) || null,
      contact_email: (formData.get("contact_email") as string) || null,
      contact_phone: (formData.get("contact_phone") as string) || null,
      api_endpoint: (formData.get("api_endpoint") as string) || null,
      delivery_email: (formData.get("delivery_email") as string) || null,
      supported_states: parseStates(
        (formData.get("supported_states") as string) ?? ""
      ),
      capacity_orders_per_week: parseInt(
        (formData.get("capacity_orders_per_week") as string) ?? "10",
        10
      ),
      carb_certified: formData.get("carb_certified") === "true",
      lead_time_days: parseInt(
        (formData.get("lead_time_days") as string) ?? "14",
        10
      ),
      defect_rate_threshold: parseFloat(
        (formData.get("defect_rate_threshold") as string) ?? "0.02"
      ),
      epa_tsca_cert_url: (formData.get("epa_tsca_cert_url") as string) || null,
      state_contractor_license:
        (formData.get("state_contractor_license") as string) || null,
      insurance_cert_url:
        (formData.get("insurance_cert_url") as string) || null,
      notes: (formData.get("notes") as string) || null,
    };

    const partner = await createPartner(input);
    await logPricingAudit(
      admin.id,
      "partner.created",
      "manufacturing_partner",
      partner.id,
      { name: partner.name }
    );
    redirect("/partners");
  }

  async function handleEdit(formData: FormData) {
    "use server";
    const admin = await getAdminUser();
    if (!admin) redirect("/login");

    const id = (formData.get("id") as string) ?? "";
    const input: UpdatePartnerInput = {
      name: (formData.get("name") as string) || undefined,
      contact_name: (formData.get("contact_name") as string) || null,
      contact_email: (formData.get("contact_email") as string) || null,
      contact_phone: (formData.get("contact_phone") as string) || null,
      api_endpoint: (formData.get("api_endpoint") as string) || null,
      delivery_email: (formData.get("delivery_email") as string) || null,
      supported_states: parseStates(
        (formData.get("supported_states") as string) ?? ""
      ),
      capacity_orders_per_week: parseInt(
        (formData.get("capacity_orders_per_week") as string) ?? "10",
        10
      ),
      carb_certified: formData.get("carb_certified") === "true",
      lead_time_days: parseInt(
        (formData.get("lead_time_days") as string) ?? "14",
        10
      ),
      defect_rate_threshold: parseFloat(
        (formData.get("defect_rate_threshold") as string) ?? "0.02"
      ),
      epa_tsca_cert_url: (formData.get("epa_tsca_cert_url") as string) || null,
      state_contractor_license:
        (formData.get("state_contractor_license") as string) || null,
      insurance_cert_url:
        (formData.get("insurance_cert_url") as string) || null,
      notes: (formData.get("notes") as string) || null,
    };

    await updatePartner(id, input);
    await logPricingAudit(
      admin.id,
      "partner.updated",
      "manufacturing_partner",
      id,
      { name: input.name }
    );
    redirect("/partners");
  }

  async function handleToggle(formData: FormData) {
    "use server";
    const admin = await getAdminUser();
    if (!admin) redirect("/login");

    const id = (formData.get("id") as string) ?? "";
    const active = formData.get("active") === "true";
    await setPartnerActive(id, active);
    await logPricingAudit(
      admin.id,
      active ? "partner.activated" : "partner.deactivated",
      "manufacturing_partner",
      id,
      { active }
    );
    redirect("/partners");
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
      <main>
        <div className="partner-header">
          <div>
            <h1>Manufacturing Partners</h1>
            <p>
              Register and manage contracted manufacturing partners. The active
              partner registry is used by the dispatch system to route orders
              and deliver cut lists.
            </p>
          </div>
          {!isAdding && !editingId && (
            <a href="/partners?mode=add" className="btn">
              + Add Partner
            </a>
          )}
        </div>

        {isAdding && (
          <PartnerForm
            mode="add"
            submitAction={handleAdd}
            cancelHref="/partners"
          />
        )}

        {partners.length === 0 && !isAdding ? (
          <div className="empty">
            <p style={{ fontWeight: 600 }}>
              Add your first manufacturing partner before accepting orders
            </p>
            <p className="muted">
              Partner records store contact info, API endpoint or email for cut
              list delivery, supported states for freight routing, capacity,
              CARB certification, and SLA parameters.
            </p>
            <a href="/partners?mode=add" className="btn">
              + Add Partner
            </a>
          </div>
        ) : (
          <div className="partner-grid">
            {partners.map((p) => (
              <PartnerCard
                key={p.id}
                partner={p}
                isEditing={p.id === editingId}
                editAction={handleEdit}
                toggleAction={handleToggle}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
