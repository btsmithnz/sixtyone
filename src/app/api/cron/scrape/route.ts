import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { RESULTS_TAG } from "@/lib/results";
import { scrapeFeed } from "@/lib/scrape";

// A full cycle is ~75 small requests; usually a few seconds.
export const maxDuration = 60;

/**
 * Scrapes the Electoral Commission feed. Called by Vercel Cron (see
 * vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/scrape
 *   curl -H "Authorization: Bearer $CRON_SECRET" "localhost:3000/api/cron/scrape?force=1"
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = request.nextUrl.searchParams.has("force");
  try {
    const summary = await scrapeFeed({ force });
    if (
      summary.electionChanged ||
      summary.electoratesChanged > 0 ||
      summary.referenceSynced
    ) {
      // Stale-while-revalidate: visitors keep getting the cached pages while
      // the new ones render in the background.
      revalidateTag(RESULTS_TAG, "max");
    }
    return Response.json(summary);
  } catch (err) {
    console.error("Scrape failed", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
