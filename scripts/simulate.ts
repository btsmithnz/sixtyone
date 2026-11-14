/**
 * Simulates an election night so the site can be built and tested before
 * real results exist (the live feed is all zeros until 7pm on 7 Nov 2026).
 *
 * It takes the real parties, candidates and electorates from the feed, makes
 * up plausible results, writes them out as feed-shaped XML (the same format as
 * election.xml and eNN.xml), and pushes that XML through the real parsers and
 * ingest code. Snapshots are spread across a simulated 7:30pm–11:45pm count.
 *
 *   pnpm simulate                # reset results, simulate the whole night
 *   pnpm simulate --steps 20     # fewer snapshots
 *   pnpm simulate --until 0.6    # stop when ~60% of the count is in
 *   pnpm simulate --seed 7       # a different (deterministic) night
 *   pnpm simulate --official     # add an official count to what's stored
 *
 * --official doesn't touch election night. It takes the preliminary results
 * already stored (simulated or real), adds special votes that lean the way
 * they did in 2023 plus small recount corrections, and stores that as the
 * official count (see docs/official-results.md). Run it again to replace it.
 *
 * ⚠️ Deletes stored results (only official ones with --official). Refuses
 * non-local databases unless you pass --allow-remote (e.g. for a throwaway
 * preview branch).
 */
import { parseArgs } from "node:util";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { sql as client, db, schema } from "@/db";
import { fetchFeedFile } from "@/lib/feed/fetch";
import {
  parseCandidates,
  parseElection,
  parseElectorateResult,
  parseElectorates,
  parseParties,
} from "@/lib/feed/parse";
import { formatNzLocal, parseNzLocal } from "@/lib/feed/time";
import { storeElection, storeElectorate, upsertReference } from "@/lib/ingest";
import { allocateSeats } from "@/lib/seats";
import { leanOf, presetLeans } from "@/lib/specials";

const { values: args } = parseArgs({
  options: {
    steps: { type: "string", default: "36" },
    until: { type: "string", default: "1" },
    seed: { type: "string", default: "61" },
    official: { type: "boolean", default: false },
    "allow-remote": { type: "boolean", default: false },
  },
});
const STEPS = Number(args.steps);
const UNTIL = Number(args.until);

// This wipes every stored result, so only run it against a local database
// unless explicitly told otherwise.
{
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost")
    .hostname;
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  if (
    process.env.VERCEL_ENV === "production" ||
    (!local && !args["allow-remote"])
  ) {
    throw new Error(
      `Refusing to wipe results on ${host}. simulate only runs against a local database (pass --allow-remote to override).`,
    );
  }
}

/* ------------------------------ randomness ------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(Number(args.seed));
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const gauss = () => {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/* --------------------------- the "true" result --------------------------- */

/** Final national party vote shares (%), by abbreviation. A tight race. */
const NATIONAL: Record<string, number> = {
  NAT: 30.5,
  LAB: 31,
  GP: 10.5,
  ACT: 8.2,
  NZF: 8.8,
  TPMAO: 3.6,
  OPP: 2.4,
  NC: 1.1,
  NLY: 0.9,
  ALCP: 0.5,
  WRP: 0.4,
  OFP: 0.4,
  FPT: 0.3,
  VNZ: 0.3,
  AJP: 0.3,
  APN: 0.2,
  TTTP: 0.2,
};
/** Māori electorates vote very differently. */
const MAORI: Record<string, number> = {
  LAB: 34,
  TPMAO: 28,
  GP: 11,
  NZF: 8,
  NAT: 7,
  ACT: 2,
  OPP: 2,
  TTTP: 2,
  NLY: 1.5,
  ALCP: 1.5,
};
/**
 * Advance votes are counted first and lean right, so early results drift.
 * Added (in points) to the running share, scaled by how much is uncounted.
 */
const EARLY_DRIFT: Record<string, number> = {
  NAT: 3,
  ACT: 1,
  LAB: -2,
  GP: -1.5,
  TPMAO: -0.5,
};

async function main() {
  if (args.official) return addOfficialCount();
  console.log("Fetching reference data from the live feed…");
  const ref = async (path: string, tag: string) => {
    const res = await fetchFeedFile(path, { rootTag: tag });
    if (res.status !== "ok") throw new Error(`No ${path}`);
    return res.body;
  };
  const [partiesXml, electoratesXml, candidatesXml] = await Promise.all([
    ref("parties.xml", "parties"),
    ref("electorates.xml", "electorates"),
    ref("candidates.xml", "candidates"),
  ]);
  const parties = parseParties(partiesXml);
  const electorates = parseElectorates(electoratesXml);
  const candidates = parseCandidates(candidatesXml);
  await upsertReference({ parties, electorates, candidates });

  console.log("Clearing stored results…");
  await db.execute(
    sql`truncate election_snapshots, election_party_snapshots, electorate_snapshots, electorate_candidate_votes, electorate_party_votes, feed_files, scrape_runs restart identity cascade`,
  );

  const registered = parties.filter((p) => p.registered);
  const abbrevOf = new Map(parties.map((p) => [p.pNo, p.abbrev]));

  // Per-electorate final shares, counts and pace.
  const sims = electorates.map((e) => {
    const maori = e.eNo > 64;
    const base = maori ? MAORI : NATIONAL;
    // Left/right lean for general electorates.
    const lean = maori ? 0 : gauss() * 9;
    const shares = new Map<number, number>();
    for (const p of registered) {
      let s = base[p.abbrev] ?? 0.15;
      if (p.abbrev === "NAT" || p.abbrev === "ACT") s *= 1 + lean / 30;
      if (p.abbrev === "LAB" || p.abbrev === "GP") s *= 1 - lean / 30;
      s *= Math.exp(gauss() * 0.12);
      shares.set(p.pNo, Math.max(0.05, s));
    }
    const sum = [...shares.values()].reduce((a, b) => a + b, 0);
    for (const [k, v] of shares) shares.set(k, v / sum);

    // Candidate strength ≈ party strength in the electorate × personal vote.
    const stand = candidates.filter((c) => c.eNo === e.eNo);
    const strength = new Map<number, number>();
    for (const c of stand) {
      const ps = c.pNo ? (shares.get(c.pNo) ?? 0.01) : 0.02;
      const big = c.pNo && ["NAT", "LAB"].includes(abbrevOf.get(c.pNo) ?? "");
      const personal = Math.exp(gauss() * 0.35) * (big ? 1.25 : 1);
      strength.set(c.cNo, ps ** 1.25 * personal);
    }
    const cSum = [...strength.values()].reduce((a, b) => a + b, 0) || 1;
    for (const [k, v] of strength) strength.set(k, v / cSum);

    const totalPlaces = maori
      ? Math.round(between(200, 800))
      : Math.round(between(30, 120));
    const finalVotes = Math.round(between(31000, 41000) * (maori ? 0.7 : 1));
    return {
      eNo: e.eNo,
      maori,
      shares,
      strength,
      totalPlaces,
      finalVotes,
      // Rural and Māori electorates report later and more slowly.
      start: maori ? between(0.08, 0.2) : between(0, 0.12),
      pace: maori ? between(0.75, 0.95) : between(0.9, 1.25),
      lastCounted: -1,
    };
  });

  // Simulated clock: polls close at 7pm NZDT, first results ~7:30pm.
  const t0 = parseNzLocal("2026-11-07T19:30:00").getTime();
  const t1 = parseNzLocal("2026-11-07T23:45:00").getTime();

  for (let step = 0; step <= STEPS; step++) {
    const night = step / STEPS;
    if (night > UNTIL) break;
    const now = new Date(t0 + (t1 - t0) * night);
    const stamp = formatNzLocal(now);

    const nationalParty = new Map<number, number>();
    const leaders: { eNo: number; pNo: number | null }[] = [];
    let placesCounted = 0;
    let places = 0;
    let votesCast = 0;
    let electoratesFinal = 0;
    let changedElectorates = 0;

    for (const s of sims) {
      // S-curve of counting progress for this electorate.
      const local = Math.min(
        1,
        Math.max(0, (night - s.start) / (1 - s.start)) * s.pace,
      );
      const progress = local >= 0.98 ? 1 : 1 - (1 - local) ** 1.6;
      const counted = Math.round(s.totalPlaces * progress);
      const votes = Math.round(s.finalVotes * progress);
      places += s.totalPlaces;
      placesCounted += counted;
      votesCast += votes;
      if (counted === s.totalPlaces) electoratesFinal++;

      const drift = (1 - progress) * 0.9;
      const partyVotes = registered.map((p) => {
        const share =
          (s.shares.get(p.pNo) ?? 0) +
          ((EARLY_DRIFT[p.abbrev] ?? 0) / 100) * drift +
          gauss() * 0.004 * (1 - progress);
        return { pNo: p.pNo, votes: Math.max(0, Math.round(votes * share)) };
      });
      for (const pv of partyVotes) {
        nationalParty.set(pv.pNo, (nationalParty.get(pv.pNo) ?? 0) + pv.votes);
      }
      const candidateVotes = [...s.strength.entries()].map(([cNo, share]) => {
        const c = candidates.find((x) => x.cNo === cNo);
        const d = c?.pNo ? (EARLY_DRIFT[abbrevOf.get(c.pNo) ?? ""] ?? 0) : 0;
        const sh = share + (d / 100) * drift + gauss() * 0.006 * (1 - progress);
        return { cNo, votes: Math.max(0, Math.round(votes * 0.985 * sh)) };
      });
      const lead = [...candidateVotes].sort((a, b) => b.votes - a.votes)[0];
      if (lead && lead.votes > 0) {
        leaders.push({
          eNo: s.eNo,
          pNo: candidates.find((c) => c.cNo === lead.cNo)?.pNo ?? null,
        });
      }

      // Only "publish" a new file when this electorate's count moved.
      if (counted !== s.lastCounted) {
        s.lastCounted = counted;
        const xml = electorateXml({
          eNo: s.eNo,
          stamp,
          final: counted === s.totalPlaces,
          totalPlaces: s.totalPlaces,
          counted,
          votes,
          partyVotes,
          candidateVotes,
        });
        if (
          await storeElectorate(parseElectorateResult(xml), { capturedAt: now })
        ) {
          changedElectorates++;
        }
      }
    }

    const wins = new Map<number, number>();
    let independentWins = 0;
    for (const l of leaders) {
      if (l.pNo === null) independentWins++;
      else wins.set(l.pNo, (wins.get(l.pNo) ?? 0) + 1);
    }
    const seats = allocateSeats({
      partyVotes: nationalParty,
      electorateWins: wins,
      independentWins,
    });
    const totalPartyVotes = [...nationalParty.values()].reduce(
      (a, b) => a + b,
      0,
    );
    const xml = electionXml({
      stamp,
      placesCounted,
      percentPlaces: (placesCounted / places) * 100,
      votesCast,
      percentVotesCast: (votesCast / 3633546) * 100,
      electoratesFinal,
      parties: registered.map((p) => {
        const votes = nationalParty.get(p.pNo) ?? 0;
        const seat = seats.parties.find((x) => x.pNo === p.pNo);
        return {
          pNo: p.pNo,
          votes,
          percent: totalPartyVotes ? (votes / totalPartyVotes) * 100 : 0,
          partySeats: seat?.listSeats ?? 0,
          candidateSeats: seat?.electorateSeats ?? 0,
        };
      }),
    });
    await storeElection(parseElection(xml), { capturedAt: now });
    console.log(
      `${stamp}  ${((placesCounted / places) * 100).toFixed(1).padStart(5)}% counted  ${String(changedElectorates).padStart(2)} electorates updated`,
    );
  }
  console.log("Done. Start the app with `pnpm dev`.");
}

/**
 * The official count: election night's final votes in each electorate, plus
 * special votes split the way they leaned in 2023, plus a little recount
 * noise. Specials add more in Māori electorates, as they do for real.
 */
async function addOfficialCount() {
  const s = schema.electorateSnapshots;
  const nights = await db
    .selectDistinctOn([s.eNo])
    .from(s)
    .where(eq(s.stage, "preliminary"))
    .orderBy(s.eNo, desc(s.feedUpdatedAt));
  if (!nights.length) {
    throw new Error(
      "No preliminary results stored: run `pnpm simulate` first.",
    );
  }
  const ids = nights.map((n) => n.id);
  const [cRows, pRows, candidates, parties] = await Promise.all([
    db
      .select()
      .from(schema.electorateCandidateVotes)
      .where(inArray(schema.electorateCandidateVotes.snapshotId, ids)),
    db
      .select()
      .from(schema.electoratePartyVotes)
      .where(inArray(schema.electoratePartyVotes.snapshotId, ids)),
    db.select().from(schema.candidates),
    db.select().from(schema.parties).where(eq(schema.parties.registered, true)),
  ]);

  console.log("Clearing any stored official count…");
  await db
    .delete(schema.electionSnapshots)
    .where(eq(schema.electionSnapshots.stage, "official"));
  await db
    .delete(schema.electorateSnapshots)
    .where(eq(schema.electorateSnapshots.stage, "official"));

  const now = parseNzLocal("2026-11-27T14:00:00");
  const stamp = formatNzLocal(now);
  const leans = presetLeans(2023);
  const pNoOf = new Map(candidates.map((c) => [c.cNo, c.pNo]));
  /** Share `total` out in proportion to the weights. */
  const split = <K>(weights: [K, number][], total: number) => {
    const sum = weights.reduce((a, [, w]) => a + w, 0) || 1;
    return new Map(weights.map(([k, w]) => [k, Math.round((w / sum) * total)]));
  };
  const recount = (votes: number) =>
    Math.max(0, votes + Math.round(gauss() * votes * 0.002));

  const nationalParty = new Map<number, number>();
  const wins = new Map<number, number>();
  let independentWins = 0;
  let votesCast = 0;
  let specialVotes = 0;
  for (const night of nights) {
    const before = {
      party: pRows.filter((r) => r.snapshotId === night.id),
      candidate: cRows.filter((r) => r.snapshotId === night.id),
    };
    const total = before.party.reduce((a, p) => a + p.votes, 0);
    const specials = Math.round(
      total * between(0.12, night.eNo > 64 ? 0.3 : 0.22),
    );
    specialVotes += specials;

    const partySpecials = split(
      before.party.map((p) => [
        p.pNo,
        p.votes * leanOf(leans, p.pNo) * Math.exp(gauss() * 0.1),
      ]),
      specials,
    );
    const partyVotes = before.party.map((p) => ({
      pNo: p.pNo,
      votes: recount(p.votes) + (partySpecials.get(p.pNo) ?? 0),
    }));
    const candidateSpecials = split(
      before.candidate.map((c) => [
        c.cNo,
        c.votes *
          leanOf(leans, pNoOf.get(c.cNo) ?? 0) *
          Math.exp(gauss() * 0.15),
      ]),
      Math.round(specials * 0.97),
    );
    const candidateVotes = before.candidate.map((c) => ({
      cNo: c.cNo,
      votes: recount(c.votes) + (candidateSpecials.get(c.cNo) ?? 0),
    }));

    const votes = partyVotes.reduce((a, p) => a + p.votes, 0);
    votesCast += votes;
    for (const p of partyVotes) {
      nationalParty.set(p.pNo, (nationalParty.get(p.pNo) ?? 0) + p.votes);
    }
    const lead = [...candidateVotes].sort((a, b) => b.votes - a.votes)[0];
    const leadParty = lead ? pNoOf.get(lead.cNo) : null;
    if (leadParty) wins.set(leadParty, (wins.get(leadParty) ?? 0) + 1);
    else independentWins++;

    const xml = electorateXml({
      eNo: night.eNo,
      stamp,
      final: true,
      totalPlaces: night.totalVotingPlaces,
      counted: night.totalVotingPlaces,
      votes,
      partyVotes,
      candidateVotes,
    });
    await storeElectorate(parseElectorateResult(xml), {
      capturedAt: now,
      stage: "official",
    });
  }

  const seats = allocateSeats({
    partyVotes: nationalParty,
    electorateWins: wins,
    independentWins,
  });
  const totalPartyVotes = [...nationalParty.values()].reduce(
    (a, b) => a + b,
    0,
  );
  const xml = electionXml({
    stamp,
    placesCounted: nights.reduce((a, n) => a + n.totalVotingPlaces, 0),
    percentPlaces: 100,
    votesCast,
    percentVotesCast: (votesCast / 3633546) * 100,
    electoratesFinal: nights.length,
    specialVotes,
    parties: parties.map((p) => {
      const votes = nationalParty.get(p.pNo) ?? 0;
      const seat = seats.parties.find((x) => x.pNo === p.pNo);
      return {
        pNo: p.pNo,
        votes,
        percent: totalPartyVotes ? (votes / totalPartyVotes) * 100 : 0,
        partySeats: seat?.listSeats ?? 0,
        candidateSeats: seat?.electorateSeats ?? 0,
      };
    }),
  });
  await storeElection(parseElection(xml), {
    capturedAt: now,
    stage: "official",
  });
  console.log(
    `${stamp}  official count stored, with ${specialVotes.toLocaleString("en-NZ")} special votes`,
  );
}

/* ------------------------- feed-shaped XML output ------------------------- */

function electorateXml(e: {
  eNo: number;
  stamp: string;
  final: boolean;
  totalPlaces: number;
  counted: number;
  votes: number;
  partyVotes: { pNo: number; votes: number }[];
  candidateVotes: { cNo: number; votes: number }[];
}) {
  const pct = ((e.counted / e.totalPlaces) * 100).toFixed(1);
  return `<?xml version="1.0" encoding="UTF-8"?>
<electorate e_no="${e.eNo}" final="${e.final}" updated="${e.stamp}">
    <statistics>
        <total_voting_places>${e.totalPlaces}</total_voting_places>
        <total_voting_places_counted>${e.counted}</total_voting_places_counted>
        <percent_voting_places_counted>${pct}</percent_voting_places_counted>
        <total_votes_cast>${e.votes}</total_votes_cast>
        <percent_votes_cast>${((e.votes / 51177) * 100).toFixed(1)}</percent_votes_cast>
        <total_party_informals>${Math.round(e.votes * 0.004)}</total_party_informals>
        <total_candidate_informals>${Math.round(e.votes * 0.012)}</total_candidate_informals>
        <total_registered_parties>17</total_registered_parties>
        <total_candidates>${e.candidateVotes.length}</total_candidates>
    </statistics>
    <partyvotes>
${e.partyVotes.map((p) => `        <party p_no="${p.pNo}"><votes>${p.votes}</votes></party>`).join("\n")}
    </partyvotes>
    <candidatevotes>
${e.candidateVotes.map((c) => `        <candidate c_no="${c.cNo}"><votes>${c.votes}</votes></candidate>`).join("\n")}
    </candidatevotes>
</electorate>`;
}

function electionXml(e: {
  stamp: string;
  placesCounted: number;
  percentPlaces: number;
  votesCast: number;
  percentVotesCast: number;
  electoratesFinal: number;
  specialVotes?: number;
  parties: {
    pNo: number;
    votes: number;
    percent: number;
    partySeats: number;
    candidateSeats: number;
  }[];
}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<election updated="${e.stamp}">
    <statistics>
        <total_voting_places_counted>${e.placesCounted}</total_voting_places_counted>
        <percent_voting_places_counted>${e.percentPlaces.toFixed(1)}</percent_voting_places_counted>
        <total_votes_cast>${e.votesCast}</total_votes_cast>
        <percent_votes_cast>${e.percentVotesCast.toFixed(1)}</percent_votes_cast>
        <total_electorates_final>${e.electoratesFinal}</total_electorates_final>
        <percent_electorates_final>${((e.electoratesFinal / 71) * 100).toFixed(2)}</percent_electorates_final>
        <total_minimal_votes>0</total_minimal_votes>
        <total_special_votes>${e.specialVotes ?? 0}</total_special_votes>
        <total_registered_parties>17</total_registered_parties>
    </statistics>
    <partystatus>
${e.parties
  .map(
    (p) => `        <party p_no="${p.pNo}">
            <votes>${p.votes}</votes>
            <percent_votes>${p.percent.toFixed(2)}</percent_votes>
            <party_seats>${p.partySeats}</party_seats>
            <candidate_seats>${p.candidateSeats}</candidate_seats>
            <total_seats>${p.partySeats + p.candidateSeats}</total_seats>
        </party>`,
  )
  .join("\n")}
    </partystatus>
</election>`;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
