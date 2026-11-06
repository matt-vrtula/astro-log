import { useEffect, useState } from "react";
import { deleteObservation, deletePlan } from "../data/store";
import { formatDateTime, formatPlanDate } from "../format";
import { compassPoint, formatDec, formatRA, lstDeg, raDecToAltAz } from "../sky/astro";
import { PRIORITY_LABELS, type Observation, type ObserverLocation, type Photo, type Plan, type SkyObject, type TargetRef } from "../types";
import { CloseIcon, EditIcon, FlagIcon, PlusIcon, TrashIcon } from "./Icons";
import { ObservationForm } from "./ObservationForm";
import { ObjectInfo } from "./ObjectInfo";
import { PlanForm } from "./PlanForm";

export type PanelIntent = { type: "editPlan"; planId: string; nonce: number } | null;

interface Props {
  uid: string;
  object: SkyObject;
  observations: Observation[];
  plans: Plan[];
  location: ObserverLocation | null;
  date: Date;
  intent: PanelIntent;
  onClose(): void;
  onOpenPhoto(photos: Photo[], index: number): void;
}

type Mode =
  | { type: "view" }
  | { type: "observation"; existing?: Observation }
  | { type: "plan"; existing?: Plan };

export function ObjectPanel({ uid, object, observations, plans, location, date, intent, onClose, onOpenPhoto }: Props) {
  const [mode, setMode] = useState<Mode>({ type: "view" });

  // Reset when another object is selected.
  useEffect(() => setMode({ type: "view" }), [object.id]);

  // Requests from outside (e.g. "edit" in the plan sidebar).
  useEffect(() => {
    if (intent?.type === "editPlan") {
      const plan = plans.find((p) => p.id === intent.planId);
      if (plan) setMode({ type: "plan", existing: plan });
    }
    // Only react to new intents, not to plan list updates.
  }, [intent]);

  const target: TargetRef = { objectId: object.id, objectName: object.name, ra: object.ra, dec: object.dec };
  const position = location ? raDecToAltAz(object.ra, object.dec, lstDeg(date, location.lon), location.lat) : null;
  const back = () => setMode({ type: "view" });

  async function removeObservation(o: Observation) {
    const photos = o.photos.length ? ` and its ${o.photos.length} photo${o.photos.length > 1 ? "s" : ""}` : "";
    if (!confirm(`Delete the observation from ${formatDateTime(o.observedAt)}${photos}?`)) return;
    try {
      await deleteObservation(uid, o);
    } catch (err) {
      alert(`Delete failed: ${(err as Error).message}`);
    }
  }

  async function removePlan(p: Plan) {
    if (!confirm(`Remove “${p.name}” from your observation plan?`)) return;
    try {
      await deletePlan(uid, p.id);
    } catch (err) {
      alert(`Delete failed: ${(err as Error).message}`);
    }
  }

  return (
    <aside className="panel object-panel" aria-label={`${object.name} details`}>
      <header className="panel-header">
        <div>
          <h2>{object.name}</h2>
          {object.aliases.length > 0 && <div className="panel-subtitle">{object.aliases.join(" · ")}</div>}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel">
          <CloseIcon />
        </button>
      </header>

      <div className="panel-body">
        <dl className="object-facts">
          <div>
            <dt>Type</dt>
            <dd>{object.typeLabel}</dd>
          </div>
          {object.constellation && (
            <div>
              <dt>Constellation</dt>
              <dd>{object.constellation}</dd>
            </div>
          )}
          {object.mag != null && (
            <div>
              <dt>Magnitude</dt>
              <dd>{object.mag.toFixed(1)}</dd>
            </div>
          )}
          {object.size && (
            <div>
              <dt>Size</dt>
              <dd>
                {object.size.major.toFixed(1)}′{object.size.minor ? ` × ${object.size.minor.toFixed(1)}′` : ""}
              </dd>
            </div>
          )}
          <div className="wide">
            <dt>RA / Dec (J2000)</dt>
            <dd>
              {formatRA(object.ra)} / {formatDec(object.dec)}
            </dd>
          </div>
          {position && (
            <div>
              <dt>Altitude</dt>
              <dd className={position.alt < 0 ? "below-horizon" : undefined}>
                {position.alt.toFixed(0)}° {compassPoint(position.az)}
                {position.alt < 0 && " (below horizon)"}
              </dd>
            </div>
          )}
        </dl>

        {mode.type === "observation" && (
          <ObservationForm uid={uid} target={target} existing={mode.existing} onDone={back} />
        )}
        {mode.type === "plan" && <PlanForm uid={uid} target={target} existing={mode.existing} onDone={back} />}

        {mode.type === "view" && (
          <>
            <ObjectInfo key={object.id} object={object} />

            <div className="panel-actions">
              <button type="button" className="btn btn-primary" onClick={() => setMode({ type: "observation" })}>
                <PlusIcon size={16} /> Add observation
              </button>
              <button type="button" className="btn btn-plan" onClick={() => setMode({ type: "plan" })}>
                <FlagIcon size={16} /> Add to plan
              </button>
            </div>

            {plans.length > 0 && (
              <section className="panel-section">
                <h3>Planned</h3>
                <ul className="plan-chips">
                  {plans.map((p) => (
                    <li key={p.id} className="plan-chip">
                      <span className={`priority-badge priority-${p.priority}`}>{PRIORITY_LABELS[p.priority]}</span>
                      <span className="plan-chip-name">{p.name}</span>
                      <span className="muted">{formatPlanDate(p.month, p.year)}</span>
                      <button type="button" className="icon-btn small" aria-label="Edit plan" onClick={() => setMode({ type: "plan", existing: p })}>
                        <EditIcon size={14} />
                      </button>
                      <button type="button" className="icon-btn small" aria-label="Remove from plan" onClick={() => removePlan(p)}>
                        <TrashIcon size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="panel-section">
              <h3>
                Observations <span className="count">{observations.length}</span>
              </h3>
              {observations.length === 0 ? (
                <p className="muted">No observations of {object.name} yet.</p>
              ) : (
                <ol className="observation-list">
                  {observations.map((o) => (
                    <li key={o.id} className="observation-card">
                      <div className="observation-head">
                        <time dateTime={o.observedAt.toISOString()}>{formatDateTime(o.observedAt)}</time>
                        <div className="observation-tools">
                          <button
                            type="button"
                            className="icon-btn small"
                            aria-label="Edit observation"
                            onClick={() => setMode({ type: "observation", existing: o })}
                          >
                            <EditIcon size={14} />
                          </button>
                          <button type="button" className="icon-btn small" aria-label="Delete observation" onClick={() => removeObservation(o)}>
                            <TrashIcon size={14} />
                          </button>
                        </div>
                      </div>
                      {o.notes && <p className="observation-notes">{o.notes}</p>}
                      {o.photos.length > 0 && (
                        <div className="thumb-grid">
                          {o.photos.map((p, i) => (
                            <button
                              key={p.id}
                              type="button"
                              className="thumb"
                              onClick={() => onOpenPhoto(o.photos, i)}
                              aria-label={`Open ${p.fileName}`}
                            >
                              <img src={p.thumbUrl} alt="" loading="lazy" />
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
