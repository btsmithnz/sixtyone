import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";
import { LiveStatus } from "@/components/live-status";
import { MapSection } from "@/components/map-section";
import { NailBiters } from "@/components/nail-biters";
import { PartyVote } from "@/components/party-vote";
import { RaceTo61, type SeatParty } from "@/components/race-to-61";
import { SectionHeading } from "@/components/section-heading";
import {
  SpecialsWhatIf,
  type WhatIfParty,
} from "@/components/specials-what-if";
import { SplitVotes } from "@/components/split-votes";
import { TrendChart, type TrendRow } from "@/components/trend-charts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInt, formatPct } from "@/lib/format";
import { buildParliament } from "@/lib/parliament";
import {
  blocSeats,
  DEFAULT_BLOCS,
  partyColorVar,
  partyInkVar,
  partyStyle,
} from "@/lib/parties";
import { getNationalHistory, getOverview, type Overview } from "@/lib/results";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  shareMetadata,
} from "@/lib/site";
import { knifeEdges } from "@/lib/specials";

export async function generateMetadata(): Promise<Metadata> {
  const overview = await getOverview();
  const title = `${SITE_NAME}: ${SITE_TAGLINE}`;
  const description = homeDescription(overview);
  return {
    title: { absolute: title },
    description,
    ...shareMetadata({
      title,
      description,
      path: "/",
      version: overview.version,
    }),
  };
}

/** A search/share description that reflects the count once it starts. */
function homeDescription({ parties, stats }: Overview) {
  const { left, right } = blocSeats(parties);
  if (!stats || left.seats + right.seats === 0) return SITE_DESCRIPTION;
  const [ahead, behind] =
    right.seats >= left.seats ? [right, left] : [left, right];
  return `${ahead.name} ${ahead.seats} seats, ${behind.name} ${behind.seats}, with ${formatPct(stats.percentCounted)} of voting places counted. Live 2026 NZ election results: the race to 61 and every electorate.`;
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  inLanguage: "en-NZ",
};

export default function Home() {
  // Results have a short client `stale` time, so they sit outside the App
  // Shell: the shell (prefetched for instant navigation) shows the skeleton,
  // and the cached results stream in.
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD, `<` escaped
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <h1 className="pt-2 font-display text-2xl font-extrabold tracking-tight [font-stretch:85%] sm:text-3xl">
        New Zealand election 2026: live results
      </h1>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeResults />
      </Suspense>
    </>
  );
}

async function HomeResults() {
  const [overview, { version: historyVersion, points: history }] =
    await Promise.all([getOverview(), getNationalHistory()]);
  // Two cache entries can be at different versions straight after a scrape;
  // report the older so the page keeps refreshing until both are current.
  const version =
    overview.version && historyVersion
      ? Math.min(overview.version, historyVersion)
      : (overview.version ?? historyVersion);
  const { stats, parties } = overview;

  const seatParties: SeatParty[] = parties
    .filter((p) => p.totalSeats > 0)
    .map((p) => ({
      pNo: p.pNo,
      short: partyStyle(p.pNo, p.name).short,
      color: partyColorVar(p.pNo),
      ink: partyInkVar(p.pNo),
      seats: p.totalSeats,
      percent: p.percent,
    }));

  // Once election night's count is complete: what the special votes could do.
  const whatIf =
    stats && stats.percentCounted >= 100 ? specialsData(overview) : null;

  // Chart the parties that matter: anyone who's polled 1.5%+ at some point.
  const charted = parties
    .filter((p) => history.some((h) => (h.parties[p.pNo]?.percent ?? 0) >= 1.5))
    .slice(0, 9);
  const series = charted.map((p) => ({
    key: `p${p.pNo}`,
    label: partyStyle(p.pNo, p.name).short,
    color: partyColorVar(p.pNo),
  }));
  const voteRows: TrendRow[] = history.map((h) => ({
    t: h.t,
    counted: h.counted,
    ...Object.fromEntries(
      charted.map((p) => [`p${p.pNo}`, h.parties[p.pNo]?.percent ?? 0]),
    ),
  }));
  const seatRows: TrendRow[] = history.map((h) => ({
    t: h.t,
    counted: h.counted,
    ...Object.fromEntries(
      charted.map((p) => [`p${p.pNo}`, h.parties[p.pNo]?.seats ?? 0]),
    ),
  }));
  const hasSeatHistory = history.some((h) =>
    Object.values(h.parties).some((p) => p.seats > 0),
  );

  return (
    <div className="space-y-8">
      {/* Count status: how much is counted frames every number below it. */}
      <div className="space-y-3 pt-2">
        <LiveStatus updatedAt={overview.updatedAt} version={version} />
        <CountMeter percent={stats?.percentCounted ?? 0}>
          {stats && stats.totalVotesCast > 0 ? (
            <>
              <span className="num font-semibold text-foreground">
                {formatInt(stats.totalVotesCast)}
              </span>{" "}
              votes,{" "}
              <span className="num font-semibold text-foreground">
                {stats.electoratesComplete}
              </span>{" "}
              of 71 electorates fully counted
            </>
          ) : null}
        </CountMeter>
      </div>

      <RaceTo61
        parties={seatParties}
        houseSize={overview.houseSize}
        defaultBlocs={DEFAULT_BLOCS}
        seatsSource={overview.seatsSource}
        percentCounted={stats?.percentCounted ?? 0}
      />

      {whatIf ? (
        <SpecialsWhatIf
          parties={whatIf.parties}
          outsideWins={whatIf.outsideWins}
          blocs={DEFAULT_BLOCS}
          knifeEdges={whatIf.knifeEdges}
        />
      ) : null}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <MapSection electorates={overview.electorates} />
        <PartyVote parties={parties} seatsSource={overview.seatsSource} />
      </div>

      <section
        aria-labelledby="how-the-night-unfolded"
        className="grid grid-cols-1 gap-8 lg:grid-cols-2"
      >
        <div className="sticker p-5 sm:p-7">
          <SectionHeading
            id="how-the-night-unfolded"
            className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
          >
            How the night unfolded
          </SectionHeading>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Party vote share as the count came in. Advance votes are counted
            first, so early numbers can drift.
          </p>
          <TrendChart
            rows={voteRows}
            series={series}
            unit="%"
            referenceY={5}
            referenceLabel="5% threshold"
          />
        </div>
        <div className="sticker p-5 sm:p-7">
          <SectionHeading
            id="seats-through-the-night"
            className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
          >
            Seats through the night
          </SectionHeading>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            The Electoral Commission’s seat allocation at each update.
          </p>
          <TrendChart
            rows={hasSeatHistory ? seatRows : []}
            series={series}
            unit="seats"
          />
        </div>
      </section>

      <NailBiters electorates={overview.electorates} />

      <SplitVotes electorates={overview.electorates} />
    </div>
  );
}

/**
 * Inputs for the special votes what-if: every party's preliminary votes and
 * electorate seats, plus the closest seats (worked out here, once per
 * rebuild, rather than in every browser).
 */
function specialsData(overview: Overview) {
  const { parties, electorates } = overview;
  // Who's on the bubble: each party's list, in order, past the current cut.
  const { queues, listSeats } = buildParliament(overview);
  const nextOnList = (pNo: number, i: number) => queues.get(pNo)?.[i] ?? null;
  const onBallot = new Set(parties.map((p) => p.pNo));
  const outsideWins = electorates.filter((e) => {
    const lead = e.margin !== null ? e.candidates[0] : undefined;
    return lead && !(lead.pNo && onBallot.has(lead.pNo));
  }).length;
  const whatIfParties: WhatIfParty[] = parties
    .filter((p) => p.votes > 0)
    .map((p) => ({
      pNo: p.pNo,
      short: partyStyle(p.pNo, p.name).short,
      color: partyColorVar(p.pNo),
      votes: p.votes,
      seats: p.totalSeats,
      electorateSeats: p.electorateSeats,
      // Enough of the list for any shift the what-if can make.
      listQueue: (queues.get(p.pNo) ?? []).slice(
        0,
        (listSeats.get(p.pNo) ?? 0) + 8,
      ),
    }));
  const edges = knifeEdges(
    new Map(whatIfParties.map((p) => [p.pNo, p.votes])),
    new Map(
      whatIfParties
        .filter((p) => p.electorateSeats > 0)
        .map((p) => [p.pNo, p.electorateSeats]),
    ),
    outsideWins,
  )
    .slice(0, 5)
    .map((e) => {
      const filled = listSeats.get(e.pNo) ?? 0;
      return {
        ...e,
        // Gaining a seat brings in the next on the list; losing one drops the last in.
        person:
          e.kind === "gain"
            ? nextOnList(e.pNo, filled)
            : filled > 0
              ? nextOnList(e.pNo, filled - 1)
              : null,
      };
    });
  return { parties: whatIfParties, outsideWins, knifeEdges: edges };
}

function CountMeter({
  percent,
  children,
}: {
  percent: number;
  /** Extra detail on the right: votes and electorates counted. */
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="flex items-baseline gap-2">
          <span className="num font-display text-4xl leading-none font-extrabold tracking-tight [font-stretch:80%] sm:text-5xl">
            {formatPct(percent)}
          </span>
          <span className="text-base font-medium">
            of voting places counted
          </span>
        </p>
        {children ? (
          <p className="text-sm text-muted-foreground">{children}</p>
        ) : null}
      </div>
      <div
        className="mt-2 h-4 overflow-hidden rounded-full border-2 border-ink bg-card dark:border-[#4a47a0]"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Voting places counted"
      >
        <div
          className="h-full bg-primary transition-[width] duration-700"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <output className="block space-y-8 pt-2" aria-label="Loading results">
      <Skeleton className="h-6 w-80" />
      <Skeleton className="h-[420px] rounded-3xl" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Skeleton className="h-[640px] rounded-3xl" />
        <Skeleton className="h-[640px] rounded-3xl" />
      </div>
    </output>
  );
}
