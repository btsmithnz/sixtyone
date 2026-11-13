import { partyVoteImage } from "@/lib/og";
import { getOverview } from "@/lib/results";

/** Share image for /party-vote. See /og for how it's cached. */
export async function GET() {
  return partyVoteImage(await getOverview());
}
