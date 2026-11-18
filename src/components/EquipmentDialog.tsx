import { useEffect, useRef, useState } from "react";
import { ACCEPTED_IMAGE_TYPES, deletePhotoFiles, equipmentPhotoFolder, uploadPhoto, validatePhoto } from "../data/photos";
import { deleteEquipment, newEquipmentId, saveEquipment } from "../data/store";
import { formatEquipmentSpecs, parseMillimetres } from "../format";
import type { Equipment, Photo } from "../types";
import { CameraIcon, CloseIcon, EditIcon, PlusIcon, TelescopeIcon, TrashIcon } from "./Icons";
import { Modal } from "./Modal";

interface Props {
  uid: string;
  /** Already sorted. */
  equipment: Equipment[];
  loading: boolean;
  /** Number of observations that use each piece of equipment, by id. */
  usage: Map<string, number>;
  onClose(): void;
}

/** "My equipment": lists the user's equipment and adds, edits and deletes it. */
export function EquipmentDialog({ uid, equipment, loading, usage, onClose }: Props) {
  const [editing, setEditing] = useState<{ existing?: Equipment } | null>(null);

  function remove(e: Equipment) {
    const n = usage.get(e.id) ?? 0;
    const used = n
      ? `\n\nIt is used in ${n} observation${n > 1 ? "s" : ""}. They will be kept, but will no longer show this equipment.`
      : "";
    if (!confirm(`Delete “${e.name}”?${used}`)) return;
    // Not awaited: queued locally, works offline. Server-side failures are shown by the app.
    void deleteEquipment(uid, e);
  }

  const title = editing ? (editing.existing ? "Edit equipment" : "Add equipment") : "My equipment";

  return (
    <Modal title={title} onClose={onClose}>
      {editing ? (
        <EquipmentForm uid={uid} existing={editing.existing} onDone={() => setEditing(null)} />
      ) : (
        <div className="equipment-manager">
          {loading ? (
            <p className="muted">Loading…</p>
          ) : equipment.length === 0 ? (
            <div className="empty-state">
              <p>No equipment yet.</p>
              <p className="muted">Add your telescopes to record which one you used for each observation.</p>
            </div>
          ) : (
            <ul className="equipment-list">
              {equipment.map((e) => {
                const specs = formatEquipmentSpecs(e);
                return (
                  <li key={e.id} className="equipment-item">
                    <div className="equipment-thumb">
                      {e.photo ? <img src={e.photo.thumbUrl} alt="" /> : <TelescopeIcon size={26} />}
                    </div>
                    <div className="equipment-text">
                      <span className="equipment-name">{e.name}</span>
                      {e.brand && <span className="muted small">{e.brand}</span>}
                      {specs && <span className="small">{specs}</span>}
                    </div>
                    <div className="equipment-tools">
                      <button
                        type="button"
                        className="icon-btn small"
                        aria-label={`Edit ${e.name}`}
                        onClick={() => setEditing({ existing: e })}
                      >
                        <EditIcon size={14} />
                      </button>
                      <button type="button" className="icon-btn small" aria-label={`Delete ${e.name}`} onClick={() => remove(e)}>
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>
              <PlusIcon size={16} /> Add equipment
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

interface FormProps {
  uid: string;
  existing?: Equipment;
  onDone(): void;
}

function EquipmentForm({ uid, existing, onDone }: FormProps) {
  const [name, setName] = useState(existing?.name ?? "");
  const [brand, setBrand] = useState(existing?.brand ?? "");
  const [aperture, setAperture] = useState(existing?.apertureMm != null ? String(existing.apertureMm) : "");
  const [focalLength, setFocalLength] = useState(existing?.focalLengthMm != null ? String(existing.focalLengthMm) : "");
  // The current photo is either the saved one (`kept`) or a newly picked file (`added`).
  const [kept, setKept] = useState<Photo | null>(existing?.photo ?? null);
  const [added, setAdded] = useState<{ file: File; preview: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Release the preview object URL.
  const addedRef = useRef(added);
  addedRef.current = added;
  useEffect(
    () => () => {
      if (addedRef.current) URL.revokeObjectURL(addedRef.current.preview);
    },
    [],
  );

  function pickPhoto(file: File) {
    const problem = validatePhoto(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    if (added) URL.revokeObjectURL(added.preview);
    setAdded({ file, preview: URL.createObjectURL(file) });
    setKept(null);
  }

  function removePhoto() {
    if (added) URL.revokeObjectURL(added.preview);
    setAdded(null);
    setKept(null);
  }

  const apertureMm = parseMillimetres(aperture);
  const focalLengthMm = parseMillimetres(focalLength);
  const specsPreview = formatEquipmentSpecs({ apertureMm: apertureMm ?? null, focalLengthMm: focalLengthMm ?? null });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter a name.");
      return;
    }
    if (apertureMm === undefined) {
      setError("Aperture must be a positive number of millimetres.");
      return;
    }
    if (focalLengthMm === undefined) {
      setError("Focal length must be a positive number of millimetres.");
      return;
    }
    setSaving(true);
    setError(null);

    const id = existing?.id ?? newEquipmentId(uid);
    let uploaded: Photo | null = null;
    try {
      if (added) {
        setProgress(0);
        const size = added.file.size || 1;
        uploaded = await uploadPhoto(equipmentPhotoFolder(uid, id), added.file, (b) => setProgress(b / size));
      }
      const photo = uploaded ?? kept;

      // Not awaited: the write is queued locally and may only reach the server once back online.
      const committed = saveEquipment(
        uid,
        id,
        { name: trimmedName, brand: brand.trim(), apertureMm, focalLengthMm, photo },
        !existing,
      );

      // Remove a replaced or removed photo once the equipment no longer references it.
      const old = existing?.photo;
      if (old && old.id !== photo?.id) {
        void committed.then(async (ok) => {
          if (ok) await deletePhotoFiles(old).catch((err) => console.warn("Photo cleanup failed", err));
        });
      }
      onDone();
    } catch (err) {
      console.error(err);
      // Don't leave an orphaned upload behind.
      if (uploaded) await deletePhotoFiles(uploaded).catch(() => {});
      setError(`Saving failed: ${(err as Error).message}`);
      setSaving(false);
      setProgress(null);
    }
  }

  const shownPhoto = added ? { src: added.preview, alt: added.file.name } : kept ? { src: kept.thumbUrl, alt: kept.fileName } : null;

  return (
    <form className="form equipment-form" onSubmit={submit}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 8″ Dobsonian" required autoFocus />
      </label>
      <label>
        <span>
          Brand <span className="muted">(optional)</span>
        </span>
        <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Sky-Watcher" />
      </label>
      <div className="form-row">
        <label>
          <span>
            Aperture, mm <span className="muted">(optional)</span>
          </span>
          <input inputMode="decimal" value={aperture} onChange={(e) => setAperture(e.target.value)} placeholder="200" />
        </label>
        <label>
          <span>
            Focal length, mm <span className="muted">(optional)</span>
          </span>
          <input inputMode="decimal" value={focalLength} onChange={(e) => setFocalLength(e.target.value)} placeholder="1200" />
        </label>
      </div>
      {specsPreview && <p className="muted small equipment-specs-preview">{specsPreview}</p>}

      <div>
        <div className="label">
          <span>
            Photo <span className="muted">(optional)</span>
          </span>
        </div>
        <div className="equipment-photo-field">
          {shownPhoto && (
            <div className={`thumb${added ? " new" : ""}`}>
              <img src={shownPhoto.src} alt={shownPhoto.alt} />
              <button
                type="button"
                className="thumb-remove"
                aria-label="Remove photo"
                onClick={removePhoto}
                disabled={saving}
              >
                <CloseIcon size={14} />
              </button>
            </div>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => fileInput.current?.click()} disabled={saving}>
            <CameraIcon size={16} /> {shownPhoto ? "Replace photo" : "Add photo"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) pickPhoto(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {progress !== null && (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onDone} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? (added ? "Uploading…" : "Saving…") : existing ? "Save" : "Add equipment"}
        </button>
      </div>
    </form>
  );
}
