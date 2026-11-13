"use client";

import { useEffect } from "react";

/** How long to keep lining up a linked section while the page settles. */
const SETTLE_MS = 5000;

/**
 * Brings a section linked as /page#id into view on page load. The browser
 * does this itself, but only for a section already on the page when it
 * looks: a section that streams in a moment later is missed, and one can
 * move when content above it streams in. So this lines it up as the page
 * changes, and stops when the reader scrolls, taps or types, or after a few
 * seconds. It lives in the root layout, so it only runs on a full load (the
 * router handles #links between pages).
 */
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;

    let frame = 0;
    const align = () => {
      frame = 0;
      const el = document.getElementById(id);
      if (!el) return;
      const margin = Number.parseFloat(getComputedStyle(el).scrollMarginTop);
      if (Math.abs(el.getBoundingClientRect().top - (margin || 0)) > 2)
        el.scrollIntoView();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(align);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();

    const takeover = ["wheel", "touchstart", "keydown", "pointerdown"];
    const stop = () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      for (const e of takeover) removeEventListener(e, stop);
    };
    const timer = setTimeout(stop, SETTLE_MS);
    for (const e of takeover) addEventListener(e, stop, { passive: true });
    return stop;
  }, []);

  return null;
}
