import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/admin-auth";
import {
  validateDesign,
  getValidationResult,
  type DesignValidationResult,
  type RuleStatus,
  type ValidationRuleResult,
} from "@/lib/cabinets/design-validator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return {
    title: `Structural Validation — Design ${params.id.substring(0, 8).toUpperCase()}`,
    description: "Structural validation results for your cabinet design.",
  };
}

const PAGE_STYLES = `
.validation-header { display: flex; align-items: flex-start; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
.validation-header h1 { margin: 0; }
.status-badge {
  display: inline-flex; align-items: center; gap: 0.4rem;
  font-size: 0.78rem; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; padding: 0.3rem 0.85rem;
  border-radius: 999px; white-space: nowrap;
}
.status-badge.pass  { background: #d1fae5; color: #065f46; }
.status-badge.warn  { background: #fef3c7; color: #92400e; }
.status-badge.fail  { background: #fee2e2; color: #991b1b; }
.warning-banner {
  border: 1.5px solid #f59e0b; border-radius: 8px; background: #fffbeb;
  padding: 1rem 1.25rem; margin-bottom: 1.5rem;
  display: flex; align-items: flex-start; gap: 0.75rem;
}
.fail-banner {
  border: 1.5px solid #ef4444; border-radius: 8px; background: #fff1f2;
  padding: 1rem 1.25rem; margin-bottom: 1.5rem;
}
.rule-list { list-style: none; padding: 0; margin: 0 0 2rem 0; display: flex; flex-direction: column; gap: 0.75rem; }
.rule-item { border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem 1.25rem; background: #fff; }
.rule-item.warn { border-left: 4px solid #f59e0b; }
.rule-item.fail { border-left: 4px solid #ef4444; background: #fff8f8; }
.rule-item.pass { border-left: 4px solid #10b981; }
.rule-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.4rem; }
.rule-name { font-weight: 600; font-size: 0.95rem; }
.rule-msg  { margin: 0 0 0.5rem 0; font-size: 0.88rem; }
.rule-suggestion { font-size: 0.83rem; color: #374151; background: #f3f4f6; border-radius: 6px; padding: 0.5rem 0.75rem; margin-top: 0.4rem; }
.rule-suggestion strong { display: block; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 0.2rem; }
.action-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 2rem; }
.btn-disabled { opacity: 0.45; cursor: not-allowed; pointer-events: none; }
.override-note { font-size: 0.8rem; color: #9ca3af; margin-top: 0.35rem; }
.dim-highlight { font-size: 0.75rem; color: #6b7280; margin-left: 0.5rem; font-weight: 400; }
.summary-bar { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; font-size: 0.88rem; }
.summary-count { display: flex; align-items: center; gap: 0.35rem; }
`;

function StatusBadge({ status }: { status: RuleStatus }) {
  const icons: Record<RuleStatus, string> = { pass: "✓", warn: "!", fail: "✗" };
  return (
    <span className={`status-badge ${status}`}>
      {icons[status]} {status}
    </span>
  );
}

function RuleCard({ rule }: { rule: ValidationRuleResult }) {
  return (
    <li className={`rule-item ${rule.status}`}>
      <div className="rule-header">
        <StatusBadge status={rule.status} />
        <span className="rule-name">{rule.rule_name}</span>
        {rule.affected_dimension && (
          <span className="dim-highlight">({rule.affected_dimension})</span>
        )}
      </div>
      <p className="rule-msg">{rule.message}</p>
      {rule.suggestion && (
        <div className="rule-suggestion">
          <strong>Correction suggestion</strong>
          {rule.suggestion}
        </div>
      )}
    </li>
  );
}

export default async function ValidationPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { rerun?: string; operator_override?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = params;
  const forceRerun = searchParams?.rerun === "1";
  const operatorOverride = searchParams?.operator_override === "1";

  // Either fetch cached result or run fresh validation
  let result: DesignValidationResult | null = null;
  if (forceRerun) {
    result = await validateDesign(id);
  } else {
    result = await getValidationResult(id);
    if (!result) {
      result = await validateDesign(id);
    }
  }

  if (!result) notFound();

  const failCount = result.rules.filter((r) => r.status === "fail").length;
  const warnCount = result.rules.filter((r) => r.status === "warn").length;
  const passCount = result.rules.filter((r) => r.status === "pass").length;

  const canQuote = result.can_proceed_to_quote || operatorOverride;
  const validatedAt = new Date(result.validated_at).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
      <main>
        <div className="validation-header">
          <div style={{ flex: 1 }}>
            <h1>
              Structural Validation
              <span
                style={{ fontSize: "0.65em", fontWeight: 400, marginLeft: "0.75rem", color: "#9ca3af" }}
              >
                #{id.substring(0, 8).toUpperCase()}
              </span>
            </h1>
            <p className="muted">
              Automated constraint-satisfaction check · validated {validatedAt}
            </p>
          </div>
          <StatusBadge status={result.overall_status} />
        </div>

        {/* Fail banner */}
        {result.overall_status === "fail" && !operatorOverride && (
          <div className="fail-banner">
            <p style={{ margin: 0, fontWeight: 600, color: "#991b1b" }}>
              This design has structural failures and cannot proceed to quote.
            </p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#7f1d1d" }}>
              Fix the issues listed below, then{" "}
              <Link href={`/design/${id}/validation?rerun=1`}>re-run validation</Link>.
              Operators may{" "}
              <Link href={`/design/${id}/validation?operator_override=1`}>
                override and proceed
              </Link>{" "}
              at their own liability.
            </p>
          </div>
        )}

        {/* Override active notice */}
        {operatorOverride && result.overall_status === "fail" && (
          <div className="warning-banner">
            <span style={{ fontSize: "1.1rem" }}>⚠</span>
            <div>
              <strong>Operator override active.</strong> This design has unresolved structural
              failures. Proceeding to quote waives standard liability review per{" "}
              <em>liability_assessor human_in_loop_required_for[2]</em>.
            </div>
          </div>
        )}

        {/* Warn banner */}
        {result.overall_status === "warn" && (
          <div className="warning-banner">
            <span style={{ fontSize: "1.1rem" }}>⚠</span>
            <div>
              <strong>Design has warnings.</strong> Review the suggestions below before
              proceeding. You may still request a quote — warnings do not block the
              workflow.
            </div>
          </div>
        )}

        {/* Summary bar */}
        <div className="summary-bar">
          {passCount > 0 && (
            <span className="summary-count">
              <span className="status-badge pass">{passCount} passed</span>
            </span>
          )}
          {warnCount > 0 && (
            <span className="summary-count">
              <span className="status-badge warn">{warnCount} warning{warnCount > 1 ? "s" : ""}</span>
            </span>
          )}
          {failCount > 0 && (
            <span className="summary-count">
              <span className="status-badge fail">{failCount} failed</span>
            </span>
          )}
        </div>

        {/* Rule breakdown */}
        <h2>Validation Rules</h2>
        <ul className="rule-list">
          {result.rules.map((rule) => (
            <RuleCard key={rule.rule_id} rule={rule} />
          ))}
        </ul>

        {/* Action row */}
        <div className="action-row">
          {canQuote ? (
            <Link href={`/design/${id}/quote`} className="btn">
              Proceed to Quote
            </Link>
          ) : (
            <span>
              <span className={`btn btn-disabled`} aria-disabled="true">
                Proceed to Quote
              </span>
              <p className="override-note">
                Resolve all failures to unlock quoting.
              </p>
            </span>
          )}

          <Link
            href={`/design/${id}/validation?rerun=1`}
            className="btn secondary"
          >
            Re-run Validation
          </Link>

          <Link href={`/design/${id}`} className="btn secondary">
            Back to Design
          </Link>

          <Link href={`/design?id=${id}`} className="btn secondary">
            Edit in Configurator
          </Link>
        </div>
      </main>
    </>
  );
}
