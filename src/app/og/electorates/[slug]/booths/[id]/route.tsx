import { boothSample, findBooth } from "@/lib/booths";
import { boothImage } from "@/lib/og";
import { getOverview } from "@/lib/results";

/**
 * There are thousands of voting places, so only one is prerendered (Cache
 * Components needs one to check the route); the rest render when first shared.
 */
export async function generateStaticParams() {
  return [await boothSample()];
}

/** Share image for /electorates/[slug]/booths/[id]: how one place voted. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/og/electorates/[slug]/booths/[id]">,
) {
  const { slug, id } = await params;
  const [booth, { stage }] = await Promise.all([
    findBooth(slug, id),
    getOverview(),
  ]);
  if (!booth) return new Response("Not found", { status: 404 });
  return boothImage(booth.electorate.name, booth.data, booth.place, stage);
}
