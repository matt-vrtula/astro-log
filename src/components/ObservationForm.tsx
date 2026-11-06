import { useEffect, useRef, useState } from "react";
import { deletePhotoFiles, uploadPhoto, validatePhoto, ACCEPTED_IMAGE_TYPES } from "../data/photos";
import { newObservationId, saveObservation } from "../data/store";
import { formatBytes, parseLocalInputValue, toLocalInputValue } from "../format";
import type { Observation, Photo, TargetRef } from "../types";
import { CameraIcon, CloseIcon } from "./Icons";

interface Props {
  uid: string;
  target: TargetRef;
  /** Observation being edited, or undefined for a new one. */
  existing?: Observation;
  onDone(): void;
}

interface NewFile {
  key: string;
  file: File;
  preview: string;
}

export function ObservationForm({ uid, target, existing, onDone }: Props) {
  const [when, setWhen] = useState(toLocalInputValue(existing?.observedAt ?? new Date()));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [kept, setKept] = useState<Photo[]>(existing?.photos ?? []);
  const [added, setAdded] = useState<NewFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Release preview object URLs.
  const addedRef = useRef(added);
  addedRef.current = added;
  useEffect(() => () => addedRef.current.forEach((f) => URL.revokeObjectURL(f.preview)), []);

  function addFiles(files: FileList | File[]) {
    const errors: string[] = [];
    const next: NewFile[] = [];
    for (const file of Array.from(files)) {
      const problem = validatePhoto(file);
      if (problem) errors.push(problem);
      else next.push({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file) });
    }
    setAdded((a) => [...a, ...next]);
    setError(errors.length ? errors.join(" ") : null);
  }

  function removeAdded(key: string) {
    setAdded((a) => {
      const f = a.find((x) => x.key === key);
      if (f) URL.revokeObjectURL(f.preview);
      return a.filter((x) => x.key !== key);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const observedAt = parseLocalInputValue(when);
    if (!observedAt) {
      setError("Please enter the date and time of the observation.");
      return;
    }
    setSaving(true);
    setError(null);

    const id = existing?.id ?? newObservationId(uid);
    // Indexed by position in `added` so photos keep the order they were added in.
    const uploaded: (Photo | undefined)[] = new Array(added.length);
    const uploadedPhotos = () => uploaded.filter((p): p is Photo => Boolean(p));
    const totalBytes = added.reduce((s, f) => s + f.file.size, 0);
    const sent = new Array<number>(added.length).fill(0);
    const report = () => setProgress(totalBytes ? sent.reduce((a, b) => a + b, 0) / totalBytes : 1);

    try {
      if (added.length) setProgress(0);
      // Upload two at a time to keep the connection busy without saturating it.
      let next = 0;
      const worker = async () => {
        while (next < added.length) {
          const i = next++;
          uploaded[i] = await uploadPhoto(uid, id, added[i].file, (b) => {
            sent[i] = b;
            report();
          });
        }
      };
      await Promise.all([worker(), worker()]);

      await saveObservation(
        uid,
        id,
        target,
        { observedAt, notes: notes.trim(), photos: [...kept, ...uploadedPhotos()] },
        !existing,
      );

      // Remove photos the user deleted while editing.
      const removed = (existing?.photos ?? []).filter((p) => !kept.some((k) => k.id === p.id));
      await Promise.all(removed.map(deletePhotoFiles)).catch((err) => console.warn("Photo cleanup failed", err));
      onDone();
    } catch (err) {
      console.error(err);
      // Don't leave orphaned uploads behind.
      await Promise.all(uploadedPhotos().map(deletePhotoFiles)).catch(() => {});
      setError(`Saving failed: ${(err as Error).message}`);
      setSaving(false);
      setProgress(null);
    }
  }

  return (
    <form className="form observation-form" onSubmit={submit}>
      <h3>{existing ? "Edit observation" : "New observation"}</h3>
      <label>
        Date and time
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
      </label>
      <label>
        Notes
        <textarea
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Conditions, equipment, exposure, what you saw…"
        />
      </label>

      <div>
        <div className="label">Photos</div>
        <div
          className={`dropzone${dragOver ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          {(kept.length > 0 || added.length > 0) && (
            <div className="thumb-grid">
              {kept.map((p) => (
                <div key={p.id} className="thumb">
                  <img src={p.thumbUrl} alt={p.fileName} />
                  <button
                    type="button"
                    className="thumb-remove"
                    aria-label={`Remove ${p.fileName}`}
                    onClick={() => setKept((k) => k.filter((x) => x.id !== p.id))}
                    disabled={saving}
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
              ))}
              {added.map((f) => (
                <div key={f.key} className="thumb new" title={`${f.file.name} (${formatBytes(f.file.size)})`}>
                  <img src={f.preview} alt={f.file.name} />
                  <button
                    type="button"
                    className="thumb-remove"
                    aria-label={`Remove ${f.file.name}`}
                    onClick={() => removeAdded(f.key)}
                    disabled={saving}
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => fileInput.current?.click()} disabled={saving}>
            <CameraIcon size={16} /> Add photos
          </button>
          <span className="muted small">or drop images here (JPEG, PNG, WebP; up to 50 MB each)</span>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
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
          {saving ? (added.length ? "Uploading…" : "Saving…") : "Save observation"}
        </button>
      </div>
    </form>
  );
}
