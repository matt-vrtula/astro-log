import { formatCatalogName } from "../sky/catalog";
import type { SkyObject } from "../types";

export interface WikiSummary {
  title: string;
  description: string;
  extract: string;
  url: string;
  thumbnail: string | null;
}

// Only accept articles that are actually about an astronomical object.
const ASTRO_RE = /star|galax|nebula|cluster|constellation|remnant|asterism|astronom|quasar|supernova/i;

const cache = new Map<string, Promise<WikiSummary | null>>();

/** Wikipedia article titles to try for an object, most specific first. */
function candidateTitles(obj: SkyObject): string[] {
  if (obj.kind === "star") {
    // Proper names only (e.g. "Vega"); "(star)" disambiguates names like Castor or Sadr.
    return /^[A-Z][a-z]/.test(obj.name) ? [obj.name, `${obj.name} (star)`] : [];
  }
  const titles: string[] = [];
  const messier = /^M(\d+)$/.exec(obj.name);
  if (messier) titles.push(`Messier ${messier[1]}`);
  titles.push(formatCatalogName(obj.id));
  // Common name, e.g. "Horsehead Nebula" for objects outside NGC/IC.
  const common = obj.aliases.find((a) => !/^(NGC|IC|M)\s?\d/.test(a));
  if (common) titles.push(common);
  return [...new Set(titles)];
}

async function fetchSummary(title: string, signal?: AbortSignal): Promise<WikiSummary | null> {
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}?redirect=true`,
    { signal },
  );
  if (!res.ok) return null;
  const j = await res.json();
  if (j.type !== "standard" || !ASTRO_RE.test(`${j.description ?? ""} ${j.extract ?? ""}`)) return null;
  return {
    title: j.title,
    description: j.description ?? "",
    extract: j.extract ?? "",
    url: j.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(j.title)}`,
    thumbnail: j.thumbnail?.source ?? null,
  };
}

/** Wikipedia summary for an object, or null if there is no suitable article. Cached per session. */
export function getWikiSummary(obj: SkyObject): Promise<WikiSummary | null> {
  let p = cache.get(obj.id);
  if (!p) {
    p = (async () => {
      for (const title of candidateTitles(obj)) {
        const summary = await fetchSummary(title).catch(() => null);
        if (summary) return summary;
      }
      return null;
    })();
    // Don't cache failures caused by being offline; retry next time.
    p.then((r) => r === null && !navigator.onLine && cache.delete(obj.id));
    cache.set(obj.id, p);
  }
  return p;
}

export const simbadUrl = (obj: SkyObject) =>
  `https://simbad.cds.unistra.fr/simbad/sim-id?Ident=${encodeURIComponent(
    obj.kind === "dso" ? formatCatalogName(obj.id) : obj.id,
  )}`;

