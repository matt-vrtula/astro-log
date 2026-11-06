import { useEffect, useState } from "react";
import { getWikiSummary, simbadUrl, type WikiSummary } from "../data/objectInfo";
import type { SkyObject } from "../types";
import { ExternalIcon } from "./Icons";

/** Wikipedia summary and reference links. Render with key={object.id} so state resets per object. */
export function ObjectInfo({ object }: { object: SkyObject }) {
  const [summary, setSummary] = useState<WikiSummary | null | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getWikiSummary(object).then((s) => !cancelled && setSummary(s));
    return () => {
      cancelled = true;
    };
  }, [object]);

  return (
    <section className="panel-section object-info">
      {summary === undefined && <p className="muted small">Looking up {object.name}…</p>}
      {summary && (
        <div className="wiki">
          {summary.description && <div className="wiki-description">{summary.description}</div>}
          <p className={`wiki-extract${expanded ? " expanded" : ""}`}>{summary.extract}</p>
          {summary.extract.length > 220 && (
            <button type="button" className="link-btn small" onClick={() => setExpanded((e) => !e)}>
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      <div className="info-links small">
        {summary && (
          <a href={summary.url} target="_blank" rel="noreferrer" className="link-btn">
            <ExternalIcon size={13} /> Wikipedia
          </a>
        )}
        <a href={simbadUrl(object)} target="_blank" rel="noreferrer" className="link-btn">
          <ExternalIcon size={13} /> SIMBAD
        </a>
      </div>
    </section>
  );
}
