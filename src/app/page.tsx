import { Suspense } from "react";
import { LiveStatus } from "@/components/live-status";
import { MapSection } from "@/components/map-section";
import { NailBiters } from "@/components/nail-biters";
import { PartyVote } from "@/components/party-vote";
import { RaceTo61, type SeatParty } from "@/components/race-to-61";
import { TrendChart, type TrendRow } from "@/components/trend-charts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInt, formatPct } from "@/lib/format";
import {
  DEFAULT_BLOCS,
  partyColorVar,
  partyInkVar,
  partyStyle,
} from "@/lib/parties";
import { getNationalHistory, getOverview } from "@/lib/results";

export default function Home() {
  // Results have a short client `stale` time, so they sit outside the App
  // Shell: the shell (prefetched for instant navigation) shows the skeleton,
  // and the cached results stream in.
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeResults />
    </Suspense>
  );
}

async function HomeResults() {
  const [overview, history] = await Promise.all([
    getOverview(),
    getNationalHistory(),
  ]);
  const { stats, parties } = overview;

  const seatParties: SeatParty[] = parties
    .filter((p) => p.totalSeats > 0)
    .map((p) => ({
      pNo: p.pNo,
      short: partyStyle(p.pNo, p.name).short,
      color: partyColorVar(p.pNo),
      ink: partyInkVar(p.pNo),
      seats: p.totalSeats,
    }));

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
      {/* Count status */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
        <LiveStatus updatedAt={overview.updatedAt} version={overview.version} />
        <CountMeter percent={stats?.percentCounted ?? 0} />
        {stats && stats.totalVotesCast > 0 ? (
          <span className="text-sm text-muted-foreground">
            <span className="num font-semibold text-foreground">
              {formatInt(stats.totalVotesCast)}
            </span>{" "}
            votes counted,{" "}
            <span className="num font-semibold text-foreground">
              {stats.electoratesComplete}
            </span>{" "}
            of 71 electorates fully counted
          </span>
        ) : null}
      </div>

      <RaceTo61
        parties={seatParties}
        houseSize={overview.houseSize}
        defaultBlocs={{
          left: DEFAULT_BLOCS.left.parties,
          right: DEFAULT_BLOCS.right.parties,
        }}
        seatsSource={overview.seatsSource}
      />

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <MapSection electorates={overview.electorates} />
        <PartyVote parties={parties} seatsSource={overview.seatsSource} />
      </div>

      <section
        aria-labelledby="trend-heading"
        className="grid grid-cols-1 gap-8 lg:grid-cols-2"
      >
        <div className="sticker p-5 sm:p-7">
          <h2
            id="trend-heading"
            className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
          >
            How the night unfolded
          </h2>
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
          <h2 className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]">
            Seats through the night
          </h2>
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
    </div>
  );
}

function CountMeter({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-3 w-40 overflow-hidden rounded-full border-2 border-ink bg-card dark:border-[#4a47a0]"
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
      <span className="text-sm">
        <span className="num font-semibold">{formatPct(percent)}</span>{" "}
        <span className="text-muted-foreground">of voting places counted</span>
      </span>
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
