import type { Metadata } from "next";
import { Suspense } from "react";
import {
  type ElectorateCard,
  ElectorateGrid,
} from "@/components/electorate-grid";
import { LiveStatus } from "@/components/live-status";
import { Skeleton } from "@/components/ui/skeleton";
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
  const cards: ElectorateCard[] = electorates.map((e) => {
    const lead = e.votesCast > 0 ? e.candidates[0] : undefined;
    return {
      eNo: e.eNo,
      name: e.name,
      slug: e.slug,
      kind: e.kind,
      leaderName: lead ? displayCandidateName(lead.name) : null,
      party: lead ? partyStyle(lead.pNo).short : null,
      color: partyColorVar(lead?.pNo),
      ink: partyInkVar(lead?.pNo),
      margin: e.margin,
      percentCounted: e.percentCounted,
      complete: e.complete,
    };
  });
  return (
    <>
      <LiveStatus updatedAt={updatedAt} version={version} />
      <ElectorateGrid electorates={cards} />
    </>
  );
}
