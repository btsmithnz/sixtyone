import { Change } from "@/components/change";
import { SectionHeading } from "@/components/section-heading";
import { formatInt, formatPct, shareChange } from "@/lib/format";
import { partyColorVar, partyStyle } from "@/lib/parties";
import type { Overview } from "@/lib/results";

/**
 * Party vote standings with a 5% threshold marker. On the official count,
 * each party also shows how its share and seats moved since election night.
 */
export function PartyVote({
  parties,
  seatsSource,
  stage,
}: Pick<Overview, "parties" | "seatsSource" | "stage">) {
  const max = Math.max(35, ...parties.map((p) => p.percent));
  const main = parties.filter(
    (p) =>
      p.percent >= 1 ||
      p.totalSeats > 0 ||
      (p.preliminary?.totalSeats ?? 0) > 0,
  );
  const compare = stage === "official" && parties.some((p) => p.preliminary);
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
        {compare ? " Changes are since election night." : null}
      </p>

      <ol className="mt-5 space-y-3.5">
        {main.map((p) => {
          const style = partyStyle(p.pNo, p.name);
          return (
            <li key={p.pNo}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{style.short}</span>
                {/* The change reads after the share, but sits before it. */}
                <span className="flex flex-row-reverse items-baseline gap-2">
                  <span className="num font-display text-2xl leading-none font-extrabold">
                    {formatPct(p.percent)}
                  </span>
                  {compare && p.preliminary ? (
                    <Change
                      value={shareChange(p.percent, p.preliminary.percent)}
                      digits={1}
                      unit="percentage points"
                      className="text-sm text-muted-foreground"
                    />
                  ) : null}
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
                    {compare && p.preliminary ? (
                      <Change
                        value={p.totalSeats - p.preliminary.totalSeats}
                        unit="seats"
                        className="ml-1.5 font-semibold text-foreground"
                      />
                    ) : null}
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
