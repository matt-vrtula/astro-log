import type { FeatureCollection, MultiLineString, Feature } from "geojson";
import type { SkyObject } from "../types";

// ---------- Raw data formats (see scripts/build-catalog.mjs) ----------

type RawDso = [
  id: string,
  type: string,
  ra: number,
  dec: number,
  mag: number | null,
  major: number | null,
  minor: number | null,
  pa: number | null,
  messier: number | null,
  common: string,
  constellation: string,
];

interface RawStars {
  /** [ra, dec, mag, bv, hip], sorted by magnitude. */
  stars: [number, number, number, number, number][];
  /** hip -> [proper name, designation] */
  names: Record<string, [string, string]>;
}

interface RawConstellations {
  lines: { id: string; lines: [number, number][][] }[];
  names: { id: string; name: string; ra: number; dec: number }[];
}

// ---------- Loaded catalog ----------

export interface Dso {
  id: string;
  type: string;
  ra: number;
  dec: number;
  mag: number | null;
  major: number | null;
  minor: number | null;
  pa: number | null;
  messier: number | null;
  common: string;
  constellation: string;
  /** Short chart label, e.g. "M31" or "NGC 7000". */
  label: string;
}

export interface StarTable {
  count: number;
  ra: Float64Array;
  dec: Float64Array;
  mag: Float32Array;
  bv: Float32Array;
  hip: Int32Array;
  names: Map<number, { name: string; designation: string }>;
}

export interface ConstellationName {
  id: string;
  name: string;
  ra: number;
  dec: number;
}

export interface Catalog {
  stars: StarTable;
  dsos: Dso[];
  constellationLines: Feature<MultiLineString>[];
  constellationNames: ConstellationName[];
  milkyWay: FeatureCollection;
  findById(id: string): SkyObject | null;
  search(query: string, limit?: number): SkyObject[];
  dsoToObject(dso: Dso): SkyObject;
  starToObject(index: number): SkyObject;
}

export const DSO_TYPE_LABELS: Record<string, string> = {
  G: "Galaxy",
  GPair: "Galaxy pair",
  GTrpl: "Galaxy triplet",
  GGroup: "Galaxy group",
  OCl: "Open cluster",
  GCl: "Globular cluster",
  "Cl+N": "Star cluster with nebula",
  "*Ass": "Stellar association / asterism",
  PN: "Planetary nebula",
  HII: "HII region",
  EmN: "Emission nebula",
  Neb: "Nebula",
  RfN: "Reflection nebula",
  DrkN: "Dark nebula",
  SNR: "Supernova remnant",
  "**": "Double star",
  "*": "Star",
  Other: "Other",
};

/** "NGC0224" -> "NGC 224", "IC0434" -> "IC 434", "Mel022" -> "Mel 22". */
export function formatCatalogName(id: string): string {
  const m = /^([A-Za-z]+)0*(\d.*)$/.exec(id);
  return m ? `${m[1]} ${m[2]}` : id;
}

const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_'’.]/g, "");

let catalogPromise: Promise<Catalog> | null = null;

export function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= buildCatalog().catch((err) => {
    catalogPromise = null;
    throw err;
  });
  return catalogPromise;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return res.json() as Promise<T>;
}

async function buildCatalog(): Promise<Catalog> {
  const [rawDsos, rawStars, rawConst, milkyWay] = await Promise.all([
    fetchJson<RawDso[]>("/data/dsos.json"),
    fetchJson<RawStars>("/data/stars.json"),
    fetchJson<RawConstellations>("/data/constellations.json"),
    fetchJson<FeatureCollection>("/data/milkyway.json"),
  ]);

  const constNames = new Map(rawConst.names.map((c) => [c.id, c.name]));

  // ---- Deep-sky objects ----
  const dsos: Dso[] = rawDsos.map((d) => ({
    id: d[0],
    type: d[1],
    ra: d[2],
    dec: d[3],
    mag: d[4],
    major: d[5],
    minor: d[6],
    pa: d[7],
    messier: d[8],
    common: d[9],
    constellation: d[10],
    label: d[8] ? `M${d[8]}` : formatCatalogName(d[0]),
  }));
  const dsoById = new Map(dsos.map((d) => [d.id, d]));

  // ---- Stars ----
  const n = rawStars.stars.length;
  const stars: StarTable = {
    count: n,
    ra: new Float64Array(n),
    dec: new Float64Array(n),
    mag: new Float32Array(n),
    bv: new Float32Array(n),
    hip: new Int32Array(n),
    names: new Map(),
  };
  const starIndexByHip = new Map<number, number>();
  rawStars.stars.forEach(([ra, dec, mag, bv, hip], i) => {
    stars.ra[i] = ra;
    stars.dec[i] = dec;
    stars.mag[i] = mag;
    stars.bv[i] = bv;
    stars.hip[i] = hip;
    starIndexByHip.set(hip, i);
  });
  for (const [hip, [name, designation]] of Object.entries(rawStars.names)) {
    stars.names.set(Number(hip), { name, designation });
  }

  function dsoToObject(d: Dso): SkyObject {
    const catalogName = formatCatalogName(d.id);
    const aliases = [d.messier ? catalogName : null, d.common || null].filter(
      (a): a is string => Boolean(a),
    );
    return {
      id: d.id,
      kind: "dso",
      name: d.label,
      aliases,
      typeLabel: DSO_TYPE_LABELS[d.type] ?? d.type,
      ra: d.ra,
      dec: d.dec,
      mag: d.mag,
      size: d.major ? { major: d.major, minor: d.minor } : undefined,
      constellation: constNames.get(d.constellation) ?? d.constellation,
    };
  }

  function starToObject(i: number): SkyObject {
    const hip = stars.hip[i];
    const names = stars.names.get(hip);
    const hipName = `HIP ${hip}`;
    const name = names?.name || names?.designation || hipName;
    const aliases = [names?.name ? names.designation : null, name !== hipName ? hipName : null].filter(
      (a): a is string => Boolean(a),
    );
    return {
      id: hipName,
      kind: "star",
      name,
      aliases,
      typeLabel: "Star",
      ra: stars.ra[i],
      dec: stars.dec[i],
      mag: Math.round(stars.mag[i] * 100) / 100,
    };
  }

  function findById(id: string): SkyObject | null {
    const dso = dsoById.get(id);
    if (dso) return dsoToObject(dso);
    const hipMatch = /^HIP (\d+)$/.exec(id);
    if (hipMatch) {
      const i = starIndexByHip.get(Number(hipMatch[1]));
      if (i !== undefined) return starToObject(i);
    }
    return null;
  }

  // ---- Search index ----
  interface Entry {
    key: string;
    rank: number; // lower = more prominent
    get: () => SkyObject;
  }
  const entries: Entry[] = [];
  for (const d of dsos) {
    const rank = d.messier ? 0 : 10 + (d.mag ?? 20);
    const get = () => dsoToObject(d);
    entries.push({ key: normalize(formatCatalogName(d.id)), rank, get });
    if (d.messier) {
      entries.push({ key: `m${d.messier}`, rank, get });
      entries.push({ key: `messier${d.messier}`, rank, get });
    }
    if (d.common) entries.push({ key: normalize(d.common), rank, get });
  }
  for (const [hip, names] of stars.names) {
    const i = starIndexByHip.get(hip);
    if (i === undefined) continue;
    const rank = 5 + stars.mag[i];
    const get = () => starToObject(i);
    if (names.name) entries.push({ key: normalize(names.name), rank, get });
    if (names.designation) entries.push({ key: normalize(names.designation), rank: rank + 5, get });
  }
  for (const [hip, i] of starIndexByHip) {
    if (stars.mag[i] < 6.5) entries.push({ key: `hip${hip}`, rank: 30, get: () => starToObject(i) });
  }

  function search(query: string, limit = 8): SkyObject[] {
    const q = normalize(query);
    if (!q) return [];
    const scored: { score: number; entry: Entry }[] = [];
    for (const e of entries) {
      let score: number;
      if (e.key === q) score = 0;
      else if (e.key.startsWith(q)) score = 1000 + e.key.length - q.length;
      else if (q.length >= 3 && e.key.includes(q)) score = 2000;
      else continue;
      scored.push({ score: score + e.rank, entry: e });
    }
    scored.sort((a, b) => a.score - b.score);
    const seen = new Set<string>();
    const results: SkyObject[] = [];
    for (const { entry } of scored) {
      const obj = entry.get();
      if (seen.has(obj.id)) continue;
      seen.add(obj.id);
      results.push(obj);
      if (results.length >= limit) break;
    }
    return results;
  }

  const constellationLines: Feature<MultiLineString>[] = rawConst.lines.map((c) => ({
    type: "Feature",
    id: c.id,
    properties: {},
    geometry: { type: "MultiLineString", coordinates: c.lines },
  }));

  return {
    stars,
    dsos,
    constellationLines,
    constellationNames: rawConst.names,
    milkyWay,
    findById,
    search,
    dsoToObject,
    starToObject,
  };
}
