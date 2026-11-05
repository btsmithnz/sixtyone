import { raceImage } from "@/lib/og";
import { getOverview } from "@/lib/results";

/**
 * Share image for the home page: the race to 61 right now. Prerendered and
 * revalidated with the results, like the pages. Pages link to it with
 * `?v=<results version>` (see shareMetadata) so social platforms fetch a
 * fresh copy after each update; the query string doesn't change the image.
 */
export async function GET() {
  return raceImage(await getOverview());
}
