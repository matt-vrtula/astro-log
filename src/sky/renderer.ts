import {
  geoCircle,
  geoGraticule,
  geoPath,
  geoRotation,
  geoStereographic,
  type GeoProjection,
} from "d3-geo";
import type { ChartLayers, ChartMode, ObserverLocation } from "../types";
import {
  azToFrameLon,
  composeRotations,
  equatorialToHorizonRotation,
  lstDeg,
  type Rotation,
} from "./astro";
import type { Catalog, Dso, StarTable } from "./catalog";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

// ---------- Public types ----------

export interface ViewCenter {
  /** RA in atlas mode, azimuth in horizon mode (degrees). */
  lon: number;
  /** Dec in atlas mode, altitude in horizon mode (degrees). */
  lat: number;
  /** Field of view across the shorter screen side (degrees). */
  fov: number;
}

export interface Pin {
  objectId: string;
  name: string;
  ra: number;
  dec: number;
  observed: boolean;
  planned: boolean;
}

export interface RenderEnv {
  mode: ChartMode;
  date: Date;
  location: ObserverLocation | null;
  layers: ChartLayers;
  pins: Pin[];
  selected: { ra: number; dec: number } | null;
}

export type HitTarget =
  | { type: "pin"; objectId: string }
  | { type: "dso"; dso: Dso }
  | { type: "star"; index: number };

interface Hit {
  x: number;
  y: number;
  r: number;
  /** Lower wins when several targets are in range. */
  priority: number;
  target: HitTarget;
  label: string;
}

export interface Frame {
  sky: GeoProjection;
  /** Projection for horizon-frame geometry (lon = 180 - az, lat = alt); horizon mode only. */
  local: GeoProjection | null;
  /** Rotation mapping equatorial coordinates into the horizon frame; horizon mode only. */
  toHorizon: ((p: [number, number]) => [number, number]) | null;
  pxPerDeg: number;
  width: number;
  height: number;
  hits: Hit[];
}

export const MIN_FOV = 0.5;
export const MAX_FOV = 220;

export const PIN_COLORS = { observed: "#2ec4b6", planned: "#ff9f1c" };

// ---------- Projection ----------

export function createFrame(
  width: number,
  height: number,
  view: ViewCenter,
  env: Pick<RenderEnv, "mode" | "date" | "location">,
): Frame {
  const minDim = Math.max(1, Math.min(width, height));
  const scale = minDim / 2 / Math.tan((view.fov * RAD) / 4);
  const halfDiag = Math.hypot(width, height) / 2;
  const clip = Math.min(179, 2 * Math.atan(halfDiag / scale) * DEG + 2);

  const base = () =>
    geoStereographic()
      .reflectX(true)
      .scale(scale)
      .translate([width / 2, height / 2])
      .clipAngle(clip)
      .precision(0.7);

  let sky: GeoProjection;
  let local: GeoProjection | null = null;
  let toHorizon: Frame["toHorizon"] = null;

  if (env.mode === "horizon" && env.location) {
    const horizonRot = equatorialToHorizonRotation(lstDeg(env.date, env.location.lon), env.location.lat);
    const viewRot: Rotation = [-azToFrameLon(view.lon), -view.lat, 0];
    sky = base().rotate(composeRotations(viewRot, horizonRot));
    local = base().rotate(viewRot);
    const rot = geoRotation(horizonRot);
    toHorizon = (p) => rot(p) as [number, number];
  } else {
    sky = base().rotate([-view.lon, -view.lat, 0]);
  }

  return { sky, local, toHorizon, pxPerDeg: (scale / 2) * RAD, width, height, hits: [] };
}

/** The view-center coordinates (ra/dec or az/alt) under a screen point. */
export function screenToView(frame: Frame, x: number, y: number): { lon: number; lat: number } | null {
  if (frame.local) {
    const p = frame.local.invert?.([x, y]);
    return p ? { lon: 180 - p[0], lat: p[1] } : null;
  }
  const p = frame.sky.invert?.([x, y]);
  return p ? { lon: p[0], lat: p[1] } : null;
}

// ---------- Star helpers ----------

const unitVectors = new WeakMap<StarTable, Float32Array>();

function starVectors(stars: StarTable): Float32Array {
  let v = unitVectors.get(stars);
  if (!v) {
    v = new Float32Array(stars.count * 3);
    for (let i = 0; i < stars.count; i++) {
      const ra = stars.ra[i] * RAD, dec = stars.dec[i] * RAD;
      v[i * 3] = Math.cos(dec) * Math.cos(ra);
      v[i * 3 + 1] = Math.cos(dec) * Math.sin(ra);
      v[i * 3 + 2] = Math.sin(dec);
    }
    unitVectors.set(stars, v);
  }
  return v;
}

function unit(ra: number, dec: number): [number, number, number] {
  return [Math.cos(dec * RAD) * Math.cos(ra * RAD), Math.cos(dec * RAD) * Math.sin(ra * RAD), Math.sin(dec * RAD)];
}

function starColor(bv: number): string {
  if (bv < -0.1) return "#9bb2ff";
  if (bv < 0.15) return "#c4d3ff";
  if (bv < 0.45) return "#eef0ff";
  if (bv < 0.75) return "#fff3df";
  if (bv < 1.15) return "#ffdcae";
  if (bv < 1.5) return "#ffc58a";
  return "#ffae6e";
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function starLimit(fov: number) {
  return clamp(8 - 0.85 * Math.log2(fov / 10), 5.5, 8.1);
}

function dsoLimit(fov: number) {
  return clamp(14 - 2 * Math.log2(fov / 4), 4, 15);
}

// ---------- DSO symbols ----------

type DsoStyle = { color: string; shape: "galaxy" | "open" | "globular" | "nebula" | "planetary" | "dark" | "other" };

function dsoStyle(type: string): DsoStyle {
  switch (type) {
    case "G":
    case "GPair":
    case "GTrpl":
    case "GGroup":
      return { color: "#ff8a8a", shape: "galaxy" };
    case "OCl":
    case "*Ass":
      return { color: "#ffd866", shape: "open" };
    case "GCl":
      return { color: "#ffb347", shape: "globular" };
    case "PN":
      return { color: "#62d6f5", shape: "planetary" };
    case "HII":
    case "EmN":
    case "Neb":
    case "RfN":
    case "Cl+N":
    case "SNR":
      return { color: "#72e5a5", shape: "nebula" };
    case "DrkN":
      return { color: "#a0a0b0", shape: "dark" };
    default:
      return { color: "#c8c8d0", shape: "other" };
  }
}

/** Screen direction of celestial north and east at a point, for orienting ellipses. */
function screenAngleOfAxis(frame: Frame, ra: number, dec: number, pa: number): number {
  const p0 = frame.sky([ra, dec]);
  const pn = frame.sky([ra, Math.min(89.99, dec + 0.05)]);
  const pe = frame.sky([ra + 0.05 / Math.max(0.05, Math.cos(dec * RAD)), dec]);
  if (!p0 || !pn || !pe) return 0;
  const nx = pn[0] - p0[0], ny = pn[1] - p0[1];
  const ex = pe[0] - p0[0], ey = pe[1] - p0[1];
  const nl = Math.hypot(nx, ny) || 1, el = Math.hypot(ex, ey) || 1;
  const c = Math.cos(pa * RAD), s = Math.sin(pa * RAD);
  return Math.atan2(c * (ny / nl) + s * (ey / el), c * (nx / nl) + s * (ex / el));
}

function drawDsoSymbol(ctx: CanvasRenderingContext2D, frame: Frame, d: Dso, x: number, y: number, r: number) {
  const { color, shape } = dsoStyle(d.type);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([]);
  ctx.beginPath();
  switch (shape) {
    case "galaxy": {
      const ratio = d.minor && d.major ? clamp(d.minor / d.major, 0.2, 1) : 0.5;
      const rot = screenAngleOfAxis(frame, d.ra, d.dec, d.pa ?? 0);
      ctx.ellipse(x, y, r, Math.max(1.5, r * ratio), rot, 0, Math.PI * 2);
      break;
    }
    case "open":
      ctx.setLineDash([2.5, 2.5]);
      ctx.arc(x, y, r, 0, Math.PI * 2);
      break;
    case "globular":
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      break;
    case "planetary":
      ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(x + dx * r * 0.7, y + dy * r * 0.7);
        ctx.lineTo(x + dx * r * 1.3, y + dy * r * 1.3);
      }
      break;
    case "nebula":
      ctx.roundRect(x - r, y - r, r * 2, r * 2, Math.min(4, r / 2));
      break;
    case "dark":
      ctx.setLineDash([2, 2]);
      ctx.rect(x - r, y - r, r * 2, r * 2);
      break;
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

// ---------- Labels ----------

class LabelPlacer {
  private boxes: [number, number, number, number][] = [];
  constructor(private ctx: CanvasRenderingContext2D) {}

  /** Draws the label if it does not overlap an earlier one. */
  place(text: string, x: number, y: number, color: string, font = "11px system-ui, sans-serif") {
    const ctx = this.ctx;
    ctx.font = font;
    const w = ctx.measureText(text).width;
    const h = 12;
    const x0 = ctx.textAlign === "center" ? x - w / 2 : x;
    const box: [number, number, number, number] = [x0, y - h + 2, x0 + w, y + 2];
    for (const b of this.boxes) {
      if (box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]) return false;
    }
    this.boxes.push(box);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    return true;
  }

  reserve(x: number, y: number, r: number) {
    this.boxes.push([x - r, y - r, x + r, y + r]);
  }
}

// ---------- Main draw ----------

function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, pin: Pin, alpha: number) {
  const headY = y - 17;
  const color = pin.observed ? PIN_COLORS.observed : PIN_COLORS.planned;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - 3, y - 6, x - 8, y - 10, x - 8, headY);
  ctx.arc(x, headY, 8, Math.PI, 0);
  ctx.bezierCurveTo(x + 8, y - 10, x + 3, y - 6, x, y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#0b1020";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, headY, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = pin.observed && pin.planned ? PIN_COLORS.planned : "#0b1020";
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function drawSky(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  view: ViewCenter,
  env: RenderEnv,
  catalog: Catalog,
): void {
  const { sky, local, width: w, height: h } = frame;
  const { layers } = env;
  const hits: Hit[] = [];
  const labels = new LabelPlacer(ctx);
  const path = geoPath(sky, ctx);
  const localPath = local ? geoPath(local, ctx) : null;
  const fov = view.fov;
  const horizonMode = Boolean(local);

  // Visibility test: angular distance from the view center.
  const centerEq = sky.invert?.([w / 2, h / 2]) ?? [0, 0];
  const c = unit(centerEq[0], centerEq[1]);
  const cosClip = Math.cos((sky.clipAngle() ?? 90) * RAD);

  // Altitude test (horizon mode): dot product with the zenith vector.
  let zenith: [number, number, number] | null = null;
  if (horizonMode && env.location) {
    zenith = unit(lstDeg(env.date, env.location.lon), env.location.lat);
  }
  const aboveHorizon = (x: number, y: number, z: number) =>
    !zenith || x * zenith[0] + y * zenith[1] + z * zenith[2] > -0.002;

  const onScreen = (p: [number, number] | null, m = 20): p is [number, number] =>
    !!p && p[0] > -m && p[0] < w + m && p[1] > -m && p[1] < h + m;

  // Background
  ctx.fillStyle = horizonMode ? "#08102a" : "#060a17";
  ctx.fillRect(0, 0, w, h);

  // Milky Way
  if (layers.milkyWay) {
    ctx.fillStyle = "rgba(170, 185, 255, 0.045)";
    for (const f of catalog.milkyWay.features) {
      ctx.beginPath();
      path(f);
      ctx.fill();
    }
  }

  // Grid
  if (layers.grid) {
    ctx.strokeStyle = "rgba(120, 150, 220, 0.18)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    if (localPath) {
      localPath(geoGraticule().step([15, 10]).extentMajor([[-180, -80], [180, 80.0001]])());
    } else {
      path(geoGraticule().step([15, 10]).extentMajor([[-180, -80], [180, 80.0001]])());
    }
    ctx.stroke();
    if (!localPath) {
      // Celestial equator, slightly stronger.
      ctx.strokeStyle = "rgba(120, 150, 220, 0.3)";
      ctx.beginPath();
      path(geoCircle().center([0, 90]).radius(90)());
      ctx.stroke();
    }
  }

  // Constellation lines
  if (layers.constellations) {
    ctx.strokeStyle = "rgba(110, 150, 230, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const f of catalog.constellationLines) path(f);
    ctx.stroke();
  }

  // Stars
  const stars = catalog.stars;
  const vec = starVectors(stars);
  const lim = starLimit(fov);
  const zoomBoost = clamp(1 + Math.log2(60 / fov) * 0.08, 0.9, 1.5);
  for (let i = 0; i < stars.count; i++) {
    const mag = stars.mag[i];
    if (mag > lim) break; // sorted by magnitude
    const x = vec[i * 3], y = vec[i * 3 + 1], z = vec[i * 3 + 2];
    if (x * c[0] + y * c[1] + z * c[2] < cosClip) continue;
    if (!aboveHorizon(x, y, z)) continue;
    const p = sky([stars.ra[i], stars.dec[i]]);
    if (!onScreen(p, 5)) continue;
    const r = Math.max(0.55, (0.5 + 0.42 * (lim + 0.6 - mag)) * zoomBoost);
    ctx.globalAlpha = clamp(0.35 + (lim - mag) * 0.35, 0.35, 1);
    ctx.fillStyle = starColor(stars.bv[i]);
    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fill();
    if (mag < lim - 1.5 || fov < 20) {
      hits.push({ x: p[0], y: p[1], r: Math.max(r, 3), priority: 3, target: { type: "star", index: i }, label: "" });
    }
  }
  ctx.globalAlpha = 1;

  // Deep-sky objects
  const drawnDsos: { d: Dso; x: number; y: number; r: number }[] = [];
  if (layers.dsos) {
    const dLim = dsoLimit(fov);
    for (const d of catalog.dsos) {
      const visible = d.messier ? fov < 160 : d.mag != null ? d.mag <= dLim : fov < 3;
      if (!visible) continue;
      const v = unit(d.ra, d.dec);
      if (v[0] * c[0] + v[1] * c[1] + v[2] * c[2] < cosClip) continue;
      if (!aboveHorizon(v[0], v[1], v[2])) continue;
      const p = sky([d.ra, d.dec]);
      if (!onScreen(p, 40)) continue;
      const r = clamp(d.major ? (d.major / 120) * frame.pxPerDeg : 0, 3.5, 400);
      drawDsoSymbol(ctx, frame, d, p[0], p[1], r);
      drawnDsos.push({ d, x: p[0], y: p[1], r });
      hits.push({ x: p[0], y: p[1], r: Math.max(r, 6), priority: 2, target: { type: "dso", dso: d }, label: "" });
    }
  }

  // Ground and horizon
  if (localPath && local) {
    ctx.fillStyle = "rgba(14, 24, 18, 0.92)";
    ctx.beginPath();
    localPath(geoCircle().center([0, -90]).radius(90)());
    ctx.fill();
    ctx.strokeStyle = "rgba(140, 200, 140, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    localPath(geoCircle().center([0, 90]).radius(90)());
    ctx.stroke();

    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const [label, az] of [
      ["N", 0], ["NE", 45], ["E", 90], ["SE", 135], ["S", 180], ["SW", 225], ["W", 270], ["NW", 315],
    ] as const) {
      const lonFrame = azToFrameLon(az);
      // Skip points behind the viewer.
      const p = local([lonFrame, -1.5]);
      const behind = Math.cos((lonFrame - azToFrameLon(view.lon)) * RAD) * Math.cos(view.lat * RAD) < cosClip;
      if (!behind && onScreen(p, 0)) {
        ctx.fillStyle = label.length === 1 ? "#ffcf7a" : "rgba(255, 207, 122, 0.6)";
        ctx.fillText(label, p[0], p[1] + 14);
        labels.reserve(p[0], p[1] + 8, 10);
      }
    }
    ctx.textAlign = "left";
  }

  // Pins (always drawn; faded when below the horizon)
  const pinHits: Hit[] = [];
  for (const pin of env.pins) {
    const v = unit(pin.ra, pin.dec);
    if (v[0] * c[0] + v[1] * c[1] + v[2] * c[2] < cosClip) continue;
    const p = sky([pin.ra, pin.dec]);
    if (!onScreen(p, 30)) continue;
    const alpha = aboveHorizon(v[0], v[1], v[2]) ? 1 : 0.45;
    drawPin(ctx, p[0], p[1], pin, alpha);
    labels.reserve(p[0], p[1] - 17, 10);
    pinHits.push({ x: p[0], y: p[1] - 17, r: 11, priority: 0, target: { type: "pin", objectId: pin.objectId }, label: pin.name });
  }

  // Selection marker
  if (env.selected) {
    const p = sky([env.selected.ra, env.selected.dec]);
    const v = unit(env.selected.ra, env.selected.dec);
    if (v[0] * c[0] + v[1] * c[1] + v[2] * c[2] >= cosClip && onScreen(p, 30)) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      const r = 12;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        ctx.moveTo(p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r);
        ctx.lineTo(p[0] + Math.cos(a) * (r + 6), p[1] + Math.sin(a) * (r + 6));
      }
      ctx.stroke();
    }
  }

  // Labels
  if (layers.labels) {
    // Pin labels first so they win collisions.
    for (const h of pinHits) labels.place(h.label, h.x + 11, h.y + 4, "#ffffff", "600 12px system-ui, sans-serif");

    // Messier and bright DSOs
    if (layers.dsos) {
      const pinned = new Set(env.pins.map((p) => p.objectId));
      for (const { d, x, y, r } of drawnDsos) {
        if (pinned.has(d.id)) continue; // the pin already carries the name
        const show = d.messier || fov < 25 || (d.mag != null && d.mag < 9 && fov < 60);
        if (!show) continue;
        const text = d.common && fov < 15 ? `${d.label} ${d.common}` : d.label;
        labels.place(text, x + r * 0.7 + 3, y - r * 0.7 - 2, dsoStyle(d.type).color);
      }
    }

    // Named stars
    const nameLim = clamp(lim - 3.2, 1.5, 6);
    for (let i = 0; i < stars.count && stars.mag[i] <= nameLim; i++) {
      const names = stars.names.get(stars.hip[i]);
      const text = names?.name || (fov < 30 ? names?.designation : "");
      if (!text) continue;
      const x = vec[i * 3], y = vec[i * 3 + 1], z = vec[i * 3 + 2];
      if (x * c[0] + y * c[1] + z * c[2] < cosClip || !aboveHorizon(x, y, z)) continue;
      const p = sky([stars.ra[i], stars.dec[i]]);
      if (!onScreen(p, 0)) continue;
      labels.place(text, p[0] + 5, p[1] - 4, "rgba(220, 225, 245, 0.8)");
    }

    // Constellation names
    if (layers.constellations && fov > 12) {
      ctx.textAlign = "center";
      for (const cn of catalog.constellationNames) {
        const v = unit(cn.ra, cn.dec);
        if (v[0] * c[0] + v[1] * c[1] + v[2] * c[2] < cosClip || !aboveHorizon(v[0], v[1], v[2])) continue;
        const p = sky([cn.ra, cn.dec]);
        if (!onScreen(p, 0)) continue;
        labels.place(cn.name.toUpperCase(), p[0], p[1], "rgba(130, 165, 240, 0.65)", "10px system-ui, sans-serif");
      }
      ctx.textAlign = "left";
    }
  }

  frame.hits = [...pinHits, ...hits];
}

/** Finds the most relevant target under a screen point. */
export function hitTest(frame: Frame, x: number, y: number): HitTarget | null {
  let best: Hit | null = null;
  let bestScore = Infinity;
  for (const h of frame.hits) {
    const d = Math.hypot(h.x - x, h.y - y);
    if (d > h.r + 5) continue;
    // Pins always win; otherwise prefer the closest target, slightly favouring deep-sky objects.
    const score = h.priority === 0 ? d - 1000 : d + (h.priority - 2) * 3 + h.r * 0.05;
    if (score < bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best?.target ?? null;
}
