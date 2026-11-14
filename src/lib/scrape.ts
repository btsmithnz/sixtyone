import "server-only";
import { count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  electoratePath,
  type FetchResult,
  fetchFeedFile,
  mapLimit,
} from "./feed/fetch";
import {
  parseCandidates,
  parseElection,
  parseElectorateResult,
  parseElectorates,
  parseParties,
} from "./feed/parse";
import { storeElection, storeElectorate, upsertReference } from "./ingest";
import { parseCountStage } from "./stage";

const ELECTORATE_COUNT = 71;
const CONCURRENCY = 6;

export type ScrapeSummary = {
  runId: number;
  requests: number;
  notModified: number;
  electionChanged: boolean;
  electoratesChanged: number;
  referenceSynced: boolean;
  failures: string[];
  durationMs: number;
};

/**
 * One scrape cycle. Safe to run concurrently or repeatedly: every snapshot is
 * keyed by the feed's own `updated` timestamp, so duplicates are ignored.
 *
 * Snapshots are stored as the preliminary count unless COUNT_STAGE=official:
 * set that if the feed publishes the official result (docs/official-results.md).
 * Nothing in the feed itself reliably says which count it is.
 */
export async function scrapeFeed({
  force = false,
}: {
  /** Ignore If-Modified-Since and re-sync reference data. */
  force?: boolean;
} = {}): Promise<ScrapeSummary> {
  const started = Date.now();
  const stage = parseCountStage(process.env.COUNT_STAGE);
  const [run] = await db
    .insert(schema.scrapeRuns)
    .values({ status: "running" })
    .returning({ id: schema.scrapeRuns.id });

  let requests = 0;
  let notModified = 0;
  const lastModified = new Map(
    (await db.select().from(schema.feedFiles)).map((f) => [
      f.path,
      f.lastModified,
    ]),
  );

  async function get(path: string, rootTag: string): Promise<FetchResult> {
    requests++;
    const res = await fetchFeedFile(path, {
      rootTag,
      ifModifiedSince: force ? null : lastModified.get(path),
    });
    if (res.status === "not-modified") notModified++;
    return res;
  }

  async function remember(path: string, res: FetchResult) {
    const lm = res.status === "ok" ? res.lastModified : undefined;
    await db
      .insert(schema.feedFiles)
      .values({ path, lastModified: lm ?? null, checkedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.feedFiles.path,
        set: {
          checkedAt: new Date(),
          ...(lm !== undefined ? { lastModified: lm } : {}),
        },
      });
  }

  // Any single file failing is recorded and skipped, never fatal: its
  // Last-Modified is left untouched so the next run retries it.
  const failures: string[] = [];
  const fail = (path: string, err: unknown) =>
    failures.push(`${path}: ${err instanceof Error ? err.message : err}`);

  try {
    // Reference data: on first run, when forced, or when the feed republishes it.
    const [{ value: partyCount }] = await db
      .select({ value: count() })
      .from(schema.parties);
    let referenceSynced = false;
    const refFiles = [
      ["parties.xml", "parties"],
      ["electorates.xml", "electorates"],
      ["candidates.xml", "candidates"],
    ] as const;
    const needRef = force || partyCount === 0;
    const fetched = await Promise.all(
      refFiles.map(async ([path, tag]) => {
        requests++;
        try {
          const res = await fetchFeedFile(path, {
            rootTag: tag,
            ifModifiedSince: needRef ? null : lastModified.get(path),
          });
          if (res.status === "not-modified") notModified++;
          return [path, res] as const;
        } catch (err) {
          fail(path, err);
          return null;
        }
      }),
    );
    const refs = fetched.filter((r) => r !== null);
    if (refs.some(([, r]) => r.status === "ok")) {
      const body = (p: string) => {
        const r = refs.find(([path]) => path === p)?.[1];
        return r?.status === "ok" ? r.body : null;
      };
      const parties = body("parties.xml");
      const electorates = body("electorates.xml");
      const candidates = body("candidates.xml");
      await upsertReference({
        parties: parties ? parseParties(parties) : [],
        electorates: electorates ? parseElectorates(electorates) : [],
        candidates: candidates ? parseCandidates(candidates) : [],
      });
      referenceSynced = true;
    }
    for (const [path, res] of refs) await remember(path, res);

    // National results.
    let electionChanged = false;
    try {
      const election = await get("election.xml", "election");
      if (election.status === "ok") {
        electionChanged = await storeElection(parseElection(election.body), {
          stage,
        });
      }
      await remember("election.xml", election);
    } catch (err) {
      fail("election.xml", err);
    }

    // Electorate results, each with its own If-Modified-Since.
    const eNos = Array.from({ length: ELECTORATE_COUNT }, (_, i) => i + 1);
    const changed = await mapLimit(eNos, CONCURRENCY, async (eNo) => {
      const path = electoratePath(eNo);
      try {
        const res = await get(path, "electorate");
        const stored =
          res.status === "ok"
            ? await storeElectorate(parseElectorateResult(res.body), { stage })
            : false;
        await remember(path, res);
        return stored;
      } catch (err) {
        fail(path, err);
        return false;
      }
    });
    const electoratesChanged = changed.filter(Boolean).length;

    await db
      .update(schema.scrapeRuns)
      .set({
        status: "ok",
        finishedAt: new Date(),
        requests,
        electionChanged,
        electoratesChanged,
        error: failures.length ? failures.join("\n") : null,
      })
      .where(eq(schema.scrapeRuns.id, run.id));

    return {
      failures,
      runId: run.id,
      requests,
      notModified,
      electionChanged,
      electoratesChanged,
      referenceSynced,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    await db
      .update(schema.scrapeRuns)
      .set({
        status: "error",
        finishedAt: new Date(),
        requests,
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(schema.scrapeRuns.id, run.id));
    throw err;
  }
}
