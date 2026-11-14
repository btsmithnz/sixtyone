import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { BOOTHS_TAG } from "@/lib/booths";
import { RESULTS_TAG } from "@/lib/results";

/**
 * Refreshes every page after results are loaded some other way than the
 * scraper (which revalidates by itself): an import of the official count, or
 * of booth results. Same secret as the cron route.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/revalidate
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Stale-while-revalidate, as the scraper does: visitors keep getting the
  // cached pages while new ones render.
  revalidateTag(RESULTS_TAG, "max");
  revalidateTag(BOOTHS_TAG, "max");
  return Response.json({ revalidated: [RESULTS_TAG, BOOTHS_TAG] });
}
