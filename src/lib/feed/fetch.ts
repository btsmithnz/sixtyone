import { assertComplete } from "./parse";

export const FEED_BASE_URL = (
  process.env.FEED_BASE_URL ?? "https://media.election.net.nz/xml"
).replace(/\/$/, "");

const USER_AGENT = "SixtyOne election results (+https://github.com)";

export type FetchResult =
  | { status: "not-modified" }
  | { status: "ok"; body: string; lastModified: string | null };

/** Feed file path for an electorate, e.g. 7 -> "e07/e07.xml". */
export const electoratePath = (eNo: number) => {
  const nn = String(eNo).padStart(2, "0");
  return `e${nn}/e${nn}.xml`;
};

/**
 * GET a feed file with If-Modified-Since, retries and a completeness check.
 * The Commission's origin sits behind Cloudflare with caching disabled, and
 * large files occasionally 502 or truncate, so be defensive.
 */
export async function fetchFeedFile(
  path: string,
  opts: { ifModifiedSince?: string | null; rootTag: string; attempts?: number },
): Promise<FetchResult> {
  const attempts = opts.attempts ?? 3;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(400 * 2 ** i);
    try {
      const res = await fetch(`${FEED_BASE_URL}/${path}`, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/xml",
          ...(opts.ifModifiedSince
            ? { "if-modified-since": opts.ifModifiedSince }
            : {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 304) return { status: "not-modified" };
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      const body = await res.text();
      assertComplete(body, opts.rootTag);
      return {
        status: "ok",
        body,
        lastModified: res.headers.get("last-modified"),
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`${path}: ${String(lastError)}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run async tasks with a concurrency limit, preserving order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
