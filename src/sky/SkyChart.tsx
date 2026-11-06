import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type { ChartLayers, ChartMode, ObserverLocation, SkyObject } from "../types";
import { lstDeg, raDecToAltAz } from "./astro";
import type { Catalog } from "./catalog";
import {
  createFrame,
  drawSky,
  hitTest,
  MAX_FOV,
  MIN_FOV,
  screenToView,
  type Frame,
  type HitTarget,
  type Pin,
  type ViewCenter,
} from "./renderer";

export interface SkyChartHandle {
  /** Centers the chart on a sky position, optionally changing the field of view. */
  centerOn(ra: number, dec: number, fov?: number): void;
  zoomBy(factor: number): void;
}

interface Props {
  catalog: Catalog;
  mode: ChartMode;
  date: Date;
  location: ObserverLocation | null;
  layers: ChartLayers;
  pins: Pin[];
  selected: SkyObject | null;
  onSelect(target: HitTarget): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrap360 = (d: number) => ((d % 360) + 360) % 360;
/** Shortest signed difference a - b in degrees. */
const angleDiff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

export const SkyChart = forwardRef<SkyChartHandle, Props>(function SkyChart(
  { catalog, mode, date, location, layers, pins, selected, onSelect },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Separate view per mode so switching back and forth keeps each position.
  const views = useRef<Record<ChartMode, ViewCenter>>({
    atlas: { lon: 0, lat: 30, fov: 100 },
    horizon: { lon: 180, lat: 30, fov: 120 },
  });
  const initializedAtlas = useRef(false);
  const frameRef = useRef<Frame | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const rafRef = useRef(0);
  const animRef = useRef(0);

  // Latest props, read by the render loop and event handlers.
  const props = useRef({ catalog, mode, date, location, layers, pins, selected, onSelect });
  props.current = { catalog, mode, date, location, layers, pins, selected, onSelect };

  const effectiveMode: ChartMode = mode === "horizon" && location ? "horizon" : "atlas";
  const modeRef = useRef(effectiveMode);
  modeRef.current = effectiveMode;

  // Start the atlas at the observer's zenith when the location is known.
  if (!initializedAtlas.current && location) {
    views.current.atlas = { lon: lstDeg(new Date(), location.lon), lat: location.lat, fov: 100 };
    initializedAtlas.current = true;
  }

  const render = useCallback(() => {
    rafRef.current = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const { w, h } = sizeRef.current;
    if (!canvas || !ctx || !w || !h) return;
    const p = props.current;
    const view = views.current[modeRef.current];
    const env = {
      mode: modeRef.current,
      date: p.date,
      location: p.location,
      layers: p.layers,
      pins: p.pins,
      selected: p.selected,
    };
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const frame = createFrame(w, h, view, env);
    drawSky(ctx, frame, view, env, p.catalog);
    frameRef.current = frame;
  }, []);

  const requestRender = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(render);
  }, [render]);

  useEffect(requestRender, [requestRender, catalog, effectiveMode, date, location, layers, pins, selected]);

  // ---- Resize ----
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: width, h: height };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      render();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [render]);

  // ---- View manipulation ----

  const setView = useCallback(
    (next: Partial<ViewCenter>) => {
      const m = modeRef.current;
      const v = { ...views.current[m], ...next };
      v.fov = clamp(v.fov, MIN_FOV, MAX_FOV);
      v.lat = clamp(v.lat, -90, 90);
      v.lon = wrap360(v.lon);
      views.current[m] = v;
      requestRender();
    },
    [requestRender],
  );

  const pan = useCallback(
    (dx: number, dy: number) => {
      const frame = frameRef.current;
      if (!frame) return;
      const v = views.current[modeRef.current];
      const k = 1 / frame.pxPerDeg;
      const cosLat = Math.max(0.15, Math.cos((v.lat * Math.PI) / 180));
      // Atlas: dragging right reveals higher RA (east is left). Horizon: lower azimuth.
      const dLon = ((modeRef.current === "atlas" ? 1 : -1) * dx * k) / cosLat;
      setView({ lon: v.lon + dLon, lat: v.lat + dy * k });
    },
    [setView],
  );

  /** Zooms keeping the sky point under (x, y) fixed. */
  const zoomAt = useCallback(
    (factor: number, x?: number, y?: number) => {
      const m = modeRef.current;
      const v = views.current[m];
      const { w, h } = sizeRef.current;
      const px = x ?? w / 2, py = y ?? h / 2;
      const p = props.current;
      const env = { mode: m, date: p.date, location: p.location };
      const before = screenToView(createFrame(w, h, v, env), px, py);
      const fov = clamp(v.fov * factor, MIN_FOV, MAX_FOV);
      const after = screenToView(createFrame(w, h, { ...v, fov }, env), px, py);
      if (before && after) {
        setView({ fov, lon: v.lon + angleDiff(before.lon, after.lon), lat: v.lat + (before.lat - after.lat) });
      } else {
        setView({ fov });
      }
    },
    [setView],
  );

  useImperativeHandle(
    ref,
    () => ({
      centerOn(ra, dec, fov) {
        const m = modeRef.current;
        const loc = props.current.location;
        let target = { lon: ra, lat: dec };
        if (m === "horizon" && loc) {
          const { alt, az } = raDecToAltAz(ra, dec, lstDeg(props.current.date, loc.lon), loc.lat);
          target = { lon: az, lat: alt };
        }
        const start = { ...views.current[m] };
        const endFov = fov ?? start.fov;
        const dLon = angleDiff(target.lon, start.lon);
        const t0 = performance.now();
        cancelAnimationFrame(animRef.current);
        const step = (t: number) => {
          const u = Math.min(1, (t - t0) / 450);
          const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
          setView({
            lon: start.lon + dLon * e,
            lat: start.lat + (target.lat - start.lat) * e,
            fov: Math.exp(Math.log(start.fov) + (Math.log(endFov) - Math.log(start.fov)) * e),
          });
          if (u < 1) animRef.current = requestAnimationFrame(step);
        };
        animRef.current = requestAnimationFrame(step);
      },
      zoomBy(factor) {
        zoomAt(factor);
      },
    }),
    [setView, zoomAt],
  );

  // ---- Pointer interaction ----

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinchDist = 0;

    const local = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const updateHover = (x: number, y: number) => {
      const frame = frameRef.current;
      const tooltip = tooltipRef.current;
      if (!frame || !tooltip) return;
      const target = hitTest(frame, x, y);
      canvas.style.cursor = target ? "pointer" : "grab";
      if (!target) {
        tooltip.hidden = true;
        return;
      }
      const cat = props.current.catalog;
      const name =
        target.type === "pin"
          ? props.current.pins.find((p) => p.objectId === target.objectId)?.name ?? ""
          : target.type === "dso"
            ? cat.dsoToObject(target.dso).name +
              (target.dso.common ? ` · ${target.dso.common}` : "")
            : cat.starToObject(target.index).name;
      tooltip.textContent = name;
      tooltip.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
      tooltip.hidden = !name;
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      moved = 0;
      cancelAnimationFrame(animRef.current);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };

    const onMove = (e: PointerEvent) => {
      const pos = local(e);
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === "mouse") updateHover(pos.x, pos.y);
        return;
      }
      pointers.set(e.pointerId, pos);
      if (pointers.size === 1) {
        const dx = pos.x - prev.x, dy = pos.y - prev.y;
        moved += Math.abs(dx) + Math.abs(dy);
        canvas.style.cursor = "grabbing";
        if (tooltipRef.current) tooltipRef.current.hidden = true;
        pan(dx, dy);
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0 && dist > 0) zoomAt(pinchDist / dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinchDist = dist;
        moved += 10;
      }
    };

    const onUp = (e: PointerEvent) => {
      const pos = local(e);
      const wasSingle = pointers.size === 1;
      pointers.delete(e.pointerId);
      if (wasSingle && moved < 6 && frameRef.current) {
        const target = hitTest(frameRef.current, pos.x, pos.y);
        if (target) props.current.onSelect(target);
      }
      canvas.style.cursor = "grab";
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = local(e);
      const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      zoomAt(Math.exp(clamp(delta, -200, 200) * 0.0015), x, y);
    };

    const onLeave = () => {
      if (tooltipRef.current) tooltipRef.current.hidden = true;
    };

    const onKey = (e: KeyboardEvent) => {
      const step = 40;
      const actions: Record<string, () => void> = {
        ArrowLeft: () => pan(step, 0),
        ArrowRight: () => pan(-step, 0),
        ArrowUp: () => pan(0, step),
        ArrowDown: () => pan(0, -step),
        "+": () => zoomAt(0.8),
        "=": () => zoomAt(0.8),
        "-": () => zoomAt(1.25),
      };
      const action = actions[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKey);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKey);
    };
  }, [pan, zoomAt]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(animRef.current);
    },
    [],
  );

  return (
    <div ref={containerRef} className="sky-chart">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label="Interactive sky chart. Drag to pan, scroll to zoom, click an object to select it."
      />
      <div ref={tooltipRef} className="sky-tooltip" hidden />
    </div>
  );
});
