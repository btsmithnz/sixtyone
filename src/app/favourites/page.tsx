import type { Metadata } from "next";
import { Suspense } from "react";
import {
  type FavouriteCard,
  FavouritesDashboard,
} from "@/components/favourites-dashboard";
import { LiveStatus } from "@/components/live-status";
import { Skeleton } from "@/components/ui/skeleton";
import mapData from "@/data/electorate-map.json";
import { displayCandidateName, partyColorVar, partyStyle } from "@/lib/parties";
import { getOverview } from "@/lib/results";

export const metadata: Metadata = {
  title: "Your electorates",
  description:
    "Follow the electorates you care about on election night, side by side.",
  // Everyone gets the same page; what it shows depends on this browser.
  robots: { index: false },
};

export default function FavouritesPage() {
  return (
    <div className="space-y-6 pt-2">
      <h1 className="font-display text-5xl font-extrabold tracking-tight [font-stretch:80%] sm:text-6xl">
        Your electorates
      </h1>
      <Suspense fallback={<Skeleton className="h-[480px] rounded-3xl" />}>
        <Dashboard />
      </Suspense>
    </div>
  );
}

/**
 * One cached page for everyone: it carries a compact summary of all 71
 * electorates (the same cached query as the home page), and the browser
 * picks out its favourites. No per-visitor requests, no database work.
 */
async function Dashboard() {
  const { electorates, version, updatedAt, stage } = await getOverview();
  const results = new Map(electorates.map((e) => [e.eNo, e]));
  const cards: FavouriteCard[] = [...mapData.general, ...mapData.maori].map(
    ({ eNo, name, slug }) => {
      const e = results.get(eNo);
      const counted = !!e && e.votesCast > 0;
      return {
        eNo,
        name: e?.name ?? name,
        slug,
        percentCounted: e?.percentCounted ?? 0,
        stage: e?.stage ?? "preliminary",
        complete: e?.complete ?? false,
        margin: counted ? e.margin : null,
        candidates: counted
          ? e.candidates.slice(0, 3).map((c) => ({
              name: displayCandidateName(c.name),
              party: partyStyle(c.pNo).short,
              color: partyColorVar(c.pNo),
              percent: Math.round(c.percent * 10) / 10,
            }))
          : [],
        partyVote: e?.partyVoteLeader
          ? {
              party: partyStyle(e.partyVoteLeader.pNo).short,
              color: partyColorVar(e.partyVoteLeader.pNo),
              percent: Math.round(e.partyVoteLeader.percent * 10) / 10,
            }
          : null,
      };
    },
  );
  return (
    <>
      <LiveStatus updatedAt={updatedAt} stage={stage} version={version} />
      <FavouritesDashboard electorates={cards} />
    </>
  );
}
