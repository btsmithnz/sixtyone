import Link from "next/link";
import { SectionHeading } from "@/components/section-heading";
import { formatInt, formatPct } from "@/lib/format";
import { displayCandidateName, partyColorVar, partyStyle } from "@/lib/parties";
import type { ElectorateSummary } from "@/lib/results";

/** The closest electorate races, by margin between first and second. */
export function NailBiters({
  electorates,
}: {
  electorates: ElectorateSummary[];
}) {
  const close = electorates
    .filter((e) => e.marginPoints !== null && e.votesCast > 0)
    .sort((a, b) => (a.marginPoints ?? 0) - (b.marginPoints ?? 0))
    .slice(0, 6);

  return (
    <section aria-labelledby="nail-biters">
      <SectionHeading
        id="nail-biters"
        className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
      >
        Nail-biters
      </SectionHeading>
      <p className="mt-1 text-sm text-muted-foreground">
        The tightest electorate races right now.
      </p>
      {close.length === 0 ? (
        <p className="hatch mt-4 rounded-2xl p-6 text-sm text-muted-foreground">
          <span className="rounded bg-card px-1">
            Close races show up here once electorates start reporting.
          </span>
        </p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {close.map((e) => {
            const [a, b] = e.candidates;
            return (
              <li key={e.eNo}>
                <Link
                  href={`/electorates/${e.slug}`}
                  className="sticker block p-4 transition-transform hover:-translate-y-0.5 hover:-rotate-[0.6deg] focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-xl font-extrabold [font-stretch:90%]">
                      {e.name}
                    </span>
                    <span className="num shrink-0 text-xs text-muted-foreground">
                      {formatPct(e.percentCounted, 0)} counted
                    </span>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {[a, b].map((c) => (
                      <div
                        key={c.cNo}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span
                          className="size-3 shrink-0 rounded-full"
                          style={{ background: partyColorVar(c.pNo) }}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {displayCandidateName(c.name)}
                          <span className="text-muted-foreground">
                            {" "}
                            {partyStyle(c.pNo).short}
                          </span>
                        </span>
                        <span className="num">{formatInt(c.votes)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-lg bg-secondary px-2.5 py-1.5 text-sm">
                    Just{" "}
                    <strong className="num">
                      {formatInt(e.margin ?? 0)} votes
                    </strong>{" "}
                    in it
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
