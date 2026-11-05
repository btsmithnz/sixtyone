import mapData from "@/data/electorate-map.json";
import { electorateImage } from "@/lib/og";
import { getElectorateDetail } from "@/lib/results";

const ALL = [...mapData.general, ...mapData.maori];

/** One share image per electorate, prerendered at build. */
export function generateStaticParams() {
  return ALL.map((e) => ({ slug: e.slug }));
}

/** Share image for an electorate page: the candidate race right now. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/og/electorates/[slug]">,
) {
  const { slug } = await params;
  const electorate = ALL.find((e) => e.slug === slug);
  if (!electorate) return new Response("Not found", { status: 404 });
  return electorateImage(
    electorate.name,
    electorate.eNo,
    await getElectorateDetail(slug),
  );
}
