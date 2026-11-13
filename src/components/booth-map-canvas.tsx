"use client";

/**
 * The booth map itself: MapLibre GL over OpenFreeMap's free vector tiles (no
 * API key, no usage limits), recoloured to the site palette. Loaded lazily
 * by BoothExplorer, so pages only download MapLibre when the map scrolls
 * near the screen.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import {
  type ExpressionSpecification,
  type GeoJSONSource,
  type LayerSpecification,
  type MapGeoJSONFeature,
  Map as MapLibre,
  type Map as MapLibreMap,
  NavigationControl,
  type StyleSpecification,
  setWorkerUrl,
} from "maplibre-gl";
import { useEffect, useEffectEvent, useRef } from "react";
import { partyStyle } from "@/lib/parties";

// MapLibre finds its worker next to its own module, which bundling breaks.
setWorkerUrl(
  new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href,
);

export type BoothPoint = {
  id: number;
  lon: number;
  lat: number;
  votes: number;
  /** Party colour to use (null = independent). */
  pNo: number | null;
  /** 0–1: how much of the party colour to mix in (1 = all of it). */
  shade: number;
};

/** A hovered place, the pointer within the map, and the map's size. */
export type BoothHover = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

type Palette = (typeof PALETTES)["light"];

/**
 * Basemap colours, tuned to globals.css: lilac paper and indigo ink, quiet
 * enough that the party colours on top carry the data.
 */
const PALETTES = {
  light: {
    land: "#f3f2ff",
    park: "#e9e8fa",
    water: "#d3d0f0",
    residential: "#eeedfc",
    building: "#e5e3f7",
    road: "#ffffff",
    casing: "#dddaf2",
    rail: "#d6d3ee",
    boundary: "#b8b5da",
    label: "#6b6990",
    labelStrong: "#2b2a50",
    waterLabel: "#6d6aa8",
    halo: "#f3f2ff",
    // Overlays
    mask: "#ffffff",
    maskOpacity: 0.6,
    outline: "#1b1a3a",
    outlineHalo: "#ffffff",
    dotStroke: "#1b1a3a",
  },
  dark: {
    land: "#1b1a48",
    park: "#1f1e50",
    water: "#0f0e2e",
    residential: "#1e1d4c",
    building: "#26255c",
    road: "#33327a",
    casing: "#26255c",
    rail: "#2e2d6c",
    boundary: "#4a47a0",
    label: "#8f8dc0",
    labelStrong: "#e4e3ff",
    waterLabel: "#7a77c2",
    halo: "#14133a",
    mask: "#0b0a26",
    maskOpacity: 0.55,
    outline: "#f1f0ff",
    outlineHalo: "#14133a",
    dotStroke: "#0b0a26",
  },
};

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
/** Layers of Positron we don't need in New Zealand (US highway shields). */
const DROP = /shield/;

/** Paint overrides that put a Positron layer in our palette. */
function basePaint(
  layer: LayerSpecification,
  p: Palette,
): Record<string, string> {
  const { id, type } = layer;
  if (type === "background") return { "background-color": p.land };
  if (type === "symbol") {
    const strong = /^label_(city|town|village|state)/.test(id);
    return {
      "text-color": id.startsWith("water")
        ? p.waterLabel
        : strong
          ? p.labelStrong
          : p.label,
      "text-halo-color": p.halo,
    };
  }
  if (type === "fill") {
    if (id === "water") return { "fill-color": p.water };
    if (id === "park" || id === "landcover_wood")
      return { "fill-color": p.park };
    if (id === "landuse_residential") return { "fill-color": p.residential };
    if (id === "building")
      return { "fill-color": p.building, "fill-outline-color": p.casing };
    if (id === "aeroway-area") return { "fill-color": p.road };
    return { "fill-color": p.land };
  }
  if (type === "line") {
    if (id === "waterway") return { "line-color": p.water };
    if (id.startsWith("boundary")) return { "line-color": p.boundary };
    if (id.includes("dashline") || id === "road_pier")
      return { "line-color": p.land };
    if (id.startsWith("railway")) return { "line-color": p.rail };
    if (id.includes("casing")) return { "line-color": p.casing };
    return { "line-color": p.road };
  }
  return {};
}

let baseStyle: Promise<StyleSpecification> | undefined;
/** Positron, fetched once per page load and shared by every map. */
function loadBaseStyle() {
  baseStyle ??= fetch(STYLE_URL).then((r) => {
    if (!r.ok) throw new Error(`Basemap style: HTTP ${r.status}`);
    return r.json() as Promise<StyleSpecification>;
  });
  baseStyle.catch(() => {
    baseStyle = undefined;
  });
  return baseStyle;
}

function themedStyle(base: StyleSpecification, p: Palette): StyleSpecification {
  return {
    ...base,
    layers: base.layers
      .filter((l) => !DROP.test(l.id))
      .map(
        (l) =>
          ({
            ...l,
            paint: { ...("paint" in l ? l.paint : {}), ...basePaint(l, p) },
          }) as LayerSpecification,
      ),
  };
}

/** Our layers on top of the basemap (the rest are Positron's). */
const OVERLAYS = [
  "mask",
  "outline-halo",
  "outline",
  "booths",
  "booth-selected",
];

type PaintProperty = Parameters<MapLibreMap["setPaintProperty"]>[1];

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

/**
 * Dot colours: a party colour from globals.css (so dark-mode aware), mixed
 * with the card colour by `shade`. MapLibre can't read CSS variables itself.
 */
function dotColors() {
  const css = getComputedStyle(document.documentElement);
  const card = parseHex(css.getPropertyValue("--card").trim() || "#ffffff");
  return (pNo: number | null, shade: number) => {
    const color = parseHex(
      css.getPropertyValue(`--party-${pNo ?? 0}`).trim() ||
        partyStyle(pNo).color,
    );
    return toHex(color.map((c, i) => card[i] + (c - card[i]) * shade));
  };
}

function parseHex(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) || 0);
}
const toHex = (rgb: number[]) =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

function pointsData(points: BoothPoint[]): GeoJSON.FeatureCollection {
  const max = Math.max(1, ...points.map((p) => p.votes));
  const color = dotColors();
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      id: p.id,
      properties: {
        id: p.id,
        // Area, not radius, in proportion to votes.
        r: 3.5 + 15 * Math.sqrt(p.votes / max),
        // Small booths draw on top of big ones.
        sort: -p.votes,
        color: color(p.pNo, p.shade),
      },
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    })),
  };
}

/** Each polygon's outer ring (islands, not lakes). */
function outerRings({ geometry }: Feature<Polygon | MultiPolygon>) {
  return geometry.type === "Polygon"
    ? [geometry.coordinates[0]]
    : geometry.coordinates.map((rings) => rings[0]);
}

/** The world with the electorate cut out, to fade everything around it. */
function maskOf(boundary: Feature<Polygon | MultiPolygon>): Feature<Polygon> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      // Clockwise outer ring; the electorate's own (anticlockwise, RFC 7946)
      // outer rings become holes.
      coordinates: [
        [
          [150, -60],
          [150, -20],
          [200, -20],
          [200, -60],
          [150, -60],
        ],
        ...outerRings(boundary),
      ],
    },
  };
}

/**
 * Where to look first: around the voting places that took most (85%) of the
 * votes. Outlines can take in far-flung islands, and places well outside an
 * electorate take a handful of its votes, so neither frames it well. Falls
 * back to the whole outline.
 */
function initialBounds(
  points: BoothPoint[],
  boundary: Feature<Polygon | MultiPolygon>,
) {
  const total = points.reduce((a, p) => a + p.votes, 0);
  const core: number[][] = [];
  let covered = 0;
  for (const p of [...points].sort((a, b) => b.votes - a.votes)) {
    if (covered >= total * 0.85 && core.length >= 3) break;
    core.push([p.lon, p.lat]);
    covered += p.votes;
  }
  const coords = core.length >= 2 ? core : outerRings(boundary).flat();
  return coords.reduce<[number, number, number, number]>(
    ([x0, y0, x1, y1], [x, y]) => [
      Math.min(x0, x),
      Math.min(y0, y),
      Math.max(x1, x),
      Math.max(y1, y),
    ],
    [180, 90, -180, -90],
  );
}

/**
 * Each dot's radius (property `r`, plus `extra` pixels), growing a little as
 * you zoom in. MapLibre only allows zoom at the top of an expression.
 */
const radius = (extra = 0): ExpressionSpecification =>
  [
    "interpolate",
    ["linear"],
    ["zoom"],
    ...[
      [5, 0.55],
      [9, 0.8],
      [13, 1.1],
      [16, 1.5],
    ].flatMap(([zoom, scale]) => [
      zoom,
      ["+", ["*", ["get", "r"], scale], extra] as ExpressionSpecification,
    ]),
  ] as ExpressionSpecification;

/**
 * The dot under a point (the one the hover card shows), else the nearest
 * within a few pixels, so small dots are easy to tap.
 */
function placeAt(map: MapLibreMap, { x, y }: { x: number; y: number }) {
  const layers = ["booths"];
  const [exact] = map.queryRenderedFeatures([x, y], { layers });
  if (exact) return exact;
  let nearest: { f: MapGeoJSONFeature; d: number } | undefined;
  for (const f of map.queryRenderedFeatures(
    [
      [x - 8, y - 8],
      [x + 8, y + 8],
    ],
    { layers },
  )) {
    const at = map.project(
      (f.geometry as GeoJSON.Point).coordinates as [number, number],
    );
    const d = Math.hypot(at.x - x, at.y - y);
    if (!nearest || d < nearest.d) nearest = { f, d };
  }
  return nearest?.f;
}

function flyToPlace(map: MapLibreMap, points: BoothPoint[], id: number) {
  const point = points.find((p) => p.id === id);
  if (!point) return;
  map.flyTo({
    center: [point.lon, point.lat],
    zoom: Math.max(map.getZoom(), 13),
    duration: 900,
  });
}

export default function BoothMapCanvas({
  points,
  boundaryUrl,
  selected,
  flyTo,
  label,
  onSelect,
  onHover,
  onError,
}: {
  points: BoothPoint[];
  boundaryUrl: string;
  selected: number | null;
  /** Centre on this place (bump `seq` to repeat). */
  flyTo: { id: number; seq: number } | null;
  label: string;
  onSelect: (id: number | null) => void;
  onHover: (hover: BoothHover | null) => void;
  onError: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loaded = useRef(false);

  const currentPoints = useEffectEvent(() => points);
  const select = useEffectEvent(onSelect);
  const hover = useEffectEvent(onHover);
  const fail = useEffectEvent(onError);
  const currentSelection = useEffectEvent(() => selected);
  const currentFlyTo = useEffectEvent(() => flyTo);

  // Create the map once per electorate.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let cancelled = false;
    let map: MapLibreMap | undefined;
    const media = darkQuery();
    const canHover = window.matchMedia("(hover: hover)");
    const palette = () => PALETTES[media.matches ? "dark" : "light"];

    // Follow the system colour scheme, as the rest of the site does.
    const onScheme = () => {
      if (!map || !loaded.current) return;
      const p = palette();
      for (const layer of map.getStyle().layers) {
        if (OVERLAYS.includes(layer.id)) continue;
        for (const [k, v] of Object.entries(basePaint(layer, p))) {
          map.setPaintProperty(layer.id, k as PaintProperty, v);
        }
      }
      map.setPaintProperty("mask", "fill-color", p.mask);
      map.setPaintProperty("mask", "fill-opacity", p.maskOpacity);
      map.setPaintProperty("outline", "line-color", p.outline);
      map.setPaintProperty("outline-halo", "line-color", p.outlineHalo);
      map.setPaintProperty("booths", "circle-stroke-color", p.dotStroke);
      map.setPaintProperty("booth-selected", "circle-stroke-color", p.outline);
      (map.getSource("booths") as GeoJSONSource).setData(
        pointsData(currentPoints()),
      );
    };
    media.addEventListener("change", onScheme);

    Promise.all([
      loadBaseStyle(),
      fetch(boundaryUrl).then((r) => {
        if (!r.ok) throw new Error(`Boundary: HTTP ${r.status}`);
        return r.json() as Promise<Feature<Polygon | MultiPolygon>>;
      }),
    ])
      .then(([base, boundary]) => {
        if (cancelled) return;
        const p = palette();
        map = new MapLibre({
          container: el,
          style: themedStyle(base, p),
          bounds: initialBounds(currentPoints(), boundary),
          fitBoundsOptions: { padding: 40, maxZoom: 14 },
          minZoom: 4,
          maxZoom: 17,
          // Page scrolling keeps working: ctrl/⌘ + scroll or two fingers zoom.
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          renderWorldCopies: false,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
        map.addControl(
          new NavigationControl({ showCompass: false }),
          "top-right",
        );
        map.getCanvas().setAttribute("aria-label", label);

        map.on("load", () => {
          if (!map) return;
          map.addSource("mask", { type: "geojson", data: maskOf(boundary) });
          map.addSource("electorate", { type: "geojson", data: boundary });
          map.addSource("booths", {
            type: "geojson",
            data: pointsData(currentPoints()),
          });
          map.addLayer({
            id: "mask",
            type: "fill",
            source: "mask",
            paint: { "fill-color": p.mask, "fill-opacity": p.maskOpacity },
          });
          map.addLayer({
            id: "outline-halo",
            type: "line",
            source: "electorate",
            layout: { "line-join": "round" },
            paint: { "line-color": p.outlineHalo, "line-width": 6 },
          });
          map.addLayer({
            id: "outline",
            type: "line",
            source: "electorate",
            layout: { "line-join": "round" },
            paint: { "line-color": p.outline, "line-width": 2.25 },
          });
          map.addLayer({
            id: "booths",
            type: "circle",
            source: "booths",
            layout: { "circle-sort-key": ["get", "sort"] },
            paint: {
              "circle-radius": radius(),
              "circle-color": ["get", "color"],
              "circle-stroke-color": p.dotStroke,
              // Thinner outlines zoomed out, where dots crowd together.
              "circle-stroke-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                6,
                0.6,
                11,
                1.25,
              ],
            },
          });
          map.addLayer({
            id: "booth-selected",
            type: "circle",
            source: "booths",
            filter: ["==", ["get", "id"], currentSelection() ?? -1],
            paint: {
              "circle-radius": radius(4),
              "circle-color": "rgba(0,0,0,0)",
              "circle-stroke-color": p.outline,
              "circle-stroke-width": 3,
            },
          });
          loaded.current = true;
          // Catch up on anything that changed while the map was loading.
          if (palette() !== p) onScheme();
          const pending = currentFlyTo();
          if (pending) flyToPlace(map, currentPoints(), pending.id);
          // Start with the credits folded into the ⓘ button (they're also
          // in the section's footnote) so they don't cover the dots.
          el.querySelector(".maplibregl-compact-show")?.classList.remove(
            "maplibregl-compact-show",
          );
        });

        map.on("mousemove", "booths", (e) => {
          const id = e.features?.[0]?.properties?.id;
          // Taps fire mousemove too; a hover card would then stick on phones.
          if (!map || typeof id !== "number" || !canHover.matches) return;
          map.getCanvas().style.cursor = "pointer";
          hover({
            id,
            x: e.point.x,
            y: e.point.y,
            w: el.clientWidth,
            h: el.clientHeight,
          });
        });
        // The card would be left describing a dot that's moved away.
        map.on("movestart", () => hover(null));
        map.on("mouseleave", "booths", () => {
          if (map) map.getCanvas().style.cursor = "";
          hover(null);
        });
        map.on("click", (e) => {
          if (!map || !loaded.current) return;
          const id = placeAt(map, e.point)?.properties?.id;
          select(typeof id === "number" ? id : null);
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        fail();
      });

    return () => {
      cancelled = true;
      media.removeEventListener("change", onScheme);
      loaded.current = false;
      mapRef.current = null;
      map?.remove();
    };
  }, [boundaryUrl, label]);

  // New colours or sizes (another vote, or a party picked).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    (map.getSource("booths") as GeoJSONSource | undefined)?.setData(
      pointsData(points),
    );
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    map.setFilter("booth-selected", ["==", ["get", "id"], selected ?? -1]);
  }, [selected]);

  useEffect(() => {
    const map = mapRef.current;
    // Before it's loaded, the load handler catches up instead.
    if (!map || !loaded.current || !flyTo) return;
    flyToPlace(map, currentPoints(), flyTo.id);
  }, [flyTo]);

  // MapLibre makes its container position: relative, so it fills a wrapper.
  return (
    <div className="booth-map absolute inset-0">
      <div ref={container} className="size-full" />
    </div>
  );
}
