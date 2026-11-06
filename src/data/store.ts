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
import type { Observation, ObserverLocation, Photo, Plan, Priority, TargetRef } from "../types";
import { deletePhotoFiles } from "./photos";

// Data layout (all private to the signed-in user):
//   users/{uid}                      { location?: { lat, lon } }
//   users/{uid}/observations/{id}    Observation
//   users/{uid}/plans/{id}           Plan

const observationsCol = (uid: string) => collection(db, "users", uid, "observations");
const plansCol = (uid: string) => collection(db, "users", uid, "plans");

const toDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);

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
}

export async function saveObservation(uid: string, id: string, target: TargetRef, input: ObservationInput, isNew: boolean) {
  const ref = doc(observationsCol(uid), id);
  const data = {
    ...target,
    observedAt: Timestamp.fromDate(input.observedAt),
    notes: input.notes,
    photos: input.photos,
    updatedAt: serverTimestamp(),
  };
  if (isNew) await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  else await updateDoc(ref, data);
}

export async function deleteObservation(uid: string, observation: Observation) {
  await Promise.all(observation.photos.map(deletePhotoFiles));
  await deleteDoc(doc(observationsCol(uid), observation.id));
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

export async function savePlan(uid: string, id: string | null, target: TargetRef, input: PlanInput) {
  if (id) {
    await updateDoc(doc(plansCol(uid), id), { ...input, updatedAt: serverTimestamp() });
  } else {
    await setDoc(doc(plansCol(uid)), { ...target, ...input, createdAt: serverTimestamp() });
  }
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

export async function saveUserLocation(uid: string, location: ObserverLocation) {
  await setDoc(doc(db, "users", uid), { location }, { merge: true });
}
