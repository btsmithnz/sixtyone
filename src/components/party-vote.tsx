import { SectionHeading } from "@/components/section-heading";
import { formatInt, formatPct } from "@/lib/format";
import { partyColorVar, partyStyle } from "@/lib/parties";
import type { Overview } from "@/lib/results";

/** Party vote standings with a 5% threshold marker. */
export function PartyVote({
  parties,
  seatsSource,
}: {
  parties: Overview["parties"];
  seatsSource: Overview["seatsSource"];
}) {
  const max = Math.max(35, ...parties.map((p) => p.percent));
  const main = parties.filter((p) => p.percent >= 1 || p.totalSeats > 0);
  const rest = parties.filter((p) => !main.includes(p));
  const restPct = rest.reduce((a, p) => a + p.percent, 0);

  return (
    <section aria-labelledby="party-vote" className="sticker p-5 sm:p-7">
      <SectionHeading
        id="party-vote"
        share="/party-vote"
        className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
      >
        Party vote
      </SectionHeading>
      <p className="mt-1 text-sm text-muted-foreground">
        Parties need 5% or an electorate to get seats.
      </p>

      <ol className="mt-5 space-y-3.5">
        {main.map((p) => {
          const style = partyStyle(p.pNo, p.name);
          return (
            <li key={p.pNo}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{style.short}</span>
                <span className="num font-display text-2xl leading-none font-extrabold">
                  {formatPct(p.percent)}
                </span>
              </div>
              <div className="relative mt-1.5 h-3 rounded-full bg-secondary">
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{
                    width: `${(p.percent / max) * 100}%`,
                    background: partyColorVar(p.pNo),
                  }}
                />
                <div
                  aria-hidden
                  className="absolute -top-1 -bottom-1 w-0.5 rounded bg-ink/50"
                  style={{ left: `${(5 / max) * 100}%` }}
                />
              </div>
              <div className="num mt-1 flex justify-between text-xs text-muted-foreground">
                <span>{formatInt(p.votes)} votes</span>
                {seatsSource !== "none" ? (
                  <span>
                    {p.totalSeats === 0
                      ? "No seats"
                      : `${p.totalSeats} seats (${p.electorateSeats} electorate, ${p.listSeats} list)`}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {rest.length ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {rest.length} other parties: {formatPct(restPct)} between them.
        </p>
      ) : null}
      {parties.length === 0 ? (
        <p className="hatch mt-4 rounded-xl p-4 text-sm text-muted-foreground">
          <span className="rounded bg-card px-1">
            No party votes counted yet.
          </span>
        </p>
      ) : null}
    </section>
  );
}
