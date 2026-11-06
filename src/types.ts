/** A celestial object from the built-in catalogs (star or deep-sky object). */
export interface SkyObject {
  /** Stable id: OpenNGC name for deep-sky objects ("NGC0224"), "HIP 677" for stars. */
  id: string;
  kind: "dso" | "star";
  /** Primary display name, e.g. "M31", "NGC 7000", "Vega", "α Lyr". */
  name: string;
  /** Other designations and common names. */
  aliases: string[];
  /** Human-readable type, e.g. "Galaxy". */
  typeLabel: string;
  /** Right ascension and declination in degrees (J2000). */
  ra: number;
  dec: number;
  mag: number | null;
  /** Angular size in arcminutes. */
  size?: { major: number; minor: number | null };
  constellation?: string;
}

/** The object an observation or plan is attached to (denormalised for pinning). */
export interface TargetRef {
  objectId: string;
  objectName: string;
  ra: number;
  dec: number;
}

export interface Photo {
  id: string;
  fileName: string;
  path: string;
  url: string;
  thumbPath: string;
  thumbUrl: string;
  width: number;
  height: number;
  size: number;
}

export interface Observation extends TargetRef {
  id: string;
  observedAt: Date;
  notes: string;
  photos: Photo[];
  createdAt: Date | null;
}

export type Priority = 1 | 2 | 3;

export const PRIORITY_LABELS: Record<Priority, string> = {
  1: "High",
  2: "Medium",
  3: "Low",
};

export interface Plan extends TargetRef {
  id: string;
  name: string;
  /** 1-12, optional. */
  month: number | null;
  year: number | null;
  priority: Priority;
  createdAt: Date | null;
}

export interface ObserverLocation {
  lat: number;
  lon: number;
}

export type ChartMode = "atlas" | "horizon";

export interface ChartLayers {
  constellations: boolean;
  grid: boolean;
  milkyWay: boolean;
  labels: boolean;
  dsos: boolean;
}
