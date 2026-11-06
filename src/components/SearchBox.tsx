import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Catalog } from "../sky/catalog";
import type { SkyObject } from "../types";
import { SearchIcon } from "./Icons";

interface Props {
  catalog: Catalog | null;
  onPick(object: SkyObject): void;
}

export function SearchBox({ catalog, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => (catalog && query.trim() ? catalog.search(query, 8) : []), [catalog, query]);

  useEffect(() => setActive(0), [results]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function pick(obj: SkyObject) {
    onPick(obj);
    setQuery("");
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && results.length > 0;

  return (
    <div className="search" ref={rootRef}>
      <SearchIcon className="search-icon" size={16} />
      <input
        type="search"
        placeholder={catalog ? "Search M31, NGC 7000, Vega…" : "Loading catalog…"}
        disabled={!catalog}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search objects"
      />
      {showList && (
        <ul className="search-results" id={listId} role="listbox">
          {results.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : undefined}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
            >
              <span className="search-name">{r.name}</span>
              <span className="search-meta">
                {[r.aliases[0], r.typeLabel].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
