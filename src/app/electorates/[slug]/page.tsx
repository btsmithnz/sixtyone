import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BoothSection } from "@/components/booth-section";
import { FavouriteButton } from "@/components/favourite-button";
import { LiveStatus } from "@/components/live-status";
import { LocatorMap } from "@/components/locator-map";
import { SectionHeading } from "@/components/section-heading";
import { TrendChart, type TrendRow } from "@/components/trend-charts";
import { Skeleton } from "@/components/ui/skeleton";
import mapData from "@/data/electorate-map.json";
import { formatInt, formatPct } from "@/lib/format";
import {
  displayCandidateName,
  partyColorVar,
  partyInkVar,
  partyStyle,
} from "@/lib/parties";
import { type ElectorateDetail, getElectorateDetail } from "@/lib/results";
import { shareMetadata } from "@/lib/site";
import { changedHands } from "@/lib/stage";

const ALL = [...mapData.general, ...mapData.maori];

/** All 71 electorates are known up front, so every page is prerendered. */
export function generateStaticParams() {
  return ALL.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/electorates/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const e = ALL.find((x) => x.slug === slug);
  if (!e) return { title: "Electorate not found" };
  const detail = await getElectorateDetail(slug);
  const title = `${e.name} results`;
  const description = electorateDescription(e.name, detail);
  return {
    title,
    description,
    ...shareMetadata({
      title: `${title} | NZ election 2026`,
      description,
      path: `/electorates/${slug}`,
      image: `/og/electorates/${slug}`,
      imageAlt: `2026 election results for ${e.name}`,
      version: detail?.version ?? null,
    }),
  };
}

/** "Chlöe Swarbrick (Green) leads Auckland Central by 1,203 votes…" */
function electorateDescription(name: string, detail: ElectorateDetail | null) {
  const s = detail?.summary;
  const [lead] = s?.candidates ?? [];
  if (!s || !lead || s.votesCast === 0 || s.margin === null) {
    return `Live 2026 election results for ${name}: the candidates, the votes, and how the count unfolds.`;
  }
  const who = `${displayCandidateName(lead.name)} (${partyStyle(lead.pNo).short})`;
  if (s.stage === "official") {
    return `${who} won ${name} by ${formatInt(s.margin)} votes on the official count. 2026 election results: candidates, party vote and how the count unfolded.`;
  }
  return s.complete
    ? `${who} won ${name} by ${formatInt(s.margin)} votes. Full 2026 election results: candidates, party vote and how the count unfolded.`
    : `${who} leads ${name} by ${formatInt(s.margin)} votes with ${formatPct(s.percentCounted, 0)} of voting places counted. Live 2026 election results.`;
}

export default function ElectoratePage({
  params,
}: PageProps<"/electorates/[slug]">) {
  return (
    <div className="space-y-8 pt-2">
      <Link
        href="/electorates"
        className="inline-flex items-center gap-1.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All electorates
      </Link>
      <Suspense fallback={<ElectorateSkeleton />}>
        <Electorate params={params} />
      </Suspense>
    </div>
  );
}

async function Electorate({
  params,
}: Pick<PageProps<"/electorates/[slug]">, "params">) {
  const { slug } = await params;
  // Only the 71 real electorates reach the database and the cache.
  const known = ALL.find((e) => e.slug === slug);
  if (!known) notFound();
  const detail = await getElectorateDetail(slug);
  // A real electorate with nothing stored yet (a fresh database before its
  // first scrape) gets an empty state, not a 404 that would be cached.
  if (!detail) return <NoResultsYet eNo={known.eNo} name={known.name} />;
  const { summary: e, partyVotes, history } = detail;
  const [leader, runnerUp] = e.candidates;
  const hasVotes = e.votesCast > 0;
  const official = e.stage === "official";
  const night = e.preliminary;
  const flipped = changedHands(e);
  const maxPct = Math.max(1, ...e.candidates.map((c) => c.percent));

  const top = e.candidates.slice(0, 5);
  const series = top.map((c) => ({
    key: `c${c.cNo}`,
    label: displayCandidateName(c.name),
    color: partyColorVar(c.pNo),
  }));
  const rows: TrendRow[] = history.map((h) => ({
    t: h.t,
    counted: h.counted,
    ...Object.fromEntries(
      top.map((c) => [`c${c.cNo}`, h.candidates[c.cNo] ?? 0]),
    ),
  }));
  const officialShares = official
    ? Object.fromEntries(top.map((c) => [`c${c.cNo}`, c.percent]))
    : null;

  return (
    <>
      <header className="grid items-end gap-6 md:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="sticker inline-block -rotate-2 !rounded-full bg-secondary px-3 py-0.5 text-sm font-semibold">
              {e.kind === "maori" ? "Māori electorate" : "General electorate"}
            </span>
            <FavouriteButton eNo={e.eNo} name={e.name} labelled />
          </div>
          <h1 className="mt-3 font-display text-5xl leading-[0.95] font-extrabold tracking-tight [font-stretch:80%] sm:text-7xl">
            {e.name}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <LiveStatus
              updatedAt={e.updatedAt}
              stage={e.stage}
              version={detail.version}
            />
            <span className="text-sm text-muted-foreground">
              {official ? (
                "Every vote counted, including special votes"
              ) : (
                <>
                  <span className="num font-semibold text-foreground">
                    {e.placesCounted}
                  </span>{" "}
                  of <span className="num">{e.totalPlaces || "?"}</span> voting
                  places counted
                </>
              )}
              {hasVotes ? (
                <>
                  ,{" "}
                  <span className="num font-semibold text-foreground">
                    {formatInt(e.votesCast)}
                  </span>{" "}
                  votes
                </>
              ) : null}
            </span>
          </div>
        </div>
        <div className="hidden md:block">
          <LocatorMap
            eNo={e.eNo}
            color={hasVotes ? partyColorVar(leader?.pNo) : "var(--primary)"}
            label={`Where ${e.name} is`}
          />
        </div>
      </header>

      <section aria-labelledby="candidate-race" className="sticker p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <SectionHeading
            id="candidate-race"
            share={`/electorates/${e.slug}`}
            shareTitle={`${e.name}: the candidate race`}
            className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
          >
            The candidate race
          </SectionHeading>
          {hasVotes && leader && runnerUp ? (
            <div className="sm:text-right">
              <p className="text-lg">
                <strong>{displayCandidateName(leader.name)}</strong>{" "}
                {e.complete ? "won" : "is ahead"} by{" "}
                <strong className="num">{formatInt(e.margin ?? 0)}</strong>{" "}
                votes
              </p>
              {night?.leader && !flipped ? (
                <p className="text-sm text-muted-foreground">
                  <span className="num">{formatInt(night.margin ?? 0)}</span> on
                  election night
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        {flipped && night?.leader && leader ? (
          <p className="mt-4 rounded-xl border-2 border-dashed border-border bg-secondary/60 px-4 py-3">
            <strong>Changed hands on the official count.</strong> On election
            night {displayCandidateName(night.leader.name)} (
            {partyStyle(night.leader.pNo).short}) was ahead by{" "}
            <span className="num">{formatInt(night.margin ?? 0)}</span> votes.
            Special votes and the recheck put{" "}
            {displayCandidateName(leader.name)} in front.
          </p>
        ) : null}
        <ol className="mt-5 space-y-4">
          {e.candidates.map((c, i) => {
            const style = partyStyle(c.pNo);
            const isLeader = hasVotes && i === 0;
            return (
              <li key={c.cNo}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold">
                      {displayCandidateName(c.name)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {style.short}
                      {c.listNo ? `, list #${c.listNo}` : ""}
                    </span>
                    {isLeader ? (
                      <span
                        className="sticker ml-1 inline-block -rotate-3 !rounded-full px-2 py-0.5 text-xs font-bold"
                        style={{
                          background: partyColorVar(c.pNo),
                          color: partyInkVar(c.pNo),
                        }}
                      >
                        {e.complete ? "Won" : "Ahead"}
                      </span>
                    ) : null}
                  </div>
                  <span className="num">
                    <span className="font-display text-2xl font-extrabold">
                      {formatPct(c.percent)}
                    </span>{" "}
                    <span className="text-sm text-muted-foreground">
                      {formatInt(c.votes)}
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 h-4 rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{
                      width: `${hasVotes ? (c.percent / maxPct) * 100 : 0}%`,
                      background: partyColorVar(c.pNo),
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section
          className="sticker p-5 sm:p-7"
          aria-labelledby="how-the-lead-moved"
        >
          <SectionHeading
            id="how-the-lead-moved"
            share={`/electorates/${e.slug}#how-the-lead-moved`}
            shareTitle={`${e.name}: how the lead moved`}
            className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
          >
            How the lead moved
          </SectionHeading>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Each candidate’s share of the vote as booths reported.
            {official ? " The dots are the official result." : null}
          </p>
          <TrendChart
            rows={rows}
            series={series}
            official={officialShares}
            unit="%"
            height={300}
          />
        </section>

        <section className="sticker p-5 sm:p-7" aria-labelledby="party-vote">
          <SectionHeading
            id="party-vote"
            share={`/electorates/${e.slug}/party-vote`}
            shareTitle={`${e.name}: party vote`}
            className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
          >
            Party vote here
          </SectionHeading>
          <p className="mt-1 text-sm text-muted-foreground">
            How {e.name} voted for parties. Party votes decide the overall
            makeup of Parliament.
          </p>
          {partyVotes.some((p) => p.votes > 0) ? (
            <ol className="mt-4 space-y-2.5">
              {partyVotes
                .filter((p) => p.percent >= 0.5)
                .map((p) => (
                  <li
                    key={p.pNo}
                    className="grid grid-cols-[8.5rem_1fr_3.5rem] items-center gap-3 text-sm"
                  >
                    <span className="truncate font-medium">
                      {partyStyle(p.pNo).short}
                    </span>
                    <span className="h-2.5 rounded-full bg-secondary">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(p.percent / (partyVotes[0]?.percent || 1)) * 100}%`,
                          background: partyColorVar(p.pNo),
                        }}
                      />
                    </span>
                    <span className="num text-right font-semibold">
                      {formatPct(p.percent)}
                    </span>
                  </li>
                ))}
            </ol>
          ) : (
            <p className="hatch mt-4 rounded-xl p-4 text-sm text-muted-foreground">
              <span className="rounded bg-card px-1">
                No party votes counted yet.
              </span>
            </p>
          )}
        </section>
      </div>

      {/* Its own boundary: booth data is a separate, heavier query. */}
      <Suspense fallback={null}>
        <BoothSection eNo={e.eNo} name={e.name} slug={e.slug} />
      </Suspense>
    </>
  );
}

function NoResultsYet({ eNo, name }: { eNo: number; name: string }) {
  return (
    <header className="grid items-end gap-6 md:grid-cols-[minmax(0,1fr)_220px]">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="sticker inline-block -rotate-2 !rounded-full bg-secondary px-3 py-0.5 text-sm font-semibold">
            {eNo > 64 ? "Māori electorate" : "General electorate"}
          </span>
          <FavouriteButton eNo={eNo} name={name} labelled />
        </div>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] font-extrabold tracking-tight [font-stretch:80%] sm:text-7xl">
          {name}
        </h1>
        <p className="hatch mt-6 max-w-xl rounded-2xl p-5 text-muted-foreground">
          <span className="rounded bg-card px-1">
            No results yet. Candidates and votes for {name} appear here once the
            count starts.
          </span>
        </p>
      </div>
      <div className="hidden md:block">
        <LocatorMap
          eNo={eNo}
          color="var(--primary)"
          label={`Where ${name} is`}
        />
      </div>
    </header>
  );
}

function ElectorateSkeleton() {
  return (
    <output className="block space-y-8" aria-label="Loading electorate">
      <Skeleton className="h-28 w-2/3" />
      <Skeleton className="h-96 rounded-3xl" />
      <Skeleton className="h-80 rounded-3xl" />
    </output>
  );
}
