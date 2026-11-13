import mapData from "@/data/electorate-map.json";
import { electoratePartyVoteImage } from "@/lib/og";
import { getElectorateDetail } from "@/lib/results";

const ALL = [...mapData.general, ...mapData.maori];

/** One share image per electorate's party vote, prerendered at build. */
export function generateStaticParams() {
  return ALL.map((e) => ({ slug: e.slug }));
}

/** Share image for /electorates/[slug]/party-vote. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/og/electorates/[slug]/party-vote">,
) {
  const { slug } = await params;
  const electorate = ALL.find((e) => e.slug === slug);
  if (!electorate) return new Response("Not found", { status: 404 });
  return electoratePartyVoteImage(
    electorate.name,
    await getElectorateDetail(slug),
  );
}
