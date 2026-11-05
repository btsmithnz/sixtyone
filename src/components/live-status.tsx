"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/format";

const POLL_MS = 30_000;

/**
 * Shows when results last changed and refreshes the page when the scraper
 * stores something new. It polls a tiny cached endpoint rather than
 * re-rendering on a timer, so an idle night costs nothing.
 */
export function LiveStatus({ updatedAt }: { updatedAt: number | null }) {
  const router = useRouter();
  const known = useRef(updatedAt);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    known.current = updatedAt;
  }, [updatedAt]);

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
          if (latest && latest !== known.current) {
            known.current = latest;
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
          Updated <span className="num">{formatTime(updatedAt)}</span>
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
