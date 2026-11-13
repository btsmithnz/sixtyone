import type { Metadata } from "next";
import { ScrollToSection } from "@/components/scroll-to-hash";
import { formatPct, formatShares } from "@/lib/format";
import { partyStyle } from "@/lib/parties";
import { getOverview } from "@/lib/results";
import { shareMetadata } from "@/lib/site";
import Home from "../page";

/**
 * The party vote's share page: the home page, opened at the party vote, with
 * its own preview image. Share pages exist because a link to /#party-vote
 * can't have its own preview: the part after # never reaches the server.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { parties, stats, version } = await getOverview();
  const title = "Party vote";
  const top = parties.filter((p) => p.votes > 0).slice(0, 4);
  const description = top.length
    ? `${formatShares(top.map((p) => ({ label: partyStyle(p.pNo, p.name).short, percent: p.percent })))}, with ${formatPct(stats?.percentCounted ?? 0)} of voting places counted. Live 2026 NZ election results.`
    : "The party vote in the 2026 New Zealand election, live as it's counted.";
  return {
    title,
    description,
    ...shareMetadata({
      title: `${title} | NZ election 2026`,
      description,
      path: "/party-vote",
      canonical: "/",
      image: "/og/party-vote",
      imageAlt: "The party vote in the 2026 New Zealand election",
      version,
    }),
  };
}

export default function PartyVotePage() {
  return (
    <>
      <Home />
      <ScrollToSection id="party-vote" />
    </>
  );
}
