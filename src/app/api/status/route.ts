import { getLastUpdated } from "@/lib/results";

/**
 * Tiny endpoint browsers poll to find out whether there's anything new.
 * Cached under the "results" tag, so polling costs no database queries.
 */
export async function GET() {
  const updatedAt = await getLastUpdated();
  return Response.json({ updatedAt });
}
