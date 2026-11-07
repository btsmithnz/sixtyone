"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatDay, formatTime, nzDateKey } from "@/lib/format";

const POLL_MS = 60_000;

/**
 * Today's NZ date, read in the browser only. The page may have been rendered
 * (and cached) on an earlier day, so the server can't know what "today" is
 * for the viewer: it renders null and the client fills it in on hydration.
 * Re-read on every render, so the minute poll picks up midnight.
 */
const subscribe = () => () => {};
function useNzToday() {
  return useSyncExternalStore(
    subscribe,
    () => nzDateKey(Date.now()),
    () => null,
  );
}

/** "4:19pm", or "4:19pm, Fri 6 Nov" when that wasn't today. */
function updatedLabel(updatedAt: number, today: string | null) {
  const time = formatTime(updatedAt);
  return today && nzDateKey(updatedAt) !== today
    ? `${time}, ${formatDay(updatedAt)}`
    : time;
}

/**
 * Shows when results last changed and refreshes the page when the scraper
 * stores something new. It polls a tiny cached endpoint rather than
 * re-rendering on a timer, so an idle night costs nothing.
 */
export function LiveStatus({
  updatedAt,
  version,
}: {
  /** When the results shown on this page last changed (for the label). */
  updatedAt: number | null;
  /** Results version the page data was read at (same value /api/status reports). */
  version: number | null;
}) {
  const router = useRouter();
  const today = useNzToday();
  const known = useRef(version);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    known.current = version;
  }, [version]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (document.visibilityState === "visible") {
        setChecking(true);
        try {
          const res = await fetch("/api/status", { cache: "no-store" });
          const { updatedAt: latest } = (await res.json()) as {
            updatedAt: number | null;
          };
          // `known` only advances when a render delivers the new version
          // (the effect above), so an aborted or stale refresh is retried on
          // the next poll instead of being forgotten.
          // Newer, not just different: /api/status can briefly lag a page.
          if (latest && latest > (known.current ?? 0)) {
            router.refresh();
          }
        } catch {
          // Offline or a blip: try again next tick.
        } finally {
          setChecking(false);
        }
      }
      timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        poll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span
        aria-hidden
        className="size-2.5 rounded-full bg-live"
        style={{ animation: "live-pulse 2s ease-in-out infinite" }}
      />
      {updatedAt ? (
        <span>
          Updated <span className="num">{updatedLabel(updatedAt, today)}</span>
          <span className="sr-only">
            {checking ? ", checking for news" : ""}
          </span>
        </span>
      ) : (
        <span>Waiting for the first results</span>
      )}
    </span>
  );
}
