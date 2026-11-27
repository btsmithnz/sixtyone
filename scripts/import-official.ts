/**
 * Stores the official count from a distilled file (see scripts/distil-official.ts).
 *
 *   pnpm official:import                 # dry run of the newest imports/official-*.json
 *   pnpm official:import --write         # store it
 *   pnpm official:import path/to/official.json [--write]
 *
 * The build runs it with --write after migrating, so a deploy carries the
 * official count with it: a preview deployment imports into its Neon branch,
 * production into production. It's a no-op when:
 *   - there's no imports/official-*.json (the next election, until its count),
 *   - the database has no parties yet (a fresh local database), or
 *   - this file's count is already stored (its `fetchedAt` is the snapshot's
 *     `updated` time) or a newer official count is.
 * Any name that doesn't match a stored party, candidate or electorate fails
 * it before anything is written, which fails the build.
 *
 * The pages give no voting place counts, electors or special votes (those
 * come with the E9 statistics), so places come from election night's count,
 * and turnout and special votes are left at 0 (the site hides a 0 turnout).
 * Election night's roll is no stand-in: the official count includes people
 * who enrolled on election day.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema, sql } from "@/db";
import type { FeedElection, FeedElectorateResult } from "@/lib/feed/parse";
import { storeElection, storeElectorate } from "@/lib/ingest";
import { nameKey } from "./lib/names";
import type { OfficialResults } from "./lib/official";

const args = process.argv.slice(2);
const write = args.includes("--write");
const fileArg = args.find((a) => !a.startsWith("--"));
const importsDir = path.join(import.meta.dirname, "..", "imports");

async function findFile() {
  if (fileArg) return path.resolve(fileArg);
  const files = (await readdir(importsDir).catch(() => []))
    .filter((f) => /^official-.*\.json$/.test(f))
    .sort();
  const newest = files.at(-1);
  return newest ? path.join(importsDir, newest) : null;
}

const fmt = (n: number) => n.toLocaleString("en-NZ");
const signed = (n: number) =>
  n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : "±0";

async function main() {
  const file = await findFile();
  if (!file) {
    console.log(
      "Official count: no imports/official-*.json, nothing to import.",
    );
    return;
  }
  const official = JSON.parse(await readFile(file, "utf8")) as OfficialResults;
  const updatedAt = new Date(official.fetchedAt);
  if (Number.isNaN(updatedAt.getTime())) {
    throw new Error(`${file}: fetchedAt "${official.fetchedAt}" isn't a date`);
  }
  console.log(
    `Official count: ${path.relative(process.cwd(), file)} (saved ${official.fetchedAt})`,
  );

  const [parties, candidates, electorates] = await Promise.all([
    db.select().from(schema.parties),
    db.select().from(schema.candidates),
    db.select().from(schema.electorates),
  ]);
  if (!parties.length) {
    console.log("  No parties stored (a fresh database?), so skipping.");
    return;
  }

  const os = schema.electionSnapshots;
  const [stored] = await db
    .select({ feedUpdatedAt: os.feedUpdatedAt })
    .from(os)
    .where(and(eq(os.stage, "official"), gte(os.feedUpdatedAt, updatedAt)))
    .orderBy(desc(os.feedUpdatedAt))
    .limit(1);
  if (stored) {
    console.log(
      stored.feedUpdatedAt.getTime() === updatedAt.getTime()
        ? "  Already stored."
        : `  A newer official count (${stored.feedUpdatedAt.toISOString()}) is already stored, so skipping.`,
    );
    return;
  }

  /* -------------------------- match the names -------------------------- */
  const problems = new Set<string>();
  const partyByName = new Map<string, number>();
  for (const p of parties) {
    partyByName.set(nameKey(p.name), p.pNo);
    if (!partyByName.has(nameKey(p.shortName)))
      partyByName.set(nameKey(p.shortName), p.pNo);
  }
  const pNo = (name: string, where: string) => {
    const n = partyByName.get(nameKey(name));
    if (n === undefined) problems.add(`No party called "${name}" (${where})`);
    return n ?? -1;
  };
  const candidateByName = new Map(
    candidates
      .filter((c) => c.eNo !== null)
      .map((c) => [`${c.eNo}|${nameKey(c.name)}`, c.cNo]),
  );
  const electorateName = new Map(electorates.map((e) => [e.eNo, e.name]));

  for (const e of official.electorates) {
    const stored = electorateName.get(e.eNo);
    if (stored === undefined)
      problems.add(`No electorate ${e.eNo} (${e.name})`);
    else if (nameKey(stored) !== nameKey(e.name)) {
      problems.add(
        `Electorate ${e.eNo} is "${stored}" in the database but "${e.name}" in the file`,
      );
    }
  }
  if (official.electorates.length !== electorates.length) {
    problems.add(
      `${official.electorates.length} electorates in the file, ${electorates.length} in the database`,
    );
  }

  /* ------------------- election night, for the gaps ------------------- */
  const ps = schema.electorateSnapshots;
  const nights = new Map(
    (
      await db
        .selectDistinctOn([ps.eNo])
        .from(ps)
        .where(eq(ps.stage, "preliminary"))
        .orderBy(ps.eNo, desc(ps.feedUpdatedAt))
    ).map((n) => [n.eNo, n]),
  );
  const [night] = await db
    .select()
    .from(os)
    .where(eq(os.stage, "preliminary"))
    .orderBy(desc(os.feedUpdatedAt))
    .limit(1);
  const electorateResults: FeedElectorateResult[] = official.electorates.map(
    (e) => {
      const n = nights.get(e.eNo);
      return {
        eNo: e.eNo,
        updatedAt,
        final: true,
        totalVotingPlaces: n?.totalVotingPlaces ?? 0,
        votingPlacesCounted: n?.totalVotingPlaces ?? 0,
        percentVotingPlacesCounted: 100,
        totalVotesCast: e.votesCounted,
        percentVotesCast: 0,
        partyInformals: e.partyInformals,
        candidateInformals: e.candidateInformals,
        partyVotes: e.parties.map((p) => ({
          pNo: pNo(p.name, e.name),
          votes: p.votes,
        })),
        candidateVotes: e.candidates.map((c) => {
          const cNo = candidateByName.get(`${e.eNo}|${nameKey(c.name)}`);
          if (cNo === undefined)
            problems.add(`No candidate "${c.name}" in ${e.name}`);
          return { cNo: cNo ?? -1, votes: c.votes };
        }),
      };
    },
  );

  const totalVotes = official.electorates.reduce(
    (a, e) => a + e.votesCounted,
    0,
  );
  const election: FeedElection = {
    updatedAt,
    votingPlacesCounted: night?.votingPlacesCounted ?? 0,
    percentVotingPlacesCounted: 100,
    totalVotesCast: totalVotes,
    percentVotesCast: 0,
    electoratesFinal: official.electorates.length,
    percentElectoratesFinal: 100,
    minimalVotes: 0,
    specialVotes: 0,
    parties: official.parties.map((p) => ({
      pNo: pNo(p.name, "national"),
      votes: p.votes,
      percentVotes: p.percent,
      partySeats: p.listSeats,
      candidateSeats: p.electorateSeats,
      totalSeats: p.totalSeats,
    })),
  };

  if (problems.size) {
    console.error(`\n${problems.size} problem(s); nothing written:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
    return;
  }

  /* ---------------------- what changes, for review ---------------------- */
  const nightSeats = new Map(
    night
      ? (
          await db
            .select()
            .from(schema.electionPartySnapshots)
            .where(eq(schema.electionPartySnapshots.snapshotId, night.id))
        ).map((p) => [p.pNo, p.totalSeats])
      : [],
  );
  const nameOfParty = new Map(
    parties.map((p) => [p.pNo, p.shortName || p.name]),
  );
  console.log("  All names matched.");
  console.log(
    `  ${fmt(totalVotes)} votes, ${night ? `${signed(totalVotes - night.totalVotesCast)} since election night` : "no election night count stored"}`,
  );
  console.log("  Seats (change since election night):");
  for (const p of election.parties.filter(
    (x) => x.totalSeats || nightSeats.get(x.pNo),
  )) {
    const change = night
      ? ` (${signed(p.totalSeats - (nightSeats.get(p.pNo) ?? 0))})`
      : "";
    console.log(
      `    ${nameOfParty.get(p.pNo)}: ${p.totalSeats}${change}  ${p.percentVotes}%`,
    );
  }
  const cName = new Map(candidates.map((c) => [c.cNo, c.name]));
  const nightLeaders = new Map<number, number>();
  if (nights.size) {
    const eNoOf = new Map([...nights.values()].map((n) => [n.id, n.eNo]));
    const rows = await db
      .select()
      .from(schema.electorateCandidateVotes)
      .where(
        inArray(schema.electorateCandidateVotes.snapshotId, [...eNoOf.keys()]),
      );
    const best = new Map<number, { cNo: number; votes: number }>();
    for (const r of rows) {
      const eNo = eNoOf.get(r.snapshotId) as number;
      const b = best.get(eNo);
      if (!b || r.votes > b.votes) best.set(eNo, r);
    }
    for (const [eNo, b] of best) nightLeaders.set(eNo, b.cNo);
  }
  const flips = electorateResults.flatMap((e) => {
    const winner = [...e.candidateVotes].sort((a, b) => b.votes - a.votes)[0];
    const before = nightLeaders.get(e.eNo);
    return before !== undefined && before !== winner.cNo
      ? [
          `${electorateName.get(e.eNo)}: ${cName.get(before)} → ${cName.get(winner.cNo)}`,
        ]
      : [];
  });
  console.log(
    flips.length
      ? `  Changed hands since election night:\n${flips.map((f) => `    ${f}`).join("\n")}`
      : "  No electorate changed hands since election night.",
  );

  if (!write) {
    console.log("\nDry run. Re-run with --write to store it.");
    return;
  }
  // One transaction: nobody sees half an official count.
  await db.transaction(async (tx) => {
    const options = { stage: "official", tx } as const;
    for (const e of electorateResults) await storeElectorate(e, options);
    await storeElection(election, options);
  });
  console.log(
    `  Stored the official count for ${electorateResults.length} electorates.`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
