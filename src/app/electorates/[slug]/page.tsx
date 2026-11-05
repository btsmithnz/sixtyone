import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LiveStatus } from "@/components/live-status";
import { LocatorMap } from "@/components/locator-map";
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
import { getElectorateDetail } from "@/lib/results";

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
  return {
    title: e ? `${e.name} results` : "Electorate",
    description: e
      ? `Live 2026 election results for ${e.name}: who's ahead, by how much, and how the count unfolded.`
      : undefined,
  };
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
  const detail = await getElectorateDetail(slug);
  if (!detail) notFound();
  const { summary: e, partyVotes, history } = detail;
  const [leader, runnerUp] = e.candidates;
  const hasVotes = e.votesCast > 0;
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

  return (
    <>
      <header className="grid items-end gap-6 md:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <span className="sticker inline-block -rotate-2 !rounded-full bg-secondary px-3 py-0.5 text-sm font-semibold">
            {e.kind === "maori" ? "Māori electorate" : "General electorate"}
          </span>
          <h1 className="mt-3 font-display text-5xl leading-[0.95] font-extrabold tracking-tight [font-stretch:80%] sm:text-7xl">
            {e.name}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <LiveStatus updatedAt={e.updatedAt} version={detail.version} />
            <span className="text-sm text-muted-foreground">
              <span className="num font-semibold text-foreground">
                {e.placesCounted}
              </span>{" "}
              of <span className="num">{e.totalPlaces || "?"}</span> voting
              places counted
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

      <section aria-labelledby="race-heading" className="sticker p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2
            id="race-heading"
            className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
          >
            The candidate race
          </h2>
          {hasVotes && leader && runnerUp ? (
            <p className="text-lg">
              <strong>{displayCandidateName(leader.name)}</strong>{" "}
              {e.complete ? "won" : "is ahead"} by{" "}
              <strong className="num">{formatInt(e.margin ?? 0)}</strong> votes
            </p>
          ) : null}
        </div>
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
        <section className="sticker p-5 sm:p-7" aria-labelledby="trend-heading">
          <h2
            id="trend-heading"
            className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
          >
            How the lead moved
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Each candidate’s share of the vote as booths reported.
          </p>
          <TrendChart rows={rows} series={series} unit="%" height={300} />
        </section>

        <section className="sticker p-5 sm:p-7" aria-labelledby="pv-heading">
          <h2
            id="pv-heading"
            className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
          >
            Party vote here
          </h2>
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
    </>
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
