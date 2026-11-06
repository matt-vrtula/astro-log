// Downloads the source catalogs and writes compact JSON files to public/data.
// Run with: npm run build:catalog
//
// Sources:
//   OpenNGC (NGC/IC/Messier), CC BY-SA 4.0 - https://github.com/mattiaverga/OpenNGC
//   d3-celestial data (stars, star names, constellations, Milky Way), BSD-3-Clause
//     - https://github.com/ofrohn/d3-celestial

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = join(import.meta.dirname, "..", "public", "data");
const OPENNGC = "https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files";
const D3C = "https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35";

async function get(url, type = "text") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return type === "json" ? res.json() : res.text();
}

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
const raDeg = (lon) => round(lon < 0 ? lon + 360 : lon, 4);

// ---------- Deep-sky objects (OpenNGC) ----------

const SKIP_TYPES = new Set(["Dup", "NonEx", "*", "**", "Other", "Nova"]);

function parseSexagesimal(value, hours) {
  const sign = value.trim().startsWith("-") ? -1 : 1;
  const [a, b, c] = value.replace(/^[+-]/, "").split(":").map(Number);
  const deg = a + b / 60 + c / 3600;
  return sign * deg * (hours ? 15 : 1);
}

const num = (v) => (v === "" || v == null ? null : Number(v));

function parseOpenNgc(csv, { addendum }) {
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  const cols = header.split(";");
  const idx = Object.fromEntries(cols.map((c, i) => [c, i]));
  const out = [];
  for (const row of rows) {
    const f = row.split(";");
    const name = f[idx.Name];
    const type = f[idx.Type];
    const messier = num(f[idx.M]);
    const common = (f[idx["Common names"]] || "").split(",")[0].trim();
    if (!f[idx.RA] || !f[idx.Dec]) continue;
    if (!messier && SKIP_TYPES.has(type)) continue;
    // The addendum is mostly faint ESO galaxies; keep only the well-known objects.
    if (addendum && !messier && !common) continue;
    out.push([
      name,
      type,
      round(parseSexagesimal(f[idx.RA], true), 4),
      round(parseSexagesimal(f[idx.Dec], false), 4),
      num(f[idx["V-Mag"]]) ?? num(f[idx["B-Mag"]]),
      num(f[idx.MajAx]),
      num(f[idx.MinAx]),
      num(f[idx.PosAng]),
      messier,
      common,
      f[idx.Const] || "",
    ]);
  }
  return out;
}

console.log("Downloading OpenNGC...");
const dsos = [
  ...parseOpenNgc(await get(`${OPENNGC}/NGC.csv`), { addendum: false }),
  ...parseOpenNgc(await get(`${OPENNGC}/addendum.csv`), { addendum: true }),
];
// M102 has no Messier number in OpenNGC; it is usually identified with NGC 5866.
const m102 = dsos.find((d) => d[0] === "NGC5866");
if (m102 && !m102[8]) m102[8] = 102;
// Brightest first so the renderer can draw/label in a sensible order.
dsos.sort((a, b) => (a[4] ?? 99) - (b[4] ?? 99));
const messierCount = dsos.filter((d) => d[8]).length;
console.log(`  ${dsos.length} deep-sky objects (${messierCount} Messier)`);

// ---------- Stars (d3-celestial, Hipparcos to mag 8) ----------

console.log("Downloading stars...");
const starsGeo = await get(`${D3C}/data/stars.8.json`, "json");
const starNames = await get(`${D3C}/data/starnames.json`, "json");

const stars = starsGeo.features
  .map((f) => [
    raDeg(f.geometry.coordinates[0]),
    round(f.geometry.coordinates[1], 4),
    round(f.properties.mag, 2),
    round(Number(f.properties.bv) || 0, 2),
    f.id,
  ])
  .sort((a, b) => a[2] - b[2]);

const names = {};
for (const [hip, n] of Object.entries(starNames)) {
  const desig = n.bayer ? `${n.bayer} ${n.c}` : n.flam ? `${n.flam} ${n.c}` : "";
  if (n.name || desig) names[hip] = [n.name || "", desig];
}
console.log(`  ${stars.length} stars, ${Object.keys(names).length} with names`);

// ---------- Constellations ----------

console.log("Downloading constellations and Milky Way...");
const lines = await get(`${D3C}/data/constellations.lines.json`, "json");
const consts = await get(`${D3C}/data/constellations.json`, "json");
const mw = await get(`${D3C}/data/mw.json`, "json");

const roundCoords = (c) =>
  typeof c[0] === "number" ? [round(c[0], 2), round(c[1], 2)] : c.map(roundCoords);

const constellations = {
  lines: lines.features.map((f) => ({ id: f.id, lines: roundCoords(f.geometry.coordinates) })),
  names: consts.features.map((f) => ({
    id: f.id,
    name: f.properties.name,
    ra: raDeg(f.geometry.coordinates[0]),
    dec: round(f.geometry.coordinates[1], 2),
  })),
};

const milkyWay = {
  type: "FeatureCollection",
  features: mw.features.map((f) => ({
    type: "Feature",
    id: f.id,
    properties: {},
    geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) },
  })),
};

// ---------- Write ----------

await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, "dsos.json"), JSON.stringify(dsos));
await writeFile(join(OUT, "stars.json"), JSON.stringify({ stars, names }));
await writeFile(join(OUT, "constellations.json"), JSON.stringify(constellations));
await writeFile(join(OUT, "milkyway.json"), JSON.stringify(milkyWay));

const d3License = await get(`${D3C}/LICENSE`);
await writeFile(
  join(OUT, "LICENSES.txt"),
  `dsos.json is derived from OpenNGC by Mattia Verga
https://github.com/mattiaverga/OpenNGC
Licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).
dsos.json is therefore also distributed under CC BY-SA 4.0.

stars.json, constellations.json and milkyway.json are derived from the data of
d3-celestial by Olaf Frohn (https://github.com/ofrohn/d3-celestial):

${d3License}`,
);

console.log(`Done. Files written to ${OUT}`);
