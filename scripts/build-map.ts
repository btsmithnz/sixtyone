/**
 * Builds the static electorate map used by the site.
 *
 * Source: Stats NZ / Representation Commission 2025 electorate boundaries
 * (the boundaries used for the 2026 General Election), via Stats NZ's public
 * ArcGIS Online feature services. Licensed CC BY 4.0.
 *
 * Boundaries extend into the territorial sea, so they're clipped to land
 * using Stats NZ's coastline-clipped Statistical Area 3 layer.
 *
 * Outputs:
 *  - public/map/electorates.<hash>.svg: an SVG sprite with one <path id="eNN">
 *    per electorate, pre-projected. Pages reference it with
 *    <use href="/map/electorates.<hash>.svg#e12" fill="…">, so the geometry is
 *    downloaded once, cached immutably by the browser/CDN, and never inlined
 *    into HTML or RSC payloads. No map library or tiles are needed at runtime.
 *  - src/data/electorate-map.json: small metadata (sprite URL, view boxes,
 *    centroids, insets).
 *
 *   pnpm map:build            # uses cached downloads in scripts/.cache
 *   pnpm map:build --refresh  # re-downloads boundaries
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type GeoPermissibleObjects,
  geoArea,
  geoBounds,
  geoPath,
  geoTransverseMercator,
} from "d3-geo";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";
// @ts-expect-error mapshaper ships no types
import mapshaper from "mapshaper";
import { slugify } from "../src/lib/text";

const ARCGIS =
  "https://services2.arcgis.com/vKb0s8tBIA3bdocZ/ArcGIS/rest/services";
const SOURCES = {
  general: `${ARCGIS}/General_Electorates_2025/FeatureServer/0/query`,
  maori: `${ARCGIS}/M%C4%81ori_Electorates_2025/FeatureServer/0/query`,
  land: `${ARCGIS}/SA32023_V1_00_Clipped/FeatureServer/0/query`,
};

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "scripts/.cache");
const OUT = path.join(ROOT, "src/data/electorate-map.json");
const SPRITE_DIR = path.join(ROOT, "public/map");

const WIDTH = 1000;
/** Mainland NZ, Stewart Island and nearby islands. Drops the Chathams, Kermadecs and sub-Antarctic islands. */
const CLIP_BBOX = [166.0, -47.5, 178.9, -34.0];

/**
 * City insets. Each is framed by the bounding box of the listed electorates
 * (in projected space, plus padding). Any electorate whose centroid falls in
 * the frame is labelled in that inset.
 */
const INSETS: { id: string; label: string; frame: string[] }[] = [
  {
    id: "auckland",
    label: "Auckland",
    frame: [
      "Botany",
      "East Coast Bays",
      "Epsom",
      "Glendene",
      "Henderson",
      "Māngere",
      "Manurewa",
      "Maungakiekie",
      "Mt Albert",
      "Mt Roskill",
      "North Shore",
      "Northcote",
      "Ōtāhuhu",
      "Pakuranga",
      "Takanini",
      "Tāmaki",
      "Upper Harbour",
      "Whangaparāoa",
    ],
  },
  {
    id: "hamilton",
    label: "Hamilton",
    frame: ["Hamilton East", "Hamilton West"],
  },
  {
    id: "wellington",
    label: "Wellington",
    frame: [
      "Wellington North",
      "Wellington Bays",
      "Kenepuru",
      "Hutt South",
      "Remutaka",
    ],
  },
  {
    id: "christchurch",
    label: "Christchurch",
    frame: ["Christchurch Central", "Christchurch East", "Ilam", "Wigram"],
  },
];

/** Feed electorate numbers: general electorates are 1–64 (alphabetical by code), Māori are 65–71. */
const MAORI_OFFSET = 64;

type Props = Record<string, string | number>;

async function download(kind: keyof typeof SOURCES, refresh: boolean) {
  const file = path.join(CACHE, `${kind}-2025.geojson`);
  if (!refresh && existsSync(file)) return file;
  await mkdir(CACHE, { recursive: true });
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    outSR: "4326",
    f: "geojson",
    // Light generalisation server-side; mapshaper does the real simplification.
    maxAllowableOffset: kind === "land" ? "0.0002" : "0.0001",
    geometryPrecision: "6",
  });
  console.log(`Downloading ${kind} boundaries…`);
  const res = await fetch(`${SOURCES[kind]}?${params}`);
  if (!res.ok) throw new Error(`${kind}: HTTP ${res.status}`);
  await writeFile(file, await res.text());
  return file;
}

async function simplify(file: string, landFile: string, keep: string) {
  const [input, land] = await Promise.all([
    readFile(file, "utf8"),
    readFile(landFile, "utf8"),
  ]);
  const out = await mapshaper.applyCommands(
    [
      "-i input.json",
      `-clip bbox=${CLIP_BBOX.join(",")}`,
      "-clip land.json",
      // Remove tiny islets that add bytes but no meaning at this scale.
      "-filter-islands min-area=2km2 remove-empty",
      // Variable simplification: city electorates appear in zoomed insets, so
      // keep far more detail there than in large rural electorates.
      `-simplify visvalingam weighted variable percentage="LAND_AREA_SQ_KM < 400 ? 0.45 : LAND_AREA_SQ_KM < 3000 ? ${keep} * 2 : ${keep}" keep-shapes`,
      "-clean",
      "-o output.json format=geojson",
    ].join(" "),
    { "input.json": input, "land.json": land },
  );
  const fc = JSON.parse(out["output.json"]) as FeatureCollection<
    Polygon | MultiPolygon,
    Props
  >;
  for (const f of fc.features) rewindForD3(f.geometry);
  return fc;
}

/**
 * d3-geo uses spherical winding (exterior rings clockwise), the opposite of
 * RFC 7946. A wrongly wound polygon covers the whole globe *except* the
 * electorate, so flip any polygon whose spherical area exceeds a hemisphere.
 */
function rewindForD3(geometry: Polygon | MultiPolygon) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const rings of polygons) {
    if (geoArea({ type: "Polygon", coordinates: rings }) > 2 * Math.PI) {
      for (const ring of rings) ring.reverse();
    }
  }
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const [generalFile, maoriFile, landFile] = await Promise.all([
    download("general", refresh),
    download("maori", refresh),
    download("land", refresh),
  ]);
  const [general, maori] = await Promise.all([
    simplify(generalFile, landFile, "0.06"),
    simplify(maoriFile, landFile, "0.04"),
  ]);

  const projection = geoTransverseMercator()
    .rotate([-173, 0])
    .fitWidth(WIDTH, general as GeoPermissibleObjects);
  const pathGen = geoPath(projection).digits(1);
  const [[, y0], [, y1]] = pathGen.bounds(general as GeoPermissibleObjects);
  const height = Math.ceil(y1 - y0);
  projection.translate([
    projection.translate()[0],
    projection.translate()[1] - y0,
  ]);

  const toShape = (
    f: Feature<Polygon | MultiPolygon, Props>,
    eNo: number,
    name: string,
  ) => {
    const [cx, cy] = pathGen.centroid(f);
    const [[bx0, by0], [bx1, by1]] = pathGen.bounds(f);
    return {
      eNo,
      name,
      slug: slugify(name),
      d: pathGen(f) ?? "",
      centroid: [Math.round(cx * 10) / 10, Math.round(cy * 10) / 10],
      bounds: [bx0, by0, bx1, by1].map((n) => Math.round(n)),
      geoBounds: geoBounds(f),
    };
  };

  const generalShapes = general.features
    .map((f) =>
      toShape(
        f,
        Number(f.properties.GED2025_V1_00),
        String(f.properties.GED2025_V1_00_NAME).trim(),
      ),
    )
    .sort((a, b) => a.eNo - b.eNo);
  const maoriShapes = maori.features
    .map((f) =>
      toShape(
        f,
        MAORI_OFFSET + Number(f.properties.MED2025_V1_00),
        String(f.properties.MED2025_V1_00_NAME).trim(),
      ),
    )
    .sort((a, b) => a.eNo - b.eNo);

  if (generalShapes.length !== 64 || maoriShapes.length !== 7) {
    throw new Error(
      `Expected 64 + 7 electorates, got ${generalShapes.length} + ${maoriShapes.length}`,
    );
  }

  const byName = new Map(generalShapes.map((s) => [s.name, s]));
  const insets = INSETS.map((inset) => {
    const frame = inset.frame.map((n) => {
      const s = byName.get(n);
      if (!s) throw new Error(`Inset ${inset.id}: unknown electorate ${n}`);
      return s;
    });
    let x0 = Math.min(...frame.map((s) => s.bounds[0]));
    let y0 = Math.min(...frame.map((s) => s.bounds[1]));
    let x1 = Math.max(...frame.map((s) => s.bounds[2]));
    let y1 = Math.max(...frame.map((s) => s.bounds[3]));
    const pad = Math.max(x1 - x0, y1 - y0) * 0.05;
    [x0, y0, x1, y1] = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
    const eNos = generalShapes
      .filter(
        ({ centroid: [cx, cy] }) =>
          cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1,
      )
      .map((s) => s.eNo);
    return {
      id: inset.id,
      label: inset.label,
      eNos,
      viewBox: [x0, y0, x1 - x0, y1 - y0].map((n) => Math.round(n * 10) / 10),
    };
  });

  // Sprite: paths carry no fill/stroke so <use> elements can style them.
  const sprite = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}">`,
    ...[...generalShapes, ...maoriShapes].map(
      (s) => `<path id="e${s.eNo}" d="${s.d}"/>`,
    ),
    "</svg>",
  ].join("\n");
  const hash = createHash("sha256").update(sprite).digest("hex").slice(0, 10);
  await rm(SPRITE_DIR, { recursive: true, force: true });
  await mkdir(SPRITE_DIR, { recursive: true });
  const spriteName = `electorates.${hash}.svg`;
  await writeFile(path.join(SPRITE_DIR, spriteName), sprite);

  const meta = ({ d: _d, geoBounds: _g, ...s }: (typeof generalShapes)[0]) => s;
  const out = {
    source:
      "Stats NZ / Representation Commission, 2025 electorate boundaries (CC BY 4.0)",
    sprite: `/map/${spriteName}`,
    width: WIDTH,
    height,
    general: generalShapes.map(meta),
    maori: maoriShapes.map(meta),
    insets,
  };
  await mkdir(path.dirname(OUT), { recursive: true });
  const json = JSON.stringify(out, null, 1);
  await writeFile(OUT, json);
  console.log(
    `Wrote public/map/${spriteName} (${(sprite.length / 1024).toFixed(0)} KB) and ${path.relative(ROOT, OUT)} (${(json.length / 1024).toFixed(0)} KB), ${WIDTH}×${height}`,
  );
  for (const i of insets)
    console.log(
      `  inset ${i.id}: ${i.viewBox.join(" ")} (${i.eNos.length} electorates)`,
    );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
