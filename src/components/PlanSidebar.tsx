import { deletePlan } from "../data/store";
import { formatPlanDate } from "../format";
import { PRIORITY_LABELS, type Plan } from "../types";
import { CloseIcon, EditIcon, TrashIcon } from "./Icons";

interface Props {
  uid: string;
  /** Already sorted by priority. */
  plans: Plan[];
  loading: boolean;
  selectedObjectId: string | null;
  onSelect(plan: Plan): void;
  onEdit(plan: Plan): void;
  onClose(): void;
}

export function PlanSidebar({ uid, plans, loading, selectedObjectId, onSelect, onEdit, onClose }: Props) {
  async function remove(p: Plan) {
    if (!confirm(`Remove “${p.name}” from your observation plan?`)) return;
    try {
      await deletePlan(uid, p.id);
    } catch (err) {
      alert(`Delete failed: ${(err as Error).message}`);
    }
  }

  return (
    <aside className="panel plan-sidebar" aria-label="Observation plan">
      <header className="panel-header">
        <div>
          <h2>Observation plan</h2>
          <div className="panel-subtitle">
            {plans.length} planned {plans.length === 1 ? "object" : "objects"}, by priority
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close plan">
          <CloseIcon />
        </button>
      </header>
      <div className="panel-body">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : plans.length === 0 ? (
          <div className="empty-state">
            <p>Your plan is empty.</p>
            <p className="muted">
              Find an object on the chart or with search, then choose <strong>Add to plan</strong>.
            </p>
          </div>
        ) : (
          <ol className="plan-list">
            {plans.map((p) => (
              <li key={p.id} className={p.objectId === selectedObjectId ? "selected" : undefined}>
                <button type="button" className="plan-item" onClick={() => onSelect(p)}>
                  <span className={`priority-badge priority-${p.priority}`}>{PRIORITY_LABELS[p.priority]}</span>
                  <span className="plan-item-text">
                    <span className="plan-item-name">{p.name}</span>
                    <span className="muted small">
                      {p.name !== p.objectName ? `${p.objectName} · ` : ""}
                      {formatPlanDate(p.month, p.year)}
                    </span>
                  </span>
                </button>
                <div className="plan-item-tools">
                  <button type="button" className="icon-btn small" aria-label={`Edit ${p.name}`} onClick={() => onEdit(p)}>
                    <EditIcon size={14} />
                  </button>
                  <button type="button" className="icon-btn small" aria-label={`Remove ${p.name}`} onClick={() => remove(p)}>
                    <TrashIcon size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}
