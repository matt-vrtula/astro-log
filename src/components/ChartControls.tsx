import { useEffect, useRef, useState } from "react";
import { formatLocation, parseLocalInputValue, toLocalInputValue } from "../format";
import { PIN_COLORS } from "../sky/renderer";
import type { ChartLayers, ChartMode, ObserverLocation } from "../types";
import { ClockIcon, LayersIcon, LocationIcon, MinusIcon, PlusIcon } from "./Icons";

interface Props {
  mode: ChartMode;
  onModeChange(mode: ChartMode): void;
  date: Date;
  live: boolean;
  onDateChange(date: Date): void;
  onLive(): void;
  location: ObserverLocation | null;
  onEditLocation(): void;
  layers: ChartLayers;
  onLayersChange(layers: ChartLayers): void;
  onZoom(factor: number): void;
}

const LAYER_LABELS: Record<keyof ChartLayers, string> = {
  constellations: "Constellations",
  dsos: "Deep-sky objects",
  labels: "Labels",
  grid: "Grid",
  milkyWay: "Milky Way",
};

export function ChartControls(props: Props) {
  const { mode, onModeChange, date, live, onDateChange, onLive, location, onEditLocation, layers, onLayersChange, onZoom } =
    props;
  const [layersOpen, setLayersOpen] = useState(false);
  const layersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!layersOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!layersRef.current?.contains(e.target as Node)) setLayersOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [layersOpen]);

  return (
    <>
      <div className="chart-controls">
        <div className="segmented" role="group" aria-label="Chart mode">
          <button type="button" aria-pressed={mode === "atlas"} onClick={() => onModeChange("atlas")}>
            Atlas
          </button>
          <button type="button" aria-pressed={mode === "horizon"} onClick={() => onModeChange("horizon")}>
            My sky
          </button>
        </div>

        {mode === "horizon" && (
          <>
            <button type="button" className="control-btn" onClick={onEditLocation} title="Observing location">
              <LocationIcon size={16} />
              <span>{location ? formatLocation(location.lat, location.lon) : "Set location"}</span>
            </button>
            <div className="time-control">
              <ClockIcon size={16} />
              <input
                type="datetime-local"
                aria-label="Chart time"
                value={toLocalInputValue(date)}
                onChange={(e) => {
                  const d = parseLocalInputValue(e.target.value);
                  if (d) onDateChange(d);
                }}
              />
              <button type="button" className="link-btn" onClick={onLive} disabled={live}>
                {live ? "Live" : "Now"}
              </button>
            </div>
          </>
        )}

        <div className="layers" ref={layersRef}>
          <button
            type="button"
            className="control-btn icon-only"
            aria-label="Chart layers"
            aria-expanded={layersOpen}
            onClick={() => setLayersOpen((o) => !o)}
          >
            <LayersIcon size={16} />
          </button>
          {layersOpen && (
            <div className="layers-popover">
              {(Object.keys(LAYER_LABELS) as (keyof ChartLayers)[]).map((key) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={(e) => onLayersChange({ ...layers, [key]: e.target.checked })}
                  />
                  {LAYER_LABELS[key]}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="chart-side-controls">
        <div className="zoom-controls">
          <button type="button" className="control-btn icon-only" aria-label="Zoom in" onClick={() => onZoom(0.7)}>
            <PlusIcon size={16} />
          </button>
          <button type="button" className="control-btn icon-only" aria-label="Zoom out" onClick={() => onZoom(1.4)}>
            <MinusIcon size={16} />
          </button>
        </div>
        <div className="legend">
          <span>
            <i style={{ background: PIN_COLORS.observed }} /> Observed
          </span>
          <span>
            <i style={{ background: PIN_COLORS.planned }} /> Planned
          </span>
        </div>
      </div>
    </>
  );
}
