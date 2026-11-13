import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  boothSample,
  boothTop,
  findBooth,
  isElectorateSlug,
} from "@/lib/booths";
import { formatShares } from "@/lib/format";
import { displayCandidateName, partyStyle } from "@/lib/parties";
import { shareMetadata } from "@/lib/site";
import ElectoratePage from "../../page";

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

/** Names shown per vote in the description. */
const DESCRIPTION_LINES = 3;

export async function generateMetadata({
  params,
}: PageProps<"/electorates/[slug]/booths/[id]">): Promise<Metadata> {
  const { slug, id } = await params;
  const booth = await findBooth(slug, id);
  // The page redirects or 404s.
  if (!booth) return {};
  const { electorate, data, place } = booth;
  const candidates = boothTop(
    place.candidate,
    data.candidates,
    DESCRIPTION_LINES,
  ).map((v) => ({
    label: displayCandidateName(v.choice.name),
    percent: v.percent,
  }));
  const parties = boothTop(place.party, data.parties, DESCRIPTION_LINES).map(
    (v) => ({
      label: partyStyle(v.choice.pNo, v.choice.name).short,
      percent: v.percent,
    }),
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

export default async function BoothPage(
  props: PageProps<"/electorates/[slug]/booths/[id]">,
) {
  const { slug, id } = await props.params;
  if (!(await findBooth(slug, id))) {
    // A place that's gone (left out of the official count, say) or a
    // mistyped id: the electorate's own page, rather than a copy of it here.
    if (isElectorateSlug(slug)) redirect(`/electorates/${slug}`);
    notFound();
  }
  return <ElectoratePage {...props} />;
}
