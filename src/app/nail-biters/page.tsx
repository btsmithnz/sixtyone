import type { Metadata } from "next";
import { ScrollToSection } from "@/components/scroll-to-hash";
import { formatInt } from "@/lib/format";
import { displayCandidateName } from "@/lib/parties";
import { getOverview } from "@/lib/results";
import { shareMetadata } from "@/lib/site";
import Home from "../page";

/** The nail-biters' share page (see /party-vote). */
export async function generateMetadata(): Promise<Metadata> {
  const { electorates, version } = await getOverview();
  const [closest] = electorates
    .filter((e) => e.marginPoints !== null && e.votesCast > 0)
    .sort((a, b) => (a.marginPoints ?? 0) - (b.marginPoints ?? 0));
  const [a, b] = closest?.candidates ?? [];
  const title = "Nail-biters";
  const description =
    closest && a && b
      ? `The closest race: ${closest.name}, with just ${formatInt(closest.margin ?? 0)} votes between ${displayCandidateName(a.name)} and ${displayCandidateName(b.name)}. The tightest electorates in the 2026 NZ election.`
      : "The tightest electorate races in the 2026 New Zealand election, live as they're counted.";
  return {
    title,
    description,
    ...shareMetadata({
      title: `${title} | NZ election 2026`,
      description,
      path: "/nail-biters",
      canonical: "/",
      image: "/og/nail-biters",
      imageAlt: "The closest electorate races in the 2026 New Zealand election",
      version,
    }),
  };
}

export default function NailBitersPage() {
  return (
    <>
      <Home />
      <ScrollToSection id="nail-biters" />
    </>
  );
}
