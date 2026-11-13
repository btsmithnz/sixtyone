import { nailBitersImage } from "@/lib/og";
import { getOverview } from "@/lib/results";

/** Share image for /nail-biters. See /og for how it's cached. */
export async function GET() {
  return nailBitersImage(await getOverview());
}
