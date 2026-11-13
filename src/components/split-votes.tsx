import Link from "next/link";
import { SectionHeading } from "@/components/section-heading";
import { formatPct } from "@/lib/format";
import { displayCandidateName, partyColorVar, partyStyle } from "@/lib/parties";
import type { ElectorateSummary } from "@/lib/results";

/**
 * MMP gives everyone two votes. Where they part ways: electorates whose
 * candidate vote and party vote went to different parties, and the winners
 * who ran furthest ahead of their own party (their personal vote).
 */
export function SplitVotes({
  electorates,
}: {
  electorates: ElectorateSummary[];
}) {
  const reported = electorates.filter(
    (e) => e.margin !== null && e.partyVoteLeader,
  );
  if (reported.length === 0) return null;

  const splits = reported
    .filter((e) => e.candidates[0].pNo !== e.partyVoteLeader?.pNo)
    .map((e) => ({
      e,
      // How far the candidate's party trailed the party-vote winner here.
      gap: (e.partyVoteLeader?.percent ?? 0) - (e.leaderPartyPercent ?? 0),
    }))
    .sort((a, b) => b.gap - a.gap);

  const personal = reported
    .filter((e) => e.leaderPartyPercent !== null)
    .map((e) => ({
      e,
      lead: e.candidates[0],
      party: e.leaderPartyPercent ?? 0,
      edge: e.candidates[0].percent - (e.leaderPartyPercent ?? 0),
    }))
    .sort((a, b) => b.edge - a.edge)
    .slice(0, 6);

  return (
    <section
      aria-labelledby="split-votes"
      className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2"
    >
      <div className="sticker p-5 sm:p-7">
        <SectionHeading
          id="split-votes"
          share="/#split-votes"
          className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
        >
          Split votes
        </SectionHeading>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone gets two votes. In these electorates, the candidate vote and
          the party vote went to different parties.
        </p>
        <p className="mt-4 flex items-baseline gap-2">
          <span className="num font-display text-5xl leading-none font-extrabold tracking-tight [font-stretch:80%]">
            {splits.length}
          </span>
          <span className="text-base font-medium">
            of {reported.length} electorates
          </span>
        </p>
        {splits.length ? (
          <table className="mt-4 w-full table-fixed text-sm">
            <caption className="sr-only">
              Electorates where the candidate vote and party vote went to
              different parties
            </caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="w-[38%] pb-1 font-medium">
                  Electorate
                </th>
                <th scope="col" className="pb-1 font-medium">
                  Candidate vote
                </th>
                <th scope="col" className="pb-1 font-medium">
                  Party vote
                </th>
              </tr>
            </thead>
            <tbody>
              {splits.map(({ e }) => {
                const cand = e.candidates[0];
                const party = e.partyVoteLeader;
                return (
                  <tr key={e.eNo} className="border-t border-border align-top">
                    <th scope="row" className="py-2 pr-2 text-left">
                      <Link
                        href={`/electorates/${e.slug}`}
                        className="rounded font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {e.name}
                      </Link>
                    </th>
                    <td className="py-2 pr-2">
                      <Vote
                        pNo={cand.pNo}
                        detail={displayCandidateName(cand.name)}
                      />
                    </td>
                    <td className="py-2">
                      <Vote
                        pNo={party?.pNo ?? null}
                        detail={party ? formatPct(party.percent) : ""}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Every electorate’s candidate and party votes went the same way.
          </p>
        )}
      </div>

      <div className="sticker p-5 sm:p-7">
        <SectionHeading
          id="personal-votes"
          share="/#personal-votes"
          className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
        >
          Biggest personal votes
        </SectionHeading>
        <p className="mt-1 text-sm text-muted-foreground">
          Winners who ran furthest ahead of their own party’s vote in the same
          electorate.
        </p>
        <ol className="mt-4 space-y-4">
          {personal.map(({ e, lead, party, edge }) => {
            const color = partyColorVar(lead.pNo);
            const name = displayCandidateName(lead.name);
            const short = partyStyle(lead.pNo).short;
            return (
              <li key={e.eNo}>
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/electorates/${e.slug}`}
                    className="min-w-0 rounded hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="font-semibold">{name}</span>{" "}
                    <span className="text-sm text-muted-foreground">
                      {short}, {e.name}
                    </span>
                  </Link>
                  <span className="num shrink-0 font-display text-xl font-extrabold">
                    +{edge.toFixed(1)}
                    <span className="sr-only"> points</span>
                  </span>
                </div>
                <div className="mt-1.5 space-y-1" aria-hidden>
                  <Bar percent={lead.percent} color={color} />
                  <Bar percent={party} color={color} faded />
                </div>
                <p className="num mt-1 text-xs text-muted-foreground">
                  {formatPct(lead.percent)} candidate vote, {formatPct(party)}{" "}
                  party vote
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Vote({ pNo, detail }: { pNo: number | null; detail: string }) {
  return (
    <span className="flex min-w-0 gap-2">
      <span
        aria-hidden
        className="mt-1 size-3 shrink-0 rounded-full"
        style={{ background: partyColorVar(pNo) }}
      />
      <span className="min-w-0">
        <span className="block font-medium">{partyStyle(pNo).short}</span>
        {detail ? (
          <span className="block text-xs text-muted-foreground">{detail}</span>
        ) : null}
      </span>
    </span>
  );
}

function Bar({
  percent,
  color,
  faded,
}: {
  percent: number;
  color: string;
  faded?: boolean;
}) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(100, percent)}%`,
          background: color,
          opacity: faded ? 0.4 : 1,
        }}
      />
    </div>
  );
}
