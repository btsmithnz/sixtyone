/**
 * Parsers for the Electoral Commission XML feed.
 * See docs/electoral-commission-feed.md for the format.
 *
 * The parsers are deliberately lenient: unknown elements are ignored and
 * missing/empty numbers become 0, so small format changes on the night don't
 * take the site down.
 */
import { XMLParser } from "fast-xml-parser";
import { parseNzLocal } from "./time";

const ARRAY_TAGS = new Set(["party", "candidate", "electorate", "votingplace"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // The feed uses numeric references like &#39; (O'NEILL), not just &amp;.
  htmlEntities: true,
  isArray: (name, jpath) =>
    // Only list elements, not the <electorate> root of eNN.xml.
    ARRAY_TAGS.has(name) && String(jpath).includes("."),
});

type Node = Record<string, unknown>;

const num = (v: unknown) => {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : 0;
};
const int = (v: unknown) => Math.round(num(v));
const str = (v: unknown) =>
  v === undefined || v === null ? "" : String(v).trim();
const list = (v: unknown): Node[] =>
  Array.isArray(v) ? (v as Node[]) : v ? [v as Node] : [];

function root(xml: string, tag: string): Node {
  const doc = parser.parse(xml) as Node;
  const node = doc[tag];
  if (!node || typeof node !== "object") {
    throw new Error(`Expected <${tag}> root element`);
  }
  return node as Node;
}

function updatedAt(node: Node) {
  const raw = str(node["@updated"]);
  return raw ? parseNzLocal(raw) : null;
}

/** Throws unless the body looks complete (the feed sometimes truncates). */
export function assertComplete(xml: string, rootTag: string) {
  if (!xml.trimEnd().endsWith(`</${rootTag}>`)) {
    throw new Error(`Truncated XML: missing </${rootTag}>`);
  }
}

/* ---------------------------- reference ---------------------------- */

export type FeedParty = {
  pNo: number;
  abbrev: string;
  shortName: string;
  name: string;
  registered: boolean;
};

export function parseParties(xml: string): FeedParty[] {
  return list(root(xml, "parties").party).map((p) => ({
    pNo: int(p["@p_no"]),
    abbrev: str(p.abbrev),
    shortName: str(p.short_name),
    name: str(p.party_name),
    registered: str(p.registered).toLowerCase() === "yes",
  }));
}

export type FeedElectorate = { eNo: number; name: string };

export function parseElectorates(xml: string): FeedElectorate[] {
  return list(root(xml, "electorates").electorate).map((e) => ({
    eNo: int(e["@e_no"]),
    name: str(e.electorate_name),
  }));
}

export type FeedCandidate = {
  cNo: number;
  name: string;
  eNo: number | null;
  pNo: number | null;
  listNo: number | null;
};

export function parseCandidates(xml: string): FeedCandidate[] {
  const orNull = (v: unknown) => int(v) || null;
  return list(root(xml, "candidates").candidate).map((c) => ({
    cNo: int(c["@c_no"]),
    name: str(c.candidate_name),
    eNo: orNull(c.electorate),
    pNo: orNull(c.party),
    listNo: orNull(c.list_no),
  }));
}

/* ----------------------------- results ----------------------------- */

export type FeedElection = {
  updatedAt: Date | null;
  votingPlacesCounted: number;
  percentVotingPlacesCounted: number;
  totalVotesCast: number;
  percentVotesCast: number;
  electoratesFinal: number;
  percentElectoratesFinal: number;
  minimalVotes: number;
  specialVotes: number;
  parties: {
    pNo: number;
    votes: number;
    percentVotes: number;
    partySeats: number;
    candidateSeats: number;
    totalSeats: number;
  }[];
};

export function parseElection(xml: string): FeedElection {
  const r = root(xml, "election");
  const s = (r.statistics ?? {}) as Node;
  return {
    updatedAt: updatedAt(r),
    votingPlacesCounted: int(s.total_voting_places_counted),
    percentVotingPlacesCounted: num(s.percent_voting_places_counted),
    totalVotesCast: int(s.total_votes_cast),
    percentVotesCast: num(s.percent_votes_cast),
    electoratesFinal: int(s.total_electorates_final),
    percentElectoratesFinal: num(s.percent_electorates_final),
    minimalVotes: int(s.total_minimal_votes),
    specialVotes: int(s.total_special_votes),
    parties: list((r.partystatus as Node | undefined)?.party).map((p) => ({
      pNo: int(p["@p_no"]),
      votes: int(p.votes),
      percentVotes: num(p.percent_votes),
      partySeats: int(p.party_seats),
      candidateSeats: int(p.candidate_seats),
      totalSeats: int(p.total_seats),
    })),
  };
}

export type FeedElectorateResult = {
  eNo: number;
  updatedAt: Date | null;
  final: boolean;
  totalVotingPlaces: number;
  votingPlacesCounted: number;
  percentVotingPlacesCounted: number;
  totalVotesCast: number;
  percentVotesCast: number;
  partyInformals: number;
  candidateInformals: number;
  partyVotes: { pNo: number; votes: number }[];
  candidateVotes: { cNo: number; votes: number }[];
};

export function parseElectorateResult(xml: string): FeedElectorateResult {
  const r = root(xml, "electorate");
  const s = (r.statistics ?? {}) as Node;
  return {
    eNo: int(r["@e_no"]),
    updatedAt: updatedAt(r),
    final: str(r["@final"]).toLowerCase() === "true",
    totalVotingPlaces: int(s.total_voting_places),
    votingPlacesCounted: int(s.total_voting_places_counted),
    percentVotingPlacesCounted: num(s.percent_voting_places_counted),
    totalVotesCast: int(s.total_votes_cast),
    percentVotesCast: num(s.percent_votes_cast),
    partyInformals: int(s.total_party_informals),
    candidateInformals: int(s.total_candidate_informals),
    partyVotes: list((r.partyvotes as Node | undefined)?.party).map((p) => ({
      pNo: int(p["@p_no"]),
      votes: int(p.votes),
    })),
    candidateVotes: list((r.candidatevotes as Node | undefined)?.candidate).map(
      (c) => ({ cNo: int(c["@c_no"]), votes: int(c.votes) }),
    ),
  };
}
