import type { Metadata } from "next";
import { ScrollToSection } from "@/components/scroll-to-hash";
import mapData from "@/data/electorate-map.json";
import { formatShares } from "@/lib/format";
import { partyStyle } from "@/lib/parties";
import { getElectorateDetail } from "@/lib/results";
import { shareMetadata } from "@/lib/site";
import ElectoratePage from "../page";

const ALL = [...mapData.general, ...mapData.maori];

export function generateStaticParams() {
  return ALL.map((e) => ({ slug: e.slug }));
}

/** An electorate's party vote share page (see /party-vote). */
export async function generateMetadata({
  params,
}: PageProps<"/electorates/[slug]/party-vote">): Promise<Metadata> {
  const { slug } = await params;
  const e = ALL.find((x) => x.slug === slug);
  if (!e) return { title: "Electorate not found" };
  const detail = await getElectorateDetail(slug);
  const top = (detail?.partyVotes ?? []).filter((p) => p.votes > 0).slice(0, 4);
  const title = `${e.name} party vote`;
  const description = top.length
    ? `How ${e.name} voted for parties: ${formatShares(top.map((p) => ({ label: partyStyle(p.pNo).short, percent: p.percent })))}. 2026 NZ election results.`
    : `How ${e.name} voted for parties in the 2026 New Zealand election.`;
  return {
    title,
    description,
    ...shareMetadata({
      title: `${title} | NZ election 2026`,
      description,
      path: `/electorates/${slug}/party-vote`,
      canonical: `/electorates/${slug}`,
      image: `/og/electorates/${slug}/party-vote`,
      imageAlt: `The party vote in ${e.name}, 2026 election`,
      version: detail?.version ?? null,
    }),
  };
}

export default function ElectoratePartyVotePage(
  props: PageProps<"/electorates/[slug]/party-vote">,
) {
  return (
    <>
      <ElectoratePage {...props} />
      <ScrollToSection id="party-vote" />
    </>
  );
}
