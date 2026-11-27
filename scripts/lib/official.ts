/**
 * The distilled official count (imports/official-<year>.json): written by
 * scripts/distil-official.ts, loaded by scripts/import-official.ts.
 *
 * Names are the Commission's spelling; the importer matches them to the
 * stored parties, candidates and electorates.
 */
export type OfficialResults = {
  /** The results site the pages came from. */
  source: string;
  /**
   * When the pages were saved (ISO). The site gives no release time, so this
   * is the snapshot's `updated` time: re-importing the same file is a no-op,
   * and a later release (a recount, or the E9 statistics) gets a newer one.
   */
  fetchedAt: string;
  parties: {
    name: string;
    votes: number;
    percent: number;
    electorateSeats: number;
    listSeats: number;
    totalSeats: number;
  }[];
  electorates: {
    eNo: number;
    name: string;
    /** Party votes plus party informals: the "VOTES COUNTED" line. */
    votesCounted: number;
    candidateInformals: number;
    partyInformals: number;
    candidates: { name: string; votes: number }[];
    parties: { name: string; votes: number }[];
  }[];
  /** Every MP declared elected. `eNo` is null for a list seat. */
  successful: { party: string; name: string; eNo: number | null }[];
};
