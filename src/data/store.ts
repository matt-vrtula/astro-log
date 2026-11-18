import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import type { Equipment, Observation, ObserverLocation, Photo, Plan, Priority, TargetRef } from "../types";
import { deletePhotoFiles } from "./photos";

// Data layout (all private to the signed-in user):
//   users/{uid}                      { location?: { lat, lon } }
//   users/{uid}/observations/{id}    Observation
//   users/{uid}/plans/{id}           Plan
//   users/{uid}/equipment/{id}       Equipment

const observationsCol = (uid: string) => collection(db, "users", uid, "observations");
const plansCol = (uid: string) => collection(db, "users", uid, "plans");
const equipmentCol = (uid: string) => collection(db, "users", uid, "equipment");

const toDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);

// ---------- Writes ----------
//
// A Firestore write is applied to the local cache (and visible to listeners) at once, but its
// promise only settles when the server acknowledges it, which never happens while offline.
// So forms don't wait for it: they close once the write is queued, and a failure that the
// server reports later is published here for the app to show.

type WriteErrorListener = (error: Error) => void;
const writeErrorListeners = new Set<WriteErrorListener>();

export function onWriteError(listener: WriteErrorListener): () => void {
  writeErrorListeners.add(listener);
  return () => {
    writeErrorListeners.delete(listener);
  };
}

/**
 * Tracks a queued write. Resolves to true once the server has committed it, or false if it
 * failed (the error is reported to `onWriteError` listeners). Never rejects.
 */
function commit(write: Promise<void>): Promise<boolean> {
  return write.then(
    () => true,
    (error: Error) => {
      console.error("Write failed", error);
      writeErrorListeners.forEach((l) => l(error));
      return false;
    },
  );
}

function toObservation(id: string, d: DocumentData): Observation {
  return {
    id,
    objectId: d.objectId,
    objectName: d.objectName,
    ra: d.ra,
    dec: d.dec,
    observedAt: toDate(d.observedAt) ?? new Date(0),
    notes: d.notes ?? "",
    photos: (d.photos ?? []) as Photo[],
    equipmentId: d.equipmentId ?? null,
    createdAt: toDate(d.createdAt),
  };
}

function toEquipment(id: string, d: DocumentData): Equipment {
  return {
    id,
    name: d.name ?? "",
    brand: d.brand ?? "",
    apertureMm: d.apertureMm ?? null,
    focalLengthMm: d.focalLengthMm ?? null,
    photo: (d.photo ?? null) as Photo | null,
    createdAt: toDate(d.createdAt),
  };
}

function toPlan(id: string, d: DocumentData): Plan {
  return {
    id,
    objectId: d.objectId,
    objectName: d.objectName,
    ra: d.ra,
    dec: d.dec,
    name: d.name ?? d.objectName,
    month: d.month ?? null,
    year: d.year ?? null,
    priority: (d.priority ?? 2) as Priority,
    createdAt: toDate(d.createdAt),
  };
}

interface LiveState<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

function useLiveCollection<T>(
  uid: string,
  col: (uid: string) => ReturnType<typeof collection>,
  map: (id: string, d: DocumentData) => T,
): LiveState<T[]> {
  const [state, setState] = useState<LiveState<T[]>>({ data: [], loading: true, error: null });
  useEffect(() => {
    setState({ data: [], loading: true, error: null });
    return onSnapshot(
      col(uid),
      (snap) => setState({ data: snap.docs.map((d) => map(d.id, d.data())), loading: false, error: null }),
      (error) => setState((s) => ({ ...s, loading: false, error })),
    );
  }, [uid, col, map]);
  return state;
}

// ---------- Observations ----------

export function useObservations(uid: string) {
  return useLiveCollection(uid, observationsCol, toObservation);
}

/** Reserves a document id so photos can be uploaded before the observation is saved. */
export const newObservationId = (uid: string) => doc(observationsCol(uid)).id;

export interface ObservationInput {
  observedAt: Date;
  notes: string;
  photos: Photo[];
  equipmentId: string | null;
}

/**
 * Queues the write and returns immediately (invalid data throws synchronously).
 * The returned promise tells whether the server committed it; see `commit`.
 */
export function saveObservation(uid: string, id: string, target: TargetRef, input: ObservationInput, isNew: boolean) {
  const ref = doc(observationsCol(uid), id);
  const data = {
    ...target,
    observedAt: Timestamp.fromDate(input.observedAt),
    notes: input.notes,
    photos: input.photos,
    equipmentId: input.equipmentId,
    updatedAt: serverTimestamp(),
  };
  return commit(isNew ? setDoc(ref, { ...data, createdAt: serverTimestamp() }) : updateDoc(ref, data));
}

/**
 * Queues the delete and returns immediately. The photo files are removed only after the server
 * has committed it: if the delete fails, the observation keeps working photos (a failure while
 * removing the files leaves orphans in Storage, which is the lesser harm).
 */
export function deleteObservation(uid: string, observation: Observation) {
  return commit(deleteDoc(doc(observationsCol(uid), observation.id))).then(async (ok) => {
    if (!ok) return false;
    await Promise.all(observation.photos.map(deletePhotoFiles)).catch((err) =>
      console.warn("Photo cleanup failed", err),
    );
    return true;
  });
}

// ---------- Plans ----------

export function usePlans(uid: string) {
  return useLiveCollection(uid, plansCol, toPlan);
}

export interface PlanInput {
  name: string;
  month: number | null;
  year: number | null;
  priority: Priority;
}

/** Queues the write and returns immediately; see `saveObservation`. */
export function savePlan(uid: string, id: string | null, target: TargetRef, input: PlanInput) {
  return commit(
    id
      ? updateDoc(doc(plansCol(uid), id), { ...input, updatedAt: serverTimestamp() })
      : setDoc(doc(plansCol(uid)), { ...target, ...input, createdAt: serverTimestamp() }),
  );
}

export async function deletePlan(uid: string, id: string) {
  await deleteDoc(doc(plansCol(uid), id));
}

/** Plans ordered by priority, then target date (undated last), then name. */
export function sortPlans(plans: Plan[]): Plan[] {
  const dateKey = (p: Plan) => (p.year ?? 9999) * 100 + (p.month ?? 13);
  return [...plans].sort(
    (a, b) => a.priority - b.priority || dateKey(a) - dateKey(b) || a.name.localeCompare(b.name),
  );
}

// ---------- Equipment ----------

export function useEquipment(uid: string) {
  return useLiveCollection(uid, equipmentCol, toEquipment);
}

/** Equipment ordered by name. */
export function sortEquipment(items: Equipment[]): Equipment[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Reserves a document id so the photo can be uploaded before the equipment is saved. */
export const newEquipmentId = (uid: string) => doc(equipmentCol(uid)).id;

export interface EquipmentInput {
  name: string;
  brand: string;
  apertureMm: number | null;
  focalLengthMm: number | null;
  photo: Photo | null;
}

/** Queues the write and returns immediately; see `saveObservation`. */
export function saveEquipment(uid: string, id: string, input: EquipmentInput, isNew: boolean) {
  const ref = doc(equipmentCol(uid), id);
  const data = { ...input, updatedAt: serverTimestamp() };
  return commit(isNew ? setDoc(ref, { ...data, createdAt: serverTimestamp() }) : updateDoc(ref, data));
}

/**
 * Queues the delete and returns immediately; the photo is removed once the server has
 * committed it (see `deleteObservation`). Observations that used this equipment keep its id
 * and simply stop showing it.
 */
export function deleteEquipment(uid: string, equipment: Equipment) {
  return commit(deleteDoc(doc(equipmentCol(uid), equipment.id))).then(async (ok) => {
    if (!ok) return false;
    if (equipment.photo) {
      await deletePhotoFiles(equipment.photo).catch((err) => console.warn("Photo cleanup failed", err));
    }
    return true;
  });
}

// ---------- User settings ----------

export function useUserLocation(uid: string) {
  const [location, setLocation] = useState<ObserverLocation | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(
    () =>
      onSnapshot(
        doc(db, "users", uid),
        (snap) => {
          const loc = snap.data()?.location;
          setLocation(loc && typeof loc.lat === "number" ? { lat: loc.lat, lon: loc.lon } : null);
          setLoading(false);
        },
        () => setLoading(false),
      ),
    [uid],
  );
  return { location, loading };
}

/** Queues the write and returns immediately; see `saveObservation`. */
export function saveUserLocation(uid: string, location: ObserverLocation) {
  return commit(setDoc(doc(db, "users", uid), { location }, { merge: true }));
}
