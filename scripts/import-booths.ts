/**
 * Loads a booth results CSV (made by `pnpm booths:build`) into Postgres.
 *
 *   pnpm booths:import                    # dry run of data/booths-2026-preliminary.csv
 *   pnpm booths:import --write            # replace that stage's booth results
 *   pnpm booths:import path/to/booths.csv --write
 *
 * Connects with DATABASE_URL_UNPOOLED, else DATABASE_URL (read from
 * .env.local if it's there; a variable already set in the environment wins).
 * The tables come from drizzle/0004_booth_results.sql: deploys run
 * migrations, or run `pnpm db:migrate` against the same database first.
 *
 * Party and candidate names are matched to p_no and c_no using the parties
 * and candidates tables, so those must already be loaded (any scrape does
 * that). If any name doesn't match, nothing is written. Writing happens in
 * one transaction: voting places are upserted by name (so a re-geocode
 * updates them), and the stage's booth results are deleted and re-inserted,
 * so it's safe to re-run.
 */
import path from "node:path";
import postgres from "postgres";
import { foldDiacritics } from "../src/lib/text";
import { readCsv } from "./lib/csv";

const args = process.argv.slice(2);
const write = args.includes("--write");
const file = path.resolve(
  args.find((a) => !a.startsWith("--")) ??
    path.join(import.meta.dirname, "..", "data", "booths-2026-preliminary.csv"),
);

type Booth = {
  eNo: number;
  electorate: string;
  section: "advance" | "election_day";
  place: string;
  lat: number | null;
  lon: number | null;
  geoPrecision: string | null;
  party: Map<string, number>;
  partyInformals: number;
  candidate: Map<string, number>;
  candidateInformals: number;
};

/** Lenient name key: case, macrons, curly quotes and spacing don't matter. */
const key = (s: string) =>
  foldDiacritics(s.normalize("NFKC"))
    .replace(/[‘’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

async function readBooths() {
  const booths = new Map<string, Booth>();
  const stages = new Set<string>();
  for await (const r of readCsv(file)) {
    stages.add(r.stage);
    const id = `${r.e_no}|${r.section}|${r.place}`;
    let b = booths.get(id);
    if (!b) {
      if (r.section !== "advance" && r.section !== "election_day") {
        throw new Error(`Unknown section "${r.section}" for ${r.place}`);
      }
      b = {
        eNo: Number(r.e_no),
        electorate: r.electorate,
        section: r.section,
        place: r.place,
        lat: r.lat ? Number(r.lat) : null,
        lon: r.lon ? Number(r.lon) : null,
        geoPrecision: r.geo_precision || null,
        party: new Map(),
        partyInformals: 0,
        candidate: new Map(),
        candidateInformals: 0,
      };
      booths.set(id, b);
    }
    const votes = Number(r.votes);
    if (!Number.isInteger(votes) || votes < 0) {
      throw new Error(`Bad vote count "${r.votes}" for ${r.place}`);
    }
    if (r.vote_type === "party" || r.vote_type === "candidate") {
      const votesFor = r.vote_type === "party" ? b.party : b.candidate;
      if (votesFor.has(r.choice)) {
        throw new Error(
          `Two ${r.vote_type} rows for ${r.choice} at ${r.place}`,
        );
      }
      votesFor.set(r.choice, votes);
    } else if (r.vote_type === "party_informal") b.partyInformals = votes;
    else if (r.vote_type === "candidate_informal") b.candidateInformals = votes;
    else throw new Error(`Unknown vote_type "${r.vote_type}"`);
  }
  if (stages.size !== 1) {
    throw new Error(`Expected one stage in ${file}, found: ${[...stages]}`);
  }
  return { stage: [...stages][0], booths: [...booths.values()] };
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED).");

  console.log(`Reading ${path.relative(process.cwd(), file)}`);
  const { stage, booths } = await readBooths();
  const places = new Map(booths.map((b) => [b.place, b]));
  console.log(
    `  ${stage}: ${booths.length.toLocaleString()} booth results at ${places.size.toLocaleString()} places`,
  );

  console.log(`Connecting to ${new URL(url).host}`);
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      select to_regclass('public.booth_results') is not null as exists`;
    if (!exists) {
      throw new Error(
        "The booth_results table doesn't exist yet. Deploy (which migrates) or run `pnpm db:migrate` first.",
      );
    }

    // Resolve names to numbers before touching anything.
    const parties = await sql<
      { p_no: number; name: string; short_name: string }[]
    >`
      select p_no, name, short_name from parties`;
    const candidates = await sql<
      { c_no: number; name: string; e_no: number | null }[]
    >`
      select c_no, name, e_no from candidates where e_no is not null`;
    const electorates = await sql<{ e_no: number; name: string }[]>`
      select e_no, name from electorates`;
    if (!parties.length || !candidates.length) {
      throw new Error(
        "The parties/candidates tables are empty. Run a scrape first.",
      );
    }

    const partyByName = new Map<string, number>();
    for (const p of parties) {
      partyByName.set(key(p.name), p.p_no);
      if (!partyByName.has(key(p.short_name))) {
        partyByName.set(key(p.short_name), p.p_no);
      }
    }
    const candidateByName = new Map(
      candidates.map((c) => [`${c.e_no}|${key(c.name)}`, c.c_no]),
    );
    const electorateNames = new Map(electorates.map((e) => [e.e_no, e.name]));

    const problems = new Set<string>();
    const resolved = booths.map((b) => {
      if (!electorateNames.has(b.eNo))
        problems.add(`Unknown electorate ${b.eNo}`);
      else if (key(electorateNames.get(b.eNo) ?? "") !== key(b.electorate)) {
        problems.add(
          `Electorate ${b.eNo} is "${electorateNames.get(b.eNo)}" in the database but "${b.electorate}" in the CSV`,
        );
      }
      const party = [...b.party].map(([name, votes]) => {
        const pNo = partyByName.get(key(name));
        if (pNo === undefined) problems.add(`No party called "${name}"`);
        return { pNo: pNo ?? -1, votes };
      });
      const candidate = [...b.candidate].map(([name, votes]) => {
        const cNo = candidateByName.get(`${b.eNo}|${key(name)}`);
        if (cNo === undefined) {
          problems.add(
            `No candidate "${name}" in electorate ${b.eNo} (${b.electorate})`,
          );
        }
        return { cNo: cNo ?? -1, votes };
      });
      return { ...b, partyVotes: party, candidateVotes: candidate };
    });
    if (problems.size) {
      console.error(`\n${problems.size} problem(s); nothing written:`);
      for (const p of problems) console.error(`  - ${p}`);
      process.exitCode = 1;
      return;
    }
    const partyRows = resolved.reduce((n, b) => n + b.partyVotes.length, 0);
    const candidateRows = resolved.reduce(
      (n, b) => n + b.candidateVotes.length,
      0,
    );
    const [{ count: existing }] = await sql<{ count: number }[]>`
      select count(*)::int as count from booth_results where stage = ${stage}`;
    console.log(
      `  All names matched. Would write ${places.size.toLocaleString()} voting places, ${resolved.length.toLocaleString()} booth results, ${partyRows.toLocaleString()} party votes and ${candidateRows.toLocaleString()} candidate votes,`,
    );
    console.log(
      `  replacing ${existing.toLocaleString()} existing ${stage} booth results.`,
    );
    if (!write) {
      console.log("\nDry run. Re-run with --write to load it.");
      return;
    }

    await sql.begin(async (tx) => {
      const placeIds = new Map<string, number>();
      const placeRows = [...places.values()].map((b) => ({
        name: b.place,
        lat: b.lat,
        lon: b.lon,
        geo_precision: b.geoPrecision,
      }));
      for (const chunk of chunks(placeRows, 1000)) {
        const ids = await tx<{ id: number; name: string }[]>`
          insert into voting_places ${tx(chunk)}
          on conflict (name) do update set
            lat = excluded.lat,
            lon = excluded.lon,
            geo_precision = excluded.geo_precision
          returning id, name`;
        for (const r of ids) placeIds.set(r.name, r.id);
      }

      // Cascades to booth_party_votes and booth_candidate_votes.
      await tx`delete from booth_results where stage = ${stage}`;

      const partyVotes: {
        booth_result_id: number;
        p_no: number;
        votes: number;
      }[] = [];
      const candidateVotes: {
        booth_result_id: number;
        c_no: number;
        votes: number;
      }[] = [];
      for (const chunk of chunks(resolved, 1000)) {
        const ids = await tx<
          {
            id: number;
            e_no: number;
            voting_place_id: number;
            section: string;
          }[]
        >`
          insert into booth_results ${tx(
            chunk.map((b) => ({
              stage,
              e_no: b.eNo,
              voting_place_id: placeIds.get(b.place) as number,
              section: b.section,
              party_informals: b.partyInformals,
              candidate_informals: b.candidateInformals,
            })),
          )}
          returning id, e_no, voting_place_id, section`;
        const idOf = new Map(
          ids.map((r) => [`${r.e_no}|${r.voting_place_id}|${r.section}`, r.id]),
        );
        for (const b of chunk) {
          const id = idOf.get(
            `${b.eNo}|${placeIds.get(b.place)}|${b.section}`,
          ) as number;
          for (const v of b.partyVotes) {
            partyVotes.push({
              booth_result_id: id,
              p_no: v.pNo,
              votes: v.votes,
            });
          }
          for (const v of b.candidateVotes) {
            candidateVotes.push({
              booth_result_id: id,
              c_no: v.cNo,
              votes: v.votes,
            });
          }
        }
      }
      for (const chunk of chunks(partyVotes, 10_000)) {
        await tx`insert into booth_party_votes ${tx(chunk)}`;
      }
      for (const chunk of chunks(candidateVotes, 10_000)) {
        await tx`insert into booth_candidate_votes ${tx(chunk)}`;
      }
    });
    console.log(
      `\nLoaded ${stage}. Electorate pages pick it up within the hour, or on the next deploy.`,
    );
  } finally {
    await sql.end();
  }
}

function chunks<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
