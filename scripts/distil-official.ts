/**
 * Distils the Electoral Commission's official results pages into one small,
 * committed JSON file that `scripts/import-official.ts` loads (on every deploy).
 *
 *   pnpm official:distil                 # data/official-2026/ → imports/official-2026.json
 *   pnpm official:distil <pages dir> <out.json>
 *
 * The pages are the results site's HTML (electionresults.govt.nz/electionresults_<year>/),
 * saved from a browser because the site sits behind a Cloudflare challenge:
 * index.html, successful-candidates.html and electorate-details-NN.html, plus a
 * manifest.json of `{ source, fetchedAt, pages }`. They stay in the gitignored
 * data/ folder; only the distilled file is committed.
 *
 * Names are kept as the Commission writes them; the importer matches them to
 * the stored parties, candidates and electorates. Every total on the pages is
 * checked against its parts, so a change in the page format fails loudly
 * here rather than storing wrong numbers.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OfficialResults } from "./lib/official";

const root = path.join(import.meta.dirname, "..");
const [pagesArg, outArg] = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--"));
const dir = path.resolve(pagesArg ?? path.join(root, "data", "official-2026"));
const out = path.resolve(
  outArg ?? path.join(root, "imports", "official-2026.json"),
);

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Text content of an HTML fragment: tags dropped, entities decoded, spaces collapsed. */
function text(html: string) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code =
          e[1] === "x" || e[1] === "X"
            ? parseInt(e.slice(2), 16)
            : Number(e.slice(1));
        return String.fromCodePoint(code);
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** "40,008" → 40008; "-" or "" → 0. Anything else is an error. */
function int(s: string, what: string) {
  const t = s.replace(/[,\s%]/g, "");
  if (t === "" || t === "-") return 0;
  if (!/^\d+$/.test(t))
    throw new Error(`${what}: expected a whole number, got "${s}"`);
  return Number(t);
}

function num(s: string, what: string) {
  const t = s.replace(/[,\s%]/g, "");
  if (!/^\d+(\.\d+)?$/.test(t))
    throw new Error(`${what}: expected a number, got "${s}"`);
  return Number(t);
}

/** The inner HTML of the one element with this id. */
function byId(html: string, id: string, file: string) {
  const start = html.search(new RegExp(`<table[^>]*\\bid="${id}"`));
  if (start < 0) throw new Error(`${file}: no table #${id}`);
  const end = html.indexOf("</table>", start);
  return html.slice(start, end);
}

const rows = (table: string) =>
  [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
const cells = (row: string) =>
  [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => m[1]);

function check(ok: boolean, message: string) {
  if (!ok) throw new Error(message);
}

/* ------------------------------ national ------------------------------ */

function parseNational(html: string): OfficialResults["parties"] {
  const parties: OfficialResults["parties"] = [];
  let total: number[] | null = null;
  for (const row of rows(byId(html, "overall-results-table", "index.html"))) {
    const c = cells(row).map(text);
    if (c.length !== 6 || c[0] === "") continue; // header
    const what = `index.html, ${c[0]}`;
    if (c[0] === "Total") {
      total = [
        int(c[1], what),
        int(c[3], what),
        int(c[4], what),
        int(c[5], what),
      ];
      continue;
    }
    const p = {
      name: c[0],
      votes: int(c[1], what),
      percent: num(c[2], what),
      electorateSeats: int(c[3], what),
      listSeats: int(c[4], what),
      totalSeats: int(c[5], what),
    };
    check(
      p.electorateSeats + p.listSeats === p.totalSeats,
      `${what}: ${p.electorateSeats} + ${p.listSeats} seats isn't ${p.totalSeats}`,
    );
    parties.push(p);
  }
  check(parties.length > 0, "index.html: no parties found");
  check(total !== null, "index.html: no Total row");
  const sum = (k: "votes" | "electorateSeats" | "listSeats" | "totalSeats") =>
    parties.reduce((a, p) => a + p[k], 0);
  const [votes, electorate, list, seats] = total as number[];
  check(
    sum("votes") === votes,
    `index.html: party votes add to ${sum("votes")}, not ${votes}`,
  );
  check(
    sum("electorateSeats") === electorate,
    "index.html: electorate seats don't add up",
  );
  check(sum("listSeats") === list, "index.html: list seats don't add up");
  check(sum("totalSeats") === seats, "index.html: total seats don't add up");
  return parties;
}

/* ----------------------------- electorates ----------------------------- */

function parseElectorate(
  html: string,
  file: string,
  eNo: number,
): OfficialResults["electorates"][number] {
  const title = text(html.match(/<h2>([\s\S]*?)<\/h2>/)?.[1] ?? "");
  const name = title.replace(/\s*-\s*Official Result$/, "");
  check(
    name !== title,
    `${file}: heading "${title}" isn't "<electorate> - Official Result"`,
  );

  // Summary: votes counted, the top two candidates, majority.
  const summary = new Map<string, string[]>();
  for (const row of rows(byId(html, "electorate_details_table", file))) {
    const c = cells(row).map(text);
    if (c[0]) summary.set(c[0].replace(/:$/, ""), c.slice(1));
  }
  const get = (label: string) => {
    const v = summary.get(label);
    if (!v) throw new Error(`${file}: no "${label}" row`);
    return v;
  };
  const votesCounted = int(get("VOTES COUNTED")[0], `${file} votes counted`);
  check(
    get("VOTES COUNTED")[1] === "100.0%",
    `${file}: votes counted isn't 100.0%`,
  );
  const leading = get("LEADING CANDIDATE");
  const second = get("2nd CANDIDATE");
  const majority = int(get("MAJORITY")[1], `${file} majority`);

  // Candidates and parties sit side by side in independent columns.
  const candidates: { name: string; votes: number }[] = [];
  const parties: { name: string; votes: number }[] = [];
  const subtotals: Record<string, number> = {};
  const totals: number[] = [];
  const table = byId(html, "partyCandidatesResultsTable", file);
  for (const row of rows(table.slice(table.indexOf("<tbody")))) {
    for (const [col, cell] of cells(row).entries()) {
      const spans = [...cell.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map(
        (m) => text(m[1]),
      );
      const label = text(
        cell.match(/<label[^>]*>([\s\S]*?)<\/label>/)?.[1] ?? "",
      );
      if (label === "TOTAL:")
        totals[col] = int(spans[0] ?? "", `${file} total`);
      else if (label)
        subtotals[label.replace(/:$/, "")] = int(
          spans[0] ?? "",
          `${file} ${label}`,
        );
      else if (spans.length === 2 && spans[0] !== "") {
        (col === 0 ? candidates : parties).push({
          name: spans[0],
          votes: int(spans[1], `${file}, ${spans[0]}`),
        });
      }
    }
  }
  const candidateInformals = subtotals["Candidate Informals"];
  const partyInformals = subtotals["Party Informals"];
  check(
    candidateInformals !== undefined && partyInformals !== undefined,
    `${file}: no informal votes`,
  );
  check(
    candidates.length > 0 && parties.length > 0,
    `${file}: no candidate or party votes`,
  );

  const sum = (xs: { votes: number }[]) => xs.reduce((a, x) => a + x.votes, 0);
  check(
    sum(candidates) + candidateInformals === totals[0],
    `${file}: candidate votes + informals = ${sum(candidates) + candidateInformals}, but TOTAL is ${totals[0]}`,
  );
  check(
    sum(parties) + partyInformals === totals[1],
    `${file}: party votes + informals = ${sum(parties) + partyInformals}, but TOTAL is ${totals[1]}`,
  );
  check(
    totals[1] === votesCounted,
    `${file}: party TOTAL ${totals[1]} isn't votes counted ${votesCounted}`,
  );
  const ranked = [...candidates].sort((a, b) => b.votes - a.votes);
  check(
    ranked[0].name === leading[0] && ranked[0].votes === int(leading[1], file),
    `${file}: leading candidate doesn't match the candidate votes`,
  );
  check(
    ranked[1]?.name === second[0] && ranked[1].votes === int(second[1], file),
    `${file}: 2nd candidate doesn't match the candidate votes`,
  );
  check(
    ranked[0].votes - ranked[1].votes === majority,
    `${file}: majority doesn't match`,
  );

  return {
    eNo,
    name,
    votesCounted,
    candidateInformals,
    partyInformals,
    candidates,
    parties,
  };
}

/* ------------------------- successful candidates ------------------------- */

function parseSuccessful(html: string): OfficialResults["successful"] {
  const out: OfficialResults["successful"] = [];
  let party = "";
  for (const row of rows(
    byId(html, "successful_candidates_table", "successful-candidates.html"),
  )) {
    const heading = row.match(/<h3>([\s\S]*?)<\/h3>/);
    if (heading) {
      party = text(heading[1]);
      continue;
    }
    const c = cells(row);
    if (c.length !== 2 || !party) continue;
    const name = text(c[0]);
    const seat = text(c[1]);
    const page = c[1].match(/electorate-details-(\d+)\.html/);
    if (seat === "List Seat") out.push({ party, name, eNo: null });
    else if (page) out.push({ party, name, eNo: Number(page[1]) });
    else
      throw new Error(
        `successful-candidates.html: unknown seat "${seat}" for ${name}`,
      );
  }
  return out;
}

/* -------------------------------- main -------------------------------- */

async function main() {
  const manifest = JSON.parse(
    await readFile(path.join(dir, "manifest.json"), "utf8"),
  ) as {
    source: string;
    fetchedAt: string;
    pages: Record<string, string>;
  };
  for (const [file, title] of Object.entries(manifest.pages)) {
    check(
      title.startsWith("Official count"),
      `${file} is "${title}", not an official count page`,
    );
  }
  const read = (f: string) => readFile(path.join(dir, f), "utf8");

  const parties = parseNational(await read("index.html"));
  const files = (await readdir(dir))
    .map((f) => f.match(/^electorate-details-(\d+)\.html$/))
    .filter((m) => m !== null)
    .sort((a, b) => Number(a[1]) - Number(b[1]));
  const electorates = [];
  for (const m of files) {
    electorates.push(parseElectorate(await read(m[0]), m[0], Number(m[1])));
  }
  const successful = parseSuccessful(await read("successful-candidates.html"));

  // Cross-checks between pages.
  const seats = parties.reduce((a, p) => a + p.electorateSeats, 0);
  check(
    electorates.length === seats,
    `${electorates.length} electorate pages, but ${seats} electorate seats`,
  );
  for (const p of parties) {
    const inElectorates = electorates.reduce(
      (a, e) => a + (e.parties.find((x) => x.name === p.name)?.votes ?? 0),
      0,
    );
    check(
      inElectorates === p.votes,
      `${p.name}: ${inElectorates} party votes across the electorates, but ${p.votes} nationally`,
    );
  }
  for (const e of electorates) {
    const winner = [...e.candidates].sort((a, b) => b.votes - a.votes)[0];
    const declared = successful.find((s) => s.eNo === e.eNo);
    check(
      declared?.name === winner.name,
      `${e.name}: ${winner.name} leads, but successful candidates has ${declared?.name}`,
    );
  }
  for (const p of parties) {
    const mps = successful.filter((s) => s.party === p.name);
    const won = mps.filter((s) => s.eNo !== null).length;
    check(
      mps.length === p.totalSeats,
      `${p.name}: ${mps.length} successful candidates, but ${p.totalSeats} seats`,
    );
    check(
      won === p.electorateSeats,
      `${p.name}: ${won} electorate MPs, but ${p.electorateSeats} electorate seats`,
    );
  }

  const result: OfficialResults = {
    source: manifest.source,
    fetchedAt: manifest.fetchedAt,
    parties,
    electorates,
    successful,
  };
  await writeFile(out, `${JSON.stringify(result, null, 1)}\n`);
  const votes = electorates.reduce((a, e) => a + e.votesCounted, 0);
  console.log(
    `Wrote ${path.relative(process.cwd(), out)}: ${parties.length} parties, ${electorates.length} electorates, ` +
      `${successful.length} MPs, ${votes.toLocaleString("en-NZ")} votes counted.`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
