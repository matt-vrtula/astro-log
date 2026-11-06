import type { User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartControls } from "./components/ChartControls";
import { ListIcon } from "./components/Icons";
import { Lightbox } from "./components/Lightbox";
import { LocationDialog } from "./components/LocationDialog";
import { ObjectPanel, type PanelIntent } from "./components/ObjectPanel";
import { PlanSidebar } from "./components/PlanSidebar";
import { SearchBox } from "./components/SearchBox";
import { UserMenu } from "./components/UserMenu";
import { saveUserLocation, sortPlans, useObservations, usePlans, useUserLocation } from "./data/store";
import { usePersistentState } from "./usePersistentState";
import { loadCatalog, type Catalog } from "./sky/catalog";
import type { HitTarget, Pin } from "./sky/renderer";
import { SkyChart, type SkyChartHandle } from "./sky/SkyChart";
import type { ChartLayers, ChartMode, Photo, Plan, SkyObject, TargetRef } from "./types";

const DEFAULT_LAYERS: ChartLayers = { constellations: true, grid: false, milkyWay: true, labels: true, dsos: true };

/** Fallback for an observation/plan whose object is not in the catalog. */
function targetToObject(t: TargetRef): SkyObject {
  return { id: t.objectId, kind: "dso", name: t.objectName, aliases: [], typeLabel: "Object", ra: t.ra, dec: t.dec, mag: null };
}

/** Zoom level used when jumping to an object; 4× wider field than a close-up, so the surroundings stay visible. */
const FOCUS_FOV_FACTOR = 4;

/** A sensible field of view for looking at an object. */
function fovFor(obj: SkyObject): number {
  const closeUp = obj.size?.major
    ? Math.min(40, Math.max(1.5, (obj.size.major / 60) * 5))
    : obj.kind === "star"
      ? 25
      : 6;
  return closeUp * FOCUS_FOV_FACTOR;
}

export function App({ user }: { user: User }) {
  const uid = user.uid;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const observations = useObservations(uid);
  const plans = usePlans(uid);
  const { location } = useUserLocation(uid);

  const [selected, setSelected] = useState<SkyObject | null>(null);
  const [panelIntent, setPanelIntent] = useState<PanelIntent>(null);
  const [planOpen, setPlanOpen] = usePersistentState("astrolog.planOpen", true);
  const [mode, setMode] = usePersistentState<ChartMode>("astrolog.mode", "atlas");
  const [layers, setLayers] = usePersistentState<ChartLayers>("astrolog.layers", DEFAULT_LAYERS);
  const [live, setLive] = useState(true);
  const [date, setDate] = useState(() => new Date());
  const [locationOpen, setLocationOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ photos: Photo[]; index: number } | null>(null);
  const chartRef = useRef<SkyChartHandle>(null);

  useEffect(() => {
    loadCatalog().then(setCatalog, (err: Error) => setCatalogError(err.message));
  }, []);

  // Keep the chart time current while in live mode.
  useEffect(() => {
    if (!live) return;
    setDate(new Date());
    const t = setInterval(() => setDate(new Date()), 30_000);
    return () => clearInterval(t);
  }, [live]);

  const sortedPlans = useMemo(() => sortPlans(plans.data), [plans.data]);

  const pins = useMemo<Pin[]>(() => {
    const byObject = new Map<string, Pin>();
    const add = (t: TargetRef, key: "observed" | "planned") => {
      const pin = byObject.get(t.objectId) ?? {
        objectId: t.objectId,
        name: t.objectName,
        ra: t.ra,
        dec: t.dec,
        observed: false,
        planned: false,
      };
      pin[key] = true;
      byObject.set(t.objectId, pin);
    };
    observations.data.forEach((o) => add(o, "observed"));
    plans.data.forEach((p) => add(p, "planned"));
    return [...byObject.values()];
  }, [observations.data, plans.data]);

  const resolve = useCallback(
    (objectId: string): SkyObject | null => {
      const fromCatalog = catalog?.findById(objectId);
      if (fromCatalog) return fromCatalog;
      const ref = observations.data.find((o) => o.objectId === objectId) ?? plans.data.find((p) => p.objectId === objectId);
      return ref ? targetToObject(ref) : null;
    },
    [catalog, observations.data, plans.data],
  );

  const onChartSelect = useCallback(
    (t: HitTarget) => {
      if (!catalog) return;
      const obj =
        t.type === "pin" ? resolve(t.objectId) : t.type === "dso" ? catalog.dsoToObject(t.dso) : catalog.starToObject(t.index);
      if (obj) setSelected(obj);
    },
    [catalog, resolve],
  );

  const focusObject = useCallback((obj: SkyObject) => {
    setSelected(obj);
    chartRef.current?.centerOn(obj.ra, obj.dec, fovFor(obj));
  }, []);

  function changeMode(next: ChartMode) {
    setMode(next);
    if (next === "horizon" && !location) setLocationOpen(true);
  }

  function selectPlan(plan: Plan) {
    const obj = resolve(plan.objectId);
    if (obj) focusObject(obj);
  }

  function editPlan(plan: Plan) {
    selectPlan(plan);
    setPanelIntent({ type: "editPlan", planId: plan.id, nonce: Date.now() });
  }

  const selectedObservations = useMemo(
    () =>
      selected
        ? observations.data
            .filter((o) => o.objectId === selected.id)
            .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
        : [],
    [observations.data, selected],
  );
  const selectedPlans = useMemo(
    () => (selected ? sortedPlans.filter((p) => p.objectId === selected.id) : []),
    [sortedPlans, selected],
  );

  const dataError = observations.error ?? plans.error;

  return (
    <div className="app">
      <header className="app-header">
        <h1>AstroLog</h1>
        <SearchBox catalog={catalog} onPick={focusObject} />
        <div className="header-actions">
          <button
            type="button"
            className={`btn btn-ghost plan-toggle${planOpen ? " active" : ""}`}
            aria-pressed={planOpen}
            onClick={() => setPlanOpen(!planOpen)}
          >
            <ListIcon size={16} />
            <span className="hide-narrow">Plan</span>
            {plans.data.length > 0 && <span className="count">{plans.data.length}</span>}
          </button>
          <UserMenu user={user} />
        </div>
      </header>

      {dataError && (
        <div className="banner error" role="alert">
          Could not load your data: {dataError.message}
        </div>
      )}

      <div className="workspace">
        {planOpen && (
          <PlanSidebar
            uid={uid}
            plans={sortedPlans}
            loading={plans.loading}
            selectedObjectId={selected?.id ?? null}
            onSelect={selectPlan}
            onEdit={editPlan}
            onClose={() => setPlanOpen(false)}
          />
        )}

        <main className="chart-area">
          {catalog ? (
            <>
              <SkyChart
                ref={chartRef}
                catalog={catalog}
                mode={mode}
                date={date}
                location={location}
                layers={layers}
                pins={pins}
                selected={selected}
                onSelect={onChartSelect}
              />
              <ChartControls
                mode={mode}
                onModeChange={changeMode}
                date={date}
                live={live}
                onDateChange={(d) => {
                  setLive(false);
                  setDate(d);
                }}
                onLive={() => setLive(true)}
                location={location}
                onEditLocation={() => setLocationOpen(true)}
                layers={layers}
                onLayersChange={setLayers}
                onZoom={(f) => chartRef.current?.zoomBy(f)}
              />
            </>
          ) : (
            <div className="chart-loading">{catalogError ? `Could not load the star catalog: ${catalogError}` : "Loading sky…"}</div>
          )}
        </main>

        {selected && (
          <ObjectPanel
            uid={uid}
            object={selected}
            observations={selectedObservations}
            plans={selectedPlans}
            location={location}
            date={date}
            intent={panelIntent}
            onClose={() => setSelected(null)}
            onOpenPhoto={(photos, index) => setLightbox({ photos, index })}
          />
        )}
      </div>

      {locationOpen && (
        <LocationDialog
          initial={location}
          onSave={(loc) => saveUserLocation(uid, loc)}
          onClose={() => setLocationOpen(false)}
        />
      )}
      {lightbox && <Lightbox photos={lightbox.photos} index={lightbox.index} onClose={() => setLightbox(null)} />}
    </div>
  );
}
