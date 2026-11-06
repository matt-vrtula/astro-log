import { useState } from "react";
import type { ObserverLocation } from "../types";
import { Modal } from "./Modal";

interface Props {
  initial: ObserverLocation | null;
  onSave(location: ObserverLocation): Promise<void>;
  onClose(): void;
}

export function LocationDialog({ initial, onSave, onClose }: Props) {
  const [lat, setLat] = useState(initial ? String(initial.lat) : "");
  const [lon, setLon] = useState(initial ? String(initial.lon) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function useCurrent() {
    if (!navigator.geolocation) {
      setError("Your browser does not support location access.");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(4));
        setLon(pos.coords.longitude.toFixed(4));
        setBusy(false);
      },
      (err) => {
        setError(`Could not get your location: ${err.message}`);
        setBusy(false);
      },
      { enableHighAccuracy: false, timeout: 15000 },
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const la = Number(lat), lo = Number(lon);
    if (lat.trim() === "" || !Number.isFinite(la) || la < -90 || la > 90) {
      setError("Latitude must be a number between -90 and 90.");
      return;
    }
    if (lon.trim() === "" || !Number.isFinite(lo) || lo < -180 || lo > 180) {
      setError("Longitude must be a number between -180 and 180.");
      return;
    }
    setBusy(true);
    try {
      await onSave({ lat: la, lon: lo });
      onClose();
    } catch (err) {
      setError(`Could not save: ${(err as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <Modal title="Observing location" onClose={onClose}>
      <form onSubmit={submit} className="form">
        <p className="muted">
          Used for the “My sky” view: what is above your horizon at a given time. Decimal degrees, north and
          east positive.
        </p>
        <div className="form-row">
          <label>
            Latitude
            <input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="48.15" />
          </label>
          <label>
            Longitude
            <input inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="17.11" />
          </label>
        </div>
        <button type="button" className="btn btn-ghost" onClick={useCurrent} disabled={busy}>
          Use my current location
        </button>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
