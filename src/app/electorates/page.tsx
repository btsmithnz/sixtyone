import type { Metadata } from "next";
import { Suspense } from "react";
import {
  type ElectorateCard,
  ElectorateGrid,
} from "@/components/electorate-grid";
import { LiveStatus } from "@/components/live-status";
import { Skeleton } from "@/components/ui/skeleton";
import mapData from "@/data/electorate-map.json";
import {
  displayCandidateName,
  partyColorVar,
  partyInkVar,
  partyStyle,
} from "@/lib/parties";
import { getOverview } from "@/lib/results";

export const metadata: Metadata = {
  title: "Electorates",
  description: "All 71 electorates in the 2026 New Zealand election, live.",
};

export default function ElectoratesPage() {
  return (
    <div className="space-y-6 pt-2">
      <h1 className="font-display text-5xl font-extrabold tracking-tight [font-stretch:80%] sm:text-6xl">
        All 71 electorates
      </h1>
      <Suspense fallback={<Skeleton className="h-[600px] rounded-3xl" />}>
        <Grid />
      </Suspense>
    </div>
  );
}

async function Grid() {
  const { electorates, version, updatedAt } = await getOverview();
  const results = new Map(electorates.map((e) => [e.eNo, e]));
  // List all 71 from the static map data, so the grid is complete even
  // before the first scrape has loaded anything into the database.
  const cards: ElectorateCard[] = [...mapData.general, ...mapData.maori].map(
    ({ eNo, name, slug }) => {
      const e = results.get(eNo);
      const lead = e && e.votesCast > 0 ? e.candidates[0] : undefined;
      return {
        eNo,
        name: e?.name ?? name,
        slug,
        kind: eNo > 64 ? "maori" : "general",
        leaderName: lead ? displayCandidateName(lead.name) : null,
        party: lead ? partyStyle(lead.pNo).short : null,
        color: partyColorVar(lead?.pNo),
        ink: partyInkVar(lead?.pNo),
        margin: e?.margin ?? null,
        percentCounted: e?.percentCounted ?? 0,
        complete: e?.complete ?? false,
      };
    },
  );
  return (
    <>
      <LiveStatus updatedAt={updatedAt} version={version} />
      <ElectorateGrid electorates={cards} />
    </>
  );
}
