export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const dateTimeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export const formatDateTime = (d: Date) => dateTimeFmt.format(d);

/** Value for <input type="datetime-local"> in the browser's time zone. */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses a datetime-local value as local time. Returns null when empty/invalid. */
export function parseLocalInputValue(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatPlanDate(month: number | null, year: number | null): string {
  if (month && year) return `${MONTHS[month - 1].slice(0, 3)} ${year}`;
  if (month) return MONTHS[month - 1];
  if (year) return String(year);
  return "Any time";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const formatMm = (mm: number) => `${Number.isInteger(mm) ? mm : mm.toFixed(1)} mm`;

/** Focal ratio, e.g. 5 for a 200 mm f/5 telescope. Null unless both values are known. */
export function focalRatio(apertureMm: number | null, focalLengthMm: number | null): number | null {
  return apertureMm && focalLengthMm ? focalLengthMm / apertureMm : null;
}

/** Short spec line, e.g. "200 mm · f/5 · FL 1000 mm". Empty when nothing is known. */
export function formatEquipmentSpecs(e: { apertureMm: number | null; focalLengthMm: number | null }): string {
  const ratio = focalRatio(e.apertureMm, e.focalLengthMm);
  return [
    e.apertureMm ? formatMm(e.apertureMm) : null,
    ratio ? `f/${ratio.toFixed(1).replace(/\.0$/, "")}` : null,
    e.focalLengthMm ? `FL ${formatMm(e.focalLengthMm)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Parses an optional length in millimetres (accepts a decimal comma).
 * Returns null for empty input, undefined when invalid.
 */
export function parseMillimetres(s: string): number | null | undefined {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n <= 100_000 ? n : undefined;
}

export function formatLocation(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
}
