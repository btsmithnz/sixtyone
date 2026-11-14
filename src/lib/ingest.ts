import "server-only";
import { sql as dsql } from "drizzle-orm";
import mapData from "@/data/electorate-map.json";
import { db, schema } from "@/db";
import { slugify } from "@/lib/text";
import type {
  FeedCandidate,
  FeedElection,
  FeedElectorate,
  FeedElectorateResult,
  FeedParty,
} from "./feed/parse";
import type { CountStage } from "./stage";

/** How a snapshot is stored: when it was fetched, and which count it's from. */
type StoreOptions = { capturedAt?: Date; stage?: CountStage };

const slugByENo = new Map(
  [...mapData.general, ...mapData.maori].map((e) => [e.eNo, e.slug]),
);

export async function upsertReference(ref: {
  parties: FeedParty[];
  electorates: FeedElectorate[];
  candidates: FeedCandidate[];
}) {
  await db.transaction(async (tx) => {
    if (ref.parties.length) {
      await tx
        .insert(schema.parties)
        .values(ref.parties)
        .onConflictDoUpdate({
          target: schema.parties.pNo,
          set: {
            abbrev: dsql`excluded.abbrev`,
            shortName: dsql`excluded.short_name`,
            name: dsql`excluded.name`,
            registered: dsql`excluded.registered`,
          },
        });
    }
    if (ref.electorates.length) {
      await tx
        .insert(schema.electorates)
        .values(
          ref.electorates.map((e) => ({
            ...e,
            slug: slugByENo.get(e.eNo) ?? slugify(e.name),
            kind: e.eNo > 64 ? ("maori" as const) : ("general" as const),
          })),
        )
        .onConflictDoUpdate({
          target: schema.electorates.eNo,
          set: { name: dsql`excluded.name` },
        });
    }
    if (ref.candidates.length) {
      await tx
        .insert(schema.candidates)
        .values(ref.candidates)
        .onConflictDoUpdate({
          target: schema.candidates.cNo,
          set: {
            name: dsql`excluded.name`,
            eNo: dsql`excluded.e_no`,
            pNo: dsql`excluded.p_no`,
            listNo: dsql`excluded.list_no`,
          },
        });
    }
  });
}

/** Stores a national snapshot. Returns false if this `updated` was already stored. */
export async function storeElection(
  e: FeedElection,
  { capturedAt = new Date(), stage = "preliminary" }: StoreOptions = {},
): Promise<boolean> {
  if (!e.updatedAt) throw new Error("election.xml has no updated timestamp");
  const updatedAt = e.updatedAt;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.electionSnapshots)
      .values({
        feedUpdatedAt: updatedAt,
        capturedAt,
        stage,
        votingPlacesCounted: e.votingPlacesCounted,
        percentVotingPlacesCounted: e.percentVotingPlacesCounted,
        totalVotesCast: e.totalVotesCast,
        percentVotesCast: e.percentVotesCast,
        electoratesFinal: e.electoratesFinal,
        percentElectoratesFinal: e.percentElectoratesFinal,
        minimalVotes: e.minimalVotes,
        specialVotes: e.specialVotes,
      })
      .onConflictDoNothing()
      .returning({ id: schema.electionSnapshots.id });
    if (!row) return false;
    if (e.parties.length) {
      await tx
        .insert(schema.electionPartySnapshots)
        .values(e.parties.map((p) => ({ ...p, snapshotId: row.id })));
    }
    return true;
  });
}

/** Stores an electorate snapshot. Returns false if this `updated` was already stored. */
export async function storeElectorate(
  r: FeedElectorateResult,
  { capturedAt = new Date(), stage = "preliminary" }: StoreOptions = {},
): Promise<boolean> {
  if (!r.updatedAt) throw new Error(`e${r.eNo}.xml has no updated timestamp`);
  const updatedAt = r.updatedAt;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.electorateSnapshots)
      .values({
        eNo: r.eNo,
        feedUpdatedAt: updatedAt,
        capturedAt,
        stage,
        final: r.final,
        totalVotingPlaces: r.totalVotingPlaces,
        votingPlacesCounted: r.votingPlacesCounted,
        percentVotingPlacesCounted: r.percentVotingPlacesCounted,
        totalVotesCast: r.totalVotesCast,
        percentVotesCast: r.percentVotesCast,
        partyInformals: r.partyInformals,
        candidateInformals: r.candidateInformals,
      })
      .onConflictDoNothing()
      .returning({ id: schema.electorateSnapshots.id });
    if (!row) return false;
    if (r.candidateVotes.length) {
      await tx
        .insert(schema.electorateCandidateVotes)
        .values(r.candidateVotes.map((c) => ({ ...c, snapshotId: row.id })));
    }
    if (r.partyVotes.length) {
      await tx
        .insert(schema.electoratePartyVotes)
        .values(r.partyVotes.map((p) => ({ ...p, snapshotId: row.id })));
    }
    return true;
  });
}
