const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export const normalizeDeg = (d: number) => ((d % 360) + 360) % 360;

export function julianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Greenwich mean sidereal time in degrees. */
export function gmstDeg(date: Date): number {
  const d = julianDate(date) - 2451545.0;
  return normalizeDeg(280.46061837 + 360.98564736629 * d);
}

/** Local sidereal time in degrees (longitude east-positive). */
export function lstDeg(date: Date, lonDeg: number): number {
  return normalizeDeg(gmstDeg(date) + lonDeg);
}

/** Equatorial (deg) to horizontal coordinates. Azimuth is measured from north through east. */
export function raDecToAltAz(ra: number, dec: number, lst: number, lat: number) {
  const ha = (lst - ra) * RAD;
  const d = dec * RAD;
  const p = lat * RAD;
  const sinAlt = Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const az = Math.atan2(
    -Math.cos(d) * Math.sin(ha),
    Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(ha),
  );
  return { alt: alt * DEG, az: normalizeDeg(az * DEG) };
}

/** Angular distance between two points in degrees. */
export function angularDistance(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const c =
    Math.sin(dec1 * RAD) * Math.sin(dec2 * RAD) +
    Math.cos(dec1 * RAD) * Math.cos(dec2 * RAD) * Math.cos((ra1 - ra2) * RAD);
  return Math.acos(Math.max(-1, Math.min(1, c))) * DEG;
}

// ---------- Rotations (unit quaternions, compatible with d3-geo's rotate) ----------

export type Rotation = [number, number, number];
type Versor = [number, number, number, number];

function versor([l, p, g]: Rotation): Versor {
  const hl = (l * RAD) / 2, hp = (p * RAD) / 2, hg = (g * RAD) / 2;
  const sl = Math.sin(hl), cl = Math.cos(hl);
  const sp = Math.sin(hp), cp = Math.cos(hp);
  const sg = Math.sin(hg), cg = Math.cos(hg);
  return [
    cl * cp * cg + sl * sp * sg,
    sl * cp * cg - cl * sp * sg,
    cl * sp * cg + sl * cp * sg,
    cl * cp * sg - sl * sp * cg,
  ];
}

function versorToRotation(q: Versor): Rotation {
  return [
    Math.atan2(2 * (q[0] * q[1] + q[2] * q[3]), 1 - 2 * (q[1] * q[1] + q[2] * q[2])) * DEG,
    Math.asin(Math.max(-1, Math.min(1, 2 * (q[0] * q[2] - q[3] * q[1])))) * DEG,
    Math.atan2(2 * (q[0] * q[3] + q[1] * q[2]), 1 - 2 * (q[2] * q[2] + q[3] * q[3])) * DEG,
  ];
}

function multiply(a: Versor, b: Versor): Versor {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

/** Rotation equivalent to applying `first`, then `second`. */
export function composeRotations(second: Rotation, first: Rotation): Rotation {
  return versorToRotation(multiply(versor(second), versor(first)));
}

/**
 * Rotation that maps equatorial coordinates (lon = RA, lat = Dec) into the local
 * horizontal frame, where lat = altitude and lon = 180 - azimuth.
 */
export function equatorialToHorizonRotation(lst: number, lat: number): Rotation {
  return [-lst, 90 - lat, 0];
}

export const azToFrameLon = (az: number) => 180 - az;

// ---------- Formatting ----------

export function formatRA(deg: number): string {
  const totalSec = Math.round((normalizeDeg(deg) / 15) * 3600);
  const h = Math.floor(totalSec / 3600) % 24;
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

export function formatDec(deg: number): string {
  const sign = deg < 0 ? "−" : "+";
  const totalSec = Math.round(Math.abs(deg) * 3600);
  const d = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${sign}${d}° ${String(m).padStart(2, "0")}′ ${String(s).padStart(2, "0")}″`;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const compassPoint = (az: number) => COMPASS[Math.round(normalizeDeg(az) / 45) % 8];
