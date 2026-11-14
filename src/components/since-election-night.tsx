import Link from "next/link";
import { Change } from "@/components/change";
import { SectionHeading } from "@/components/section-heading";
import { formatInt, formatPct } from "@/lib/format";
import { displayCandidateName, partyColorVar, partyStyle } from "@/lib/parties";
import type { Overview } from "@/lib/results";
import { changedHands } from "@/lib/stage";

/**
 * Once the official count is in: what moved since election night. Seats,
 * party vote shares and electorates that changed hands; the details are on
 * the race to 61, the party vote and each electorate's page.
 */
export function SinceElectionNight({
  overview,
}: {
  overview: Pick<
    Overview,
    "parties" | "electorates" | "stats" | "houseSize" | "preliminary"
  >;
}) {
  const { parties, electorates, stats, houseSize, preliminary } = overview;
  if (!preliminary) return null;

  const seatMoves = parties
    .flatMap((p) =>
      p.preliminary && p.totalSeats !== p.preliminary.totalSeats
        ? [{ ...p, before: p.preliminary.totalSeats }]
        : [],
    )
    .sort((a, b) => b.totalSeats - b.before - (a.totalSeats - a.before));
  // The biggest movers among parties anyone would look for.
  const movers = parties
    .filter((p) => p.preliminary && (p.percent >= 1 || p.totalSeats > 0))
    .map((p) => ({ ...p, change: p.percent - (p.preliminary?.percent ?? 0) }))
    .filter((p) => Math.abs(p.change) >= 0.05)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 4);
  const flipped = electorates.filter(changedHands);
  const added = (stats?.totalVotesCast ?? 0) - preliminary.totalVotesCast;

  return (
    <section
      aria-labelledby="since-election-night"
      className="sticker p-5 sm:p-7"
    >
      <SectionHeading
        id="since-election-night"
        share="/#since-election-night"
        className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
      >
        What changed since election night
      </SectionHeading>
      <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
        {added > 0 ? (
          <>
            The official count has{" "}
            <span className="num font-semibold text-foreground">
              {formatInt(added)}
            </span>{" "}
            more votes, mostly special votes, and rechecks every vote counted on
            the night.
          </>
        ) : (
          "The official count adds special votes and rechecks every vote counted on the night."
        )}
      </p>

      <div className="mt-5 grid gap-6 md:grid-cols-3">
        <div>
          <h3 className="font-display text-xl font-bold [font-stretch:90%]">
            Seats
          </h3>
          {seatMoves.length ? (
            <ul className="mt-2 space-y-1.5">
              {seatMoves.map((p) => (
                <li key={p.pNo} className="flex items-center gap-2">
                  <PartyDot pNo={p.pNo} />
                  <span className="font-semibold">
                    {partyStyle(p.pNo, p.name).short}
                  </span>
                  <span className="num text-muted-foreground">
                    {p.before} → {p.totalSeats}
                  </span>
                  <Change
                    value={p.totalSeats - p.before}
                    unit="seats"
                    className="ml-auto font-semibold"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm">No party’s seats changed.</p>
          )}
          {houseSize !== preliminary.houseSize ? (
            <p className="mt-2 text-sm text-muted-foreground">
              The House is now <span className="num">{houseSize}</span> seats (
              <span className="num">{preliminary.houseSize}</span> on election
              night).
            </p>
          ) : null}
        </div>

        <div>
          <h3 className="font-display text-xl font-bold [font-stretch:90%]">
            Party vote
          </h3>
          {movers.length ? (
            <ul className="mt-2 space-y-1.5">
              {movers.map((p) => (
                <li key={p.pNo} className="flex items-center gap-2">
                  <PartyDot pNo={p.pNo} />
                  <span className="font-semibold">
                    {partyStyle(p.pNo, p.name).short}
                  </span>
                  <span className="num text-muted-foreground">
                    {formatPct(p.percent)}
                  </span>
                  <Change
                    value={p.change}
                    digits={1}
                    unit="points"
                    className="ml-auto font-semibold"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm">
              Every party’s share is within a whisker of election night.
            </p>
          )}
        </div>

        <div>
          <h3 className="font-display text-xl font-bold [font-stretch:90%]">
            Electorates
          </h3>
          {flipped.length ? (
            <ul className="mt-2 space-y-2.5 text-sm">
              {flipped.map((e) => {
                const [winner] = e.candidates;
                const before = e.preliminary;
                return (
                  <li key={e.eNo}>
                    <Link
                      href={`/electorates/${e.slug}`}
                      className="font-semibold underline-offset-2 hover:underline"
                    >
                      {e.name}
                    </Link>{" "}
                    changed hands: {displayCandidateName(winner.name)} (
                    {partyStyle(winner.pNo).short}) won by{" "}
                    <span className="num">{formatInt(e.margin ?? 0)}</span>.
                    {before?.leader ? (
                      <span className="text-muted-foreground">
                        {" "}
                        On election night{" "}
                        {displayCandidateName(before.leader.name)} (
                        {partyStyle(before.leader.pNo).short}) led by{" "}
                        <span className="num">
                          {formatInt(before.margin ?? 0)}
                        </span>
                        .
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm">
              None changed hands: every electorate went to the candidate ahead
              on election night.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function PartyDot({ pNo }: { pNo: number }) {
  return (
    <span
      aria-hidden
      className="size-3 shrink-0 rounded-full"
      style={{ background: partyColorVar(pNo) }}
    />
  );
}
