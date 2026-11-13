import { whosOutImage } from "@/lib/og";
import { buildParliament } from "@/lib/parliament";
import { getOverview } from "@/lib/results";

/** Share image for /parliament/whos-out. See /og for how it's cached. */
export async function GET() {
  const overview = await getOverview();
  return whosOutImage(buildParliament(overview).leaving, overview);
}
