import type { Metadata } from "next";
import { boothSample, findBooth } from "@/lib/booths";
import { formatShares } from "@/lib/format";
import { displayCandidateName, partyStyle } from "@/lib/parties";
import { shareMetadata } from "@/lib/site";
import ElectoratePage, {
  generateMetadata as electorateMetadata,
} from "../../page";

/**
 * A voting place's share page: the electorate page, opened at that place in
 * the booth by booth map (BoothExplorer reads the id from the URL), with a
 * preview image of how it voted. Thousands of places, so they're rendered
 * when first visited; the first visit waits for the finished page, so link
 * previews always get the place's own title and image.
 */
export const ensureStatic = "navigation";

export async function generateStaticParams() {
  return [await boothSample()];
}

const top = (votes: number[], labels: string[]) => {
  const total = votes.reduce((a, n) => a + n, 0) || 1;
  return votes
    .map((n, i) => ({ label: labels[i] ?? "", percent: (n / total) * 100 }))
    .filter((v) => v.percent > 0)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 3);
};

export async function generateMetadata(
  props: PageProps<"/electorates/[slug]/booths/[id]">,
): Promise<Metadata> {
  const { slug, id } = await props.params;
  const booth = await findBooth(slug, id);
  // A place that's gone (renamed in the official count, say): the electorate.
  if (!booth)
    return electorateMetadata({
      params: Promise.resolve({ slug }),
      searchParams: props.searchParams,
    });
  const { electorate, data, place } = booth;
  const candidates = top(
    place.candidate,
    data.candidates.map((c) => displayCandidateName(c.name)),
  );
  const parties = top(
    place.party,
    data.parties.map((p) => partyStyle(p.pNo, p.name).short),
  );
  const title = `${place.venue}: how it voted`;
  const description = `Candidate vote: ${formatShares(candidates)}. Party vote: ${formatShares(parties)}. One voting place in ${electorate.name}, 2026 NZ election.`;
  return {
    title,
    description,
    ...shareMetadata({
      title: `${title} | ${electorate.name}`,
      description,
      path: `/electorates/${slug}/booths/${place.id}`,
      canonical: `/electorates/${slug}`,
      image: `/og/electorates/${slug}/booths/${place.id}`,
      imageAlt: `How ${place.venue} voted in ${electorate.name}, 2026 election`,
      version: data.stage,
    }),
  };
}

export default function BoothPage(
  props: PageProps<"/electorates/[slug]/booths/[id]">,
) {
  return <ElectoratePage {...props} />;
}
