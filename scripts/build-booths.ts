/**
 * Builds booth-level (voting place) results from the Electoral Commission's
 * per-electorate voting place statistics, geocoded against LINZ NZ Addresses.
 *
 * Inputs, all in the gitignored data/ directory at the repo root:
 *  - data/<year>-<stage>/NN_Name.xlsx: one per electorate, from
 *    https://www.electionresults.govt.nz/electionresults_2026_preliminary/voting-place-statistics.html
 *    Cloudflare blocks scripted downloads, so save them from a browser.
 *  - data/nz-addresses.csv: LINZ NZ Addresses (CC BY 4.0),
 *    https://data.linz.govt.nz/layer/105689-nz-addresses/
 *  - data/voting-place-overrides.csv (optional): hand fixes, columns
 *    place,lat,lon. Leave lat/lon empty to mark a place as unmappable.
 *  - data/electorates-2025-{general,maori}.geojson: Stats NZ 2025 electorate
 *    boundaries (CC BY 4.0), downloaded on first run. Every geocode is checked
 *    against them: a place should sit inside an electorate it took votes for.
 *
 * Outputs:
 *  - data/booths-<year>-<stage>.csv: one row per voting place × electorate ×
 *    section × vote (each party, each candidate, and informals). Load it into
 *    Postgres with `pnpm booths:import`.
 *  - data/voting-places.csv: one row per place, showing how it was geocoded,
 *    worst first. Check the unmapped, `locality` and `road` rows,
 *    add overrides, and re-run.
 *
 *   pnpm booths:build                               # 2026-preliminary, ./data
 *   pnpm booths:build --stage 2026-official
 *   pnpm booths:build --data /path/to/sixtyone/data # e.g. from a worktree
 */
import { createReadStream, existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { geoBounds, geoContains } from "d3-geo";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";
import { foldDiacritics } from "../src/lib/text";
import { parseCsvLine, readCsv, toCsvRow } from "./lib/csv";
import { readXlsx } from "./lib/xlsx";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const DATA = path.resolve(
  arg("data") ?? path.join(import.meta.dirname, "..", "data"),
);
const STAGE = arg("stage") ?? "2026-preliminary";

/* ------------------------------------------------------------------ */
/* Spreadsheets                                                        */
/* ------------------------------------------------------------------ */

type Section = "advance" | "election_day";

type Booth = {
  eNo: number;
  electorate: string;
  section: Section;
  place: string;
  party: Map<string, number>;
  partyInformal: number;
  candidate: Map<string, number>;
  candidateInformal: number;
};

type SheetRow = {
  section: Section;
  place: string;
  votes: Map<string, number>;
  informal: number;
};

const SECTIONS: Record<string, Section> = {
  "ADVANCE VOTING PLACES": "advance",
  "VOTING PLACES": "election_day",
};

const int = (s: string, where: string) => {
  if (!/^\d+$/.test(s))
    throw new Error(`Expected a number at ${where}: "${s}"`);
  return Number(s);
};

/** Reads the "Party" or "Candidate" sheet: one row per place, plus checks against the TOTAL row. */
function readSheet(rows: string[][], where: string) {
  const header = rows[0];
  const title = header[0].split("\n")[0].trim();
  const validCol = header.findIndex((h) => /^Total Valid/i.test(h));
  const informalCol = header.findIndex((h) => /^Informal/i.test(h));
  if (validCol < 0 || informalCol < 0) {
    throw new Error(`${where}: can't find the total columns`);
  }
  const choices = header
    .slice(1, validCol)
    .map((name, i) => ({ name, col: i + 1 }))
    .filter((c) => c.name);

  const out: SheetRow[] = [];
  let section: Section | undefined;
  let checked = false;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const label = row[0] ?? "";
    const at = `${where} row ${r + 1}`;
    if (!row.slice(1).some(Boolean)) {
      if (label in SECTIONS) section = SECTIONS[label];
      else if (label && !/^(Source|Note):/.test(label)) {
        throw new Error(`${at}: unknown section "${label}"`);
      }
      continue;
    }
    const votes = new Map(choices.map((c) => [c.name, int(row[c.col], at)]));
    const valid = int(row[validCol], at);
    const informal = int(row[informalCol], at);
    const sum = [...votes.values()].reduce((a, b) => a + b, 0);
    if (sum !== valid) {
      throw new Error(`${at}: votes add to ${sum}, not ${valid}`);
    }

    if (/ TOTAL$/.test(label)) {
      const totals = new Map<string, number>();
      for (const p of out) {
        for (const [k, v] of p.votes) totals.set(k, (totals.get(k) ?? 0) + v);
      }
      for (const [k, v] of votes) {
        if (totals.get(k) !== v) {
          throw new Error(
            `${at}: ${k} places add to ${totals.get(k)}, TOTAL says ${v}`,
          );
        }
      }
      checked = true;
      continue;
    }
    if (!section) throw new Error(`${at}: place before any section`);
    out.push({ section, place: label, votes, informal });
  }
  if (!checked) throw new Error(`${where}: no TOTAL row`);
  return { title, rows: out };
}

async function readSpreadsheets(dir: string): Promise<Booth[]> {
  const files = (await readdir(dir)).filter((f) => /^\d\d_.+\.xlsx$/.test(f));
  if (files.length !== 71) {
    throw new Error(
      `Expected 71 spreadsheets in ${dir}, found ${files.length}`,
    );
  }
  const booths: Booth[] = [];
  for (const file of files.sort()) {
    const eNo = Number(file.slice(0, 2));
    const sheets = readXlsx(await readFile(path.join(dir, file)));
    const party = sheets.get("Party");
    const cand = sheets.get("Candidate");
    if (!party || !cand) throw new Error(`${file}: missing a sheet`);
    const p = readSheet(party, `${file} Party`);
    const c = readSheet(cand, `${file} Candidate`);
    const electorate = p.title.replace(/^\d+\s+/, "").replace(/ - .*$/, "");

    if (p.rows.length !== c.rows.length) {
      throw new Error(
        `${file}: Party and Candidate sheets list different places`,
      );
    }
    const seen = new Set<string>();
    p.rows.forEach((pr, i) => {
      const cr = c.rows[i];
      if (pr.place !== cr.place || pr.section !== cr.section) {
        throw new Error(`${file}: row ${i} is "${pr.place}" vs "${cr.place}"`);
      }
      const key = `${pr.section}|${pr.place}`;
      if (seen.has(key)) throw new Error(`${file}: "${pr.place}" listed twice`);
      seen.add(key);
      booths.push({
        eNo,
        electorate,
        section: pr.section,
        place: pr.place,
        party: pr.votes,
        partyInformal: pr.informal,
        candidate: cr.votes,
        candidateInformal: cr.informal,
      });
    });
  }
  return booths;
}

/* ------------------------------------------------------------------ */
/* Text normalisation, shared by booth places and LINZ addresses       */
/* ------------------------------------------------------------------ */

const ROAD_TYPES: Record<string, string> = {
  st: "street",
  rd: "road",
  ave: "avenue",
  av: "avenue",
  cres: "crescent",
  dr: "drive",
  pl: "place",
  tce: "terrace",
  hwy: "highway",
  pde: "parade",
  blvd: "boulevard",
  cl: "close",
  ct: "court",
  ln: "lane",
  sq: "square",
  gr: "grove",
};

/** Final words that make a name a road, as opposed to a venue. */
const TYPE_WORDS = new Set([
  ...Object.values(ROAD_TYPES),
  "way",
  "esplanade",
  "line",
  "quay",
  "rise",
  "row",
  "mews",
  "loop",
  "track",
  "walk",
  "heights",
  "view",
  "glen",
  "green",
  "crest",
  "link",
  "mall",
  "promenade",
]);

/** Lowercase ASCII words: "Kāhui St David’s" → "kahui st davids". */
const words = (s: string) =>
  foldDiacritics(s)
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => (w === "mt" ? "mount" : w === "saint" ? "st" : w));

/** "Saint Johns Rd" and "St John's Road" both → "st johns road". */
function roadKey(s: string) {
  const w = words(s);
  const last = w.length > 1 ? w[w.length - 1] : undefined;
  if (last) w[w.length - 1] = ROAD_TYPES[last] ?? last;
  return w.join(" ");
}

const PLACE_NOISE = new Set(["city", "centre", "center", "central", "cbd"]);
/**
 * Loose locality key: "Dunedin North" = "North Dunedin", "Auckland City" =
 * "Auckland", "Bayview" = "Bay View".
 */
const localityKey = (s: string) =>
  words(s)
    .filter((w) => !PLACE_NOISE.has(w))
    .sort()
    .join("");

/* ------------------------------------------------------------------ */
/* Reading a place: "Suburb, Venue…, 12A Some Road"                    */
/* ------------------------------------------------------------------ */

type Lookup = { number?: number; suffix?: string; roads: string[] };

const MOBILE = /^taken in\b|\bteams?\b|various locations|\bcare homes?\b/i;

function lookupsFor(place: string): Lookup[] {
  const parts = place.split(",").map((p) => p.trim());
  const withNumber: Lookup[] = [];
  const roadOnly: Lookup[] = [];
  // The street address is usually last; venues and localities come before or after it.
  for (const raw of parts.slice(1).reverse()) {
    const part = raw
      // "(corner A Street & B Street)" on its own is the address; elsewhere
      // brackets are asides: "Lake Road (corner Lake Road & Anzac Avenue)".
      .replace(/^\((.*?)\)?$/, "$1")
      // "Lincoln Road (corner Universal Drive)" is a corner.
      .replace(/\s*\((?:corner|cnr)(?: of)?\s+([^)]*)\)?/i, " & $1")
      .replace(/\([^)]*\)?/g, " ")
      .replace(/^(shop|unit|level|suite|building)\s+\S+\s+/i, "")
      .replace(/\b(off|next to|behind|opposite|adjacent to)\b.*$/i, "")
      .replace(/\s+entrance$/i, "")
      .replace(/^SH\s?(\d+)\b/i, "State Highway $1")
      .trim();
    // "21-25 Elliott Street" → 21, "3/25 Normanby Road" → 25, "20A Clive Road".
    const m = part.match(
      /^(\d+)([a-z])?(?:\s*([-–/])\s*(\d+)([a-z])?)?\s+(.+)$/i,
    );
    const rest = m ? m[6] : part;
    const names = rest
      .replace(/^(corner( of)?|cnr)\s+/i, "")
      .split(/\s+(?:&|and)\s+/i);
    // "Mandeville & South Eyre Road", "Brunswick and Campbell Roads": the
    // road type is only given once.
    const isType = (w: string) =>
      TYPE_WORDS.has(roadKey(`x ${w}`).split(" ")[1]);
    const lastWord = (s: string) => s.split(/\s+/).at(-1) ?? "";
    if (names.length > 1) {
      let type = lastWord(names[names.length - 1]);
      if (!isType(type) && isType(type.replace(/s$/i, ""))) {
        type = type.replace(/s$/i, "");
        names[names.length - 1] = names[names.length - 1].replace(/s$/i, "");
      }
      if (isType(type)) {
        for (let i = 0; i < names.length - 1; i++) {
          if (!isType(lastWord(names[i]))) names[i] = `${names[i]} ${type}`;
        }
      }
    }
    const roads = [...new Set(names.map(roadKey))]
      // A lone word is only a road when it has a number: "226 Broadway".
      .filter((r) => r.includes(" ") || (m && r.length > 3));
    if (!roads.length) continue;
    // A few LINZ roads have no type: "Ara Tai", not "Ara Tai Road".
    const untyped = roads
      .map((r) => r.replace(/ \w+$/, ""))
      .filter(
        (r, i) =>
          r.includes(" ") && TYPE_WORDS.has(roads[i].split(" ").at(-1) ?? ""),
      );
    for (const rs of untyped.length ? [roads, untyped] : [roads]) {
      if (m) {
        const unitStyle = m[3] === "/";
        withNumber.push({
          number: Number(unitStyle ? m[4] : m[1]),
          suffix: (unitStyle ? m[5] : m[2])?.toLowerCase(),
          roads: rs,
        });
      } else roadOnly.push({ roads: rs });
    }
  }
  return [...withNumber, ...roadOnly];
}

/* ------------------------------------------------------------------ */
/* LINZ addresses                                                      */
/* ------------------------------------------------------------------ */

type Point = {
  number: number;
  suffix: string;
  high: number;
  suburb: string; // localityKey
  town: string; // localityKey
  lat: number;
  lon: number;
  address: string;
};

type Centroid = {
  lat: number;
  lon: number;
  n: number;
  label: string;
  /** Rough extent: half the bounding box diagonal, in km. */
  radiusKm: number;
  box: [number, number, number, number];
};

async function loadAddresses(file: string, roads: Set<string>) {
  const byRoad = new Map<string, Point[]>();
  // Locality centroids, keyed by suburb and by town. Names repeat around the
  // country ("Richmond"), so keep one centroid per suburb+town pair.
  const groups = new Map<string, Centroid>();
  const localities = new Map<string, Set<string>>();

  const lines = createInterface({
    input: createReadStream(file, "utf8"),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  let col: Record<string, number> | undefined;
  let n = 0;
  for await (const line of lines) {
    if (!col) {
      col = Object.fromEntries(
        parseCsvLine(line.replace(/^﻿/, "")).map((h, i) => [h, i]),
      );
      continue;
    }
    const f = parseCsvLine(line);
    const lon = Number(f[col.shape_X]);
    const lat = Number(f[col.shape_Y]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const suburbName = f[col.suburb_locality_ascii];
    const townName = f[col.town_city_ascii];
    const suburb = localityKey(suburbName);
    const town = localityKey(townName);

    for (const [key, label] of [
      [`s:${suburb}|${town}`, `${suburbName}, ${townName}`],
      [`t:${town}`, townName],
    ]) {
      const g = groups.get(key) ?? {
        lat: 0,
        lon: 0,
        n: 0,
        label,
        radiusKm: 0,
        box: [lat, lon, lat, lon],
      };
      g.box = [
        Math.min(g.box[0], lat),
        Math.min(g.box[1], lon),
        Math.max(g.box[2], lat),
        Math.max(g.box[3], lon),
      ];
      g.lat += lat;
      g.lon += lon;
      g.n++;
      groups.set(key, g);
    }
    // "Riverton/Aparima" is also "Riverton" and "Aparima".
    const aka = (name: string, key: string) =>
      name.includes("/") ? [key, ...name.split("/").map(localityKey)] : [key];
    for (const [k, g] of [
      ...aka(suburbName, suburb).map((k) => [k, `s:${suburb}|${town}`]),
      ...aka(townName, town).map((k) => [k, `t:${town}`]),
    ]) {
      if (!k) continue;
      const set = localities.get(k) ?? new Set();
      set.add(g);
      localities.set(k, set);
    }

    const road = roadKey(f[col.full_road_name_ascii]);
    if (roads.has(road)) {
      const pts = byRoad.get(road) ?? [];
      pts.push({
        number: Number(f[col.address_number]) || 0,
        suffix: f[col.address_number_suffix].toLowerCase(),
        high: Number(f[col.address_number_high]) || 0,
        suburb,
        town,
        lat,
        lon,
        address: f[col.full_address],
      });
      byRoad.set(road, pts);
    }
    if (++n % 500_000 === 0) console.log(`  …${n.toLocaleString()} addresses`);
  }
  for (const g of groups.values()) {
    g.lat /= g.n;
    g.radiusKm =
      km({ lat: g.box[0], lon: g.box[1] }, { lat: g.box[2], lon: g.box[3] }) /
      2;
    g.lon /= g.n;
  }
  console.log(`  ${n.toLocaleString()} addresses read`);
  return { byRoad, groups, localities };
}

/* ------------------------------------------------------------------ */
/* Geocoding                                                           */
/* ------------------------------------------------------------------ */

type Precision =
  | "manual"
  | "address"
  | "nearby"
  | "corner"
  | "road"
  | "locality";
type Geo = { lat: number; lon: number; precision: Precision; match: string };
type LatLon = { lat: number; lon: number };

const km = (a: LatLon, b: LatLon) => {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};

const mean = (pts: LatLon[]) => ({
  lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
  lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length,
});

/** Whether a point could be the place: inside an electorate it took votes for. */
type Accept = (p: LatLon) => boolean;

function makeGeocoder(data: Awaited<ReturnType<typeof loadAddresses>>) {
  const { byRoad, groups, localities } = data;
  const groupsByKind = {
    towns: new Set(
      [...groups].filter(([k]) => k.startsWith("t:")).map(([, g]) => g),
    ),
  };

  /**
   * Where the place's locality is: the suburbs and towns called that,
   * keeping those inside the place's electorate when the name is shared
   * ("Frankton" is in Hamilton and Queenstown). Suburbs first.
   */
  function localityAreas(place: string, accept: Accept) {
    for (const part of place.split(",").map(localityKey)) {
      const found = [...(localities.get(part) ?? [])]
        .sort()
        .reverse() // "s:" before "t:"
        .map((k) => groups.get(k))
        .filter((g): g is Centroid => !!g);
      if (!found.length) continue;
      // None in the place's electorate: the name's no help ("Balmoral"
      // isn't a LINZ suburb in Auckland, but is elsewhere).
      return found.filter(accept);
    }
    return [];
  }

  return function geocode(place: string, accept: Accept): Geo | undefined {
    const locality = localityKey(place.split(",")[0]);
    const areas = localityAreas(place, accept);
    // Within (or just beyond) the locality, and inside one of the place's
    // electorates. Without a known locality, the electorates have to do.
    const ok = (p: LatLon) =>
      (!areas.length || areas.some((a) => km(p, a) <= a.radiusKm + 2)) &&
      accept(p);
    const isOwn = (p: Point) => p.suburb === locality || p.town === locality;
    /** The acceptable points, those in the place's own suburb or town first. */
    const tiers = (pts: Point[]) => {
      const allowed = pts.filter(ok);
      const own = allowed.filter(isOwn);
      return own.length ? own : allowed;
    };
    // Search the place's own suburb/town fully (exact, then nearby numbers)
    // before looking further afield: "15 Redwood Street, Seddon" is missing
    // from LINZ, and Blenheim has one.
    const scopes: ((p: Point) => boolean)[] = areas.length
      ? [(p) => isOwn(p) && ok(p), ok]
      : [ok];

    for (const { number, suffix, roads } of lookupsFor(place)) {
      const road = (r: string) => byRoad.get(r) ?? [];
      for (const inScope of number === undefined ? [] : scopes) {
        const n = number as number;
        const pts = road(roads[0]).filter(inScope);
        const exact = pts.filter(
          (p) =>
            (p.number === n && p.suffix === (suffix ?? "")) ||
            (p.high > 0 && n >= p.number && n <= p.high),
        );
        const loose = exact.length ? exact : pts.filter((p) => p.number === n);
        if (loose.length && spreadKm(loose) < 1) {
          return { ...loose[0], precision: "address", match: loose[0].address };
        }
        // Nearest number on the same side of the street, within reason.
        // Rural numbers count metres/10 along the road, so allow more there.
        const slack = Math.max(20, n * 0.05);
        const near = pts
          .filter(
            (p) =>
              p.number > 0 &&
              p.number % 2 === n % 2 &&
              Math.abs(p.number - n) <= slack,
          )
          .sort((a, b) => Math.abs(a.number - n) - Math.abs(b.number - n));
        if (near.length && spreadKm(near.slice(0, 3)) < 1) {
          return { ...near[0], precision: "nearby", match: near[0].address };
        }
      }
      const candidates = roads.map((r) => tiers(road(r)));
      if (
        candidates.length >= 2 &&
        candidates[0].length &&
        candidates[1].length
      ) {
        // A corner: the closest pair of addresses on the two roads.
        let best: [Point, Point] | undefined;
        let bestKm = Number.POSITIVE_INFINITY;
        for (const a of candidates[0]) {
          for (const b of candidates[1]) {
            const d = km(a, b);
            if (d < bestKm) {
              bestKm = d;
              best = [a, b];
            }
          }
        }
        if (best && bestKm < 0.3) {
          return {
            ...mean(best),
            precision: "corner",
            match: `${best[0].address} / ${best[1].address}`,
          };
        }
      }
      // A road without a number: only within the place's own locality, when
      // known. "Main Road, Rai Valley" isn't Havelock's Main Road.
      for (const pts of candidates) {
        if (areas.length && !pts.every(isOwn)) continue;
        if (pts.length && spreadKm(pts) < 3) {
          return {
            ...mean(pts),
            precision: "road",
            match: `${pts[0].address.replace(/^[^ ]+ /, "")} (${pts.length} addresses)`,
          };
        }
      }
    }

    // Fall back to the middle of the suburb (or town), if it's unambiguous.
    const inside = areas.filter(accept);
    const suburbs = inside.filter((g) => !groupsByKind.towns.has(g));
    const pick = suburbs.length ? suburbs : inside;
    if (pick.length === 1) {
      const [g] = pick;
      return { lat: g.lat, lon: g.lon, precision: "locality", match: g.label };
    }
    return undefined;
  };
}

function spreadKm(pts: LatLon[]) {
  const c = mean(pts);
  return Math.max(...pts.map((p) => km(p, c)));
}

/* ------------------------------------------------------------------ */
/* Electorate boundaries                                               */
/* ------------------------------------------------------------------ */

const ARCGIS =
  "https://services2.arcgis.com/vKb0s8tBIA3bdocZ/ArcGIS/rest/services";
const BOUNDARIES = {
  general: {
    url: `${ARCGIS}/General_Electorates_2025/FeatureServer/0/query`,
    field: "GED2025_V1_00",
    offset: 0,
  },
  maori: {
    url: `${ARCGIS}/M%C4%81ori_Electorates_2025/FeatureServer/0/query`,
    field: "MED2025_V1_00",
    offset: 64,
  },
};

type Shape = {
  eNo: number;
  feature: Feature<Polygon | MultiPolygon>;
  bounds: [[number, number], [number, number]];
};

async function loadBoundaries(): Promise<Shape[]> {
  const shapes: Shape[] = [];
  for (const [kind, src] of Object.entries(BOUNDARIES)) {
    const file = path.join(DATA, `electorates-2025-${kind}.geojson`);
    if (!existsSync(file)) {
      console.log(`Downloading ${kind} electorate boundaries…`);
      const params = new URLSearchParams({
        where: "1=1",
        outFields: src.field,
        outSR: "4326",
        f: "geojson",
        maxAllowableOffset: "0.0001",
        geometryPrecision: "6",
      });
      const res = await fetch(`${src.url}?${params}`);
      if (!res.ok) throw new Error(`${kind} boundaries: HTTP ${res.status}`);
      await writeFile(file, await res.text());
    }
    const fc = JSON.parse(await readFile(file, "utf8")) as FeatureCollection<
      Polygon | MultiPolygon
    >;
    for (const feature of fc.features) {
      shapes.push({
        eNo: src.offset + Number(feature.properties?.[src.field]),
        feature,
        bounds: geoBounds(feature),
      });
    }
  }
  if (shapes.length !== 71) {
    throw new Error(`Expected 71 electorate boundaries, got ${shapes.length}`);
  }
  return shapes;
}

/** The general and Māori electorates a point falls in. */
function electoratesAt(shapes: Shape[], p: LatLon) {
  return shapes
    .filter(
      ({ bounds: [[x0, y0], [x1, y1]] }) =>
        p.lat >= y0 &&
        p.lat <= y1 &&
        // Wellington Bays includes the Chathams, across the antimeridian.
        (x0 <= x1 ? p.lon >= x0 && p.lon <= x1 : p.lon >= x0 || p.lon <= x1),
    )
    .filter((s) => geoContains(s.feature, [p.lon, p.lat]))
    .map((s) => s.eNo);
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function loadOverrides(file: string) {
  const out = new Map<string, LatLon | null>();
  if (!existsSync(file)) return out;
  for await (const r of readCsv(file)) {
    if (!r.place) continue;
    out.set(
      r.place,
      r.lat && r.lon ? { lat: Number(r.lat), lon: Number(r.lon) } : null,
    );
  }
  return out;
}

async function main() {
  const sheetDir = path.join(DATA, STAGE);
  console.log(`Reading spreadsheets from ${sheetDir}`);
  const booths = await readSpreadsheets(sheetDir);

  // Every electorate each place took votes for, and its total votes.
  const places = new Map<string, { votes: number; eNos: Set<number> }>();
  for (const b of booths) {
    const p = places.get(b.place) ?? { votes: 0, eNos: new Set() };
    p.votes += [...b.party.values()].reduce((a, v) => a + v, 0);
    p.eNos.add(b.eNo);
    places.set(b.place, p);
  }
  console.log(
    `  ${booths.length.toLocaleString()} booth results at ${places.size.toLocaleString()} places`,
  );
  const shapes = await loadBoundaries();
  const names = new Map(booths.map((b) => [b.eNo, b.electorate]));
  const electorateCache = new WeakMap<LatLon, number[]>();
  const electoratesAtCached = (p: LatLon) => {
    let e = electorateCache.get(p);
    if (!e) {
      e = electoratesAt(shapes, p);
      electorateCache.set(p, e);
    }
    return e;
  };

  const roads = new Set<string>();
  for (const place of places.keys()) {
    for (const l of lookupsFor(place)) for (const r of l.roads) roads.add(r);
  }
  console.log(`Reading LINZ addresses (${roads.size} roads of interest)`);
  const geocode = makeGeocoder(
    await loadAddresses(path.join(DATA, "nz-addresses.csv"), roads),
  );
  const overrides = await loadOverrides(
    path.join(DATA, "voting-place-overrides.csv"),
  );

  const geo = new Map<string, Geo | undefined>();
  const mobile = new Set<string>();
  for (const place of places.keys()) {
    if (overrides.has(place)) {
      const o = overrides.get(place);
      geo.set(
        place,
        o ? { ...o, precision: "manual", match: "override" } : undefined,
      );
    } else if (MOBILE.test(place)) {
      mobile.add(place);
    } else {
      // Points get tested many times (a road's addresses, for every place on
      // it), so remember which electorates each one is in.
      geo.set(
        place,
        geocode(place, (p) => {
          // Every place is in one general electorate and takes votes for it.
          // (Māori electorates are too big to tell towns apart.)
          const own = places.get(place)?.eNos;
          const general = [...(own ?? [])].some((e) => e <= 64);
          return electoratesAtCached(p).some(
            (e) => own?.has(e) && (e <= 64 || !general),
          );
        }),
      );
    }
  }

  // Outputs.
  const header = [
    "stage",
    "e_no",
    "electorate",
    "section",
    "place",
    "lat",
    "lon",
    "geo_precision",
    "vote_type",
    "choice",
    "votes",
  ];
  const lines = [header.join(",")];
  const coord = (n?: number) => (n === undefined ? "" : n.toFixed(6));
  for (const b of booths) {
    const g = geo.get(b.place);
    const base = [
      STAGE,
      b.eNo,
      b.electorate,
      b.section,
      b.place,
      coord(g?.lat),
      coord(g?.lon),
      g?.precision ?? (mobile.has(b.place) ? "mobile" : ""),
    ];
    for (const [name, v] of b.party)
      lines.push(toCsvRow([...base, "party", name, v]));
    lines.push(toCsvRow([...base, "party_informal", "", b.partyInformal]));
    for (const [name, v] of b.candidate) {
      lines.push(toCsvRow([...base, "candidate", name, v]));
    }
    lines.push(
      toCsvRow([...base, "candidate_informal", "", b.candidateInformal]),
    );
  }
  const resultsFile = path.join(DATA, `booths-${STAGE}.csv`);
  await writeFile(resultsFile, `${lines.join("\n")}\n`);

  const placeLines = [
    toCsvRow([
      "place",
      "lat",
      "lon",
      "precision",
      "matched",
      "located_in",
      "took_votes_for",
      "votes",
    ]),
  ];
  const order: Record<string, number> = {
    unmapped: 0,
    locality: 2,
    road: 3,
    corner: 4,
    nearby: 5,
    address: 6,
    manual: 7,
    mobile: 8,
  };
  const label = (eNos: Iterable<number>) =>
    [...eNos]
      .sort((a, b) => a - b)
      .map((e) => names.get(e) ?? e)
      .join("; ");
  const rows = [...places].map(([place, p]) => {
    const g = geo.get(place);
    const status = mobile.has(place) ? "mobile" : (g?.precision ?? "unmapped");
    return { place, p, g, status };
  });
  rows.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      b.p.votes - a.p.votes ||
      a.place.localeCompare(b.place),
  );
  for (const { place, p, g, status } of rows) {
    placeLines.push(
      toCsvRow([
        place,
        coord(g?.lat),
        coord(g?.lon),
        status,
        g?.match ?? "",
        g ? label(electoratesAt(shapes, g)) : "",
        label(p.eNos),
        p.votes,
      ]),
    );
  }
  const placesFile = path.join(DATA, "voting-places.csv");
  await writeFile(placesFile, `${placeLines.join("\n")}\n`);

  const counts = new Map<string, { places: number; votes: number }>();
  for (const r of rows) {
    const c = counts.get(r.status) ?? { places: 0, votes: 0 };
    c.places++;
    c.votes += r.p.votes;
    counts.set(r.status, c);
  }
  const allVotes = rows.reduce((s, r) => s + r.p.votes, 0);
  console.log("\nGeocoding (worst first):");
  for (const [k, c] of [...counts].sort((a, b) => order[a[0]] - order[b[0]])) {
    console.log(
      `  ${k.padEnd(9)} ${String(c.places).padStart(5)} places  ${((100 * c.votes) / allVotes).toFixed(1).padStart(5)}% of votes`,
    );
  }
  console.log(
    `\nWrote ${path.relative(process.cwd(), resultsFile)} (${(lines.length - 1).toLocaleString()} rows)`,
  );
  console.log(
    `Wrote ${path.relative(process.cwd(), placesFile)} (${rows.length.toLocaleString()} places)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
