import { useState } from "react";
import { savePlan } from "../data/store";
import { MONTHS } from "../format";
import { PRIORITY_LABELS, type Plan, type Priority, type TargetRef } from "../types";

interface Props {
  uid: string;
  target: TargetRef;
  existing?: Plan;
  onDone(): void;
}

export function PlanForm({ uid, target, existing, onDone }: Props) {
  const [name, setName] = useState(existing?.name ?? target.objectName);
  const [month, setMonth] = useState(existing?.month ? String(existing.month) : "");
  const [year, setYear] = useState(existing?.year ? String(existing.year) : "");
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const y = year.trim() ? Number(year) : null;
    if (y !== null && (!Number.isInteger(y) || y < 1900 || y > 2200)) {
      setError("Year must be a four-digit year.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await savePlan(uid, existing?.id ?? null, target, {
        name: name.trim() || target.objectName,
        month: month ? Number(month) : null,
        year: y,
        priority,
      });
      onDone();
    } catch (err) {
      setError(`Saving failed: ${(err as Error).message}`);
      setSaving(false);
    }
  }

  return (
    <form className="form plan-form" onSubmit={submit}>
      <h3>{existing ? "Edit planned observation" : "Add to observation plan"}</h3>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={target.objectName} />
      </label>
      <div className="form-row">
        <label>
          <span>
            Month <span className="muted">(optional)</span>
          </span>
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">Any</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            Year <span className="muted">(optional)</span>
          </span>
          <input
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder={String(new Date().getFullYear())}
          />
        </label>
      </div>
      <div>
        <div className="label">Priority</div>
        <div className="segmented priority-select" role="radiogroup" aria-label="Priority">
          {([1, 2, 3] as Priority[]).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={priority === p}
              aria-pressed={priority === p}
              className={`priority-${p}`}
              onClick={() => setPriority(p)}
            >
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onDone} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {existing ? "Save" : "Add to plan"}
        </button>
      </div>
    </form>
  );
}
