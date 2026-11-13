import Link from "next/link";
import { SectionHeading } from "@/components/section-heading";
import { getNationalStandouts } from "@/lib/booths";
import { formatPct } from "@/lib/format";
import { partyColorVar } from "@/lib/parties";
import type { Overview } from "@/lib/results";
import { OFFICIAL_RESULTS_DATE } from "@/lib/specials";
import { STANDOUT_MIN_VOTES } from "@/lib/standouts";

/** Parties with less of the party vote than this (%) don't get a best place. */
const BEST_PLACE_MIN_SHARE = 1;

/**
 * Voting places that stood out across the country: the biggest gaps from
 * their own electorate, and each party's best place. Each links to the place
 * on its electorate's booth map. Hidden until booth results are loaded.
 */
export async function StandoutPlaces({
  parties,
}: {
  /** The national party vote, to compare each party's best place with. */
  parties: Overview["parties"];
}) {
  const national = await getNationalStandouts();
  if (!national?.standouts.length) return null;
  const { stage, standouts } = national;
  // Parties with a real share of the vote, biggest first.
  const best = parties
    .filter((p) => p.percent >= BEST_PLACE_MIN_SHARE)
    .flatMap((p) => {
      const b = national.best.find((x) => x.pNo === p.pNo);
      return b ? [{ ...b, nationalShare: p.percent }] : [];
    });
  const placeHref = (p: { slug: string; placeId: number }, party: boolean) =>
    `/electorates/${p.slug}/booths/${p.placeId}${party ? "?vote=party" : ""}`;

  return (
    <section aria-labelledby="standouts" className="space-y-4">
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
        <div className="sticker p-5 sm:p-7">
          <SectionHeading
            id="standouts"
            share="/#standouts"
            className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
          >
            Standout voting places
          </SectionHeading>
          <p className="mt-1 text-sm text-muted-foreground">
            Where a candidate or party did far better than across the rest of
            their electorate.
          </p>
          <ol className="mt-4 divide-y divide-border">
            {standouts.map((s) => (
              <li key={`${s.slug}-${s.placeId}`}>
                <Link
                  href={placeHref(s, s.vote === "party")}
                  className="-mx-1.5 block rounded-lg px-1.5 py-2.5 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-semibold">
                      {s.venue}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {s.electorate}
                    </span>
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-sm">
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full"
                      style={{ background: partyColorVar(s.pNo) }}
                    />
                    <span className="min-w-0">
                      <strong>{s.label}</strong>{" "}
                      <span className="num">
                        {formatPct(s.share)} here,{" "}
                        {formatPct(s.electorateShare)} across {s.electorate}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        ({s.vote} vote)
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>

        {best.length ? (
          <div className="sticker p-5 sm:p-7">
            <SectionHeading
              id="best-places"
              share="/#best-places"
              className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
            >
              Each party’s best place
            </SectionHeading>
            <p className="mt-1 text-sm text-muted-foreground">
              The voting place where each party got its biggest share of the
              party vote.
            </p>
            <ol className="mt-4 divide-y divide-border">
              {best.map((b) => (
                <li key={b.pNo}>
                  <Link
                    href={placeHref(b, true)}
                    className="-mx-1.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-1.5 py-2.5 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                  >
                    <span
                      aria-hidden
                      className="size-3 rounded-full"
                      style={{ background: partyColorVar(b.pNo) }}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">{b.label}</span>
                      <span className="block text-sm text-muted-foreground">
                        {b.venue}, {b.electorate}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="num block font-display text-xl leading-none font-extrabold">
                        {formatPct(b.share)}
                      </span>
                      <span className="num block text-xs text-muted-foreground">
                        {formatPct(b.nationalShare)} nationally
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
      <p className="max-w-[80ch] text-xs text-muted-foreground">
        Voting places with at least {STANDOUT_MIN_VOTES} votes, not counting
        mobile teams. Each place only counts for its local electorates, the ones
        it took the most votes for, so students voting for home at a university
        don’t count. Special votes aren’t counted by voting place.
        {stage === "preliminary"
          ? ` Preliminary counts can include recording slips; the official count on ${OFFICIAL_RESULTS_DATE} checks every voting place.`
          : ""}
      </p>
    </section>
  );
}
