/**
 * Runs one scrape cycle from the command line (handy for testing, or as a
 * fallback scheduler on election night: `watch -n 60 pnpm scrape`).
 *
 *   pnpm scrape          # conditional requests (If-Modified-Since)
 *   pnpm scrape --force  # refetch everything and re-sync reference data
 *
 * This doesn't revalidate the deployed site's cache. The cron route does that.
 */
import { sql } from "@/db";
import { scrapeFeed } from "@/lib/scrape";

scrapeFeed({ force: process.argv.includes("--force") })
  .then((summary) => console.log(summary))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
