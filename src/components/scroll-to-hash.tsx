"use client";

import { useEffect } from "react";

/** How long to keep lining up a linked section while the page settles. */
const SETTLE_MS = 5000;

/**
 * Brings the element with this id into view, and keeps it there while the
 * page settles. The browser does this itself for /page#id, but only for an
 * element already on the page when it looks: a section that streams in a
 * moment later is missed, and one can move when content above it streams in.
 * So this lines it up as the page changes, and stops when the reader
 * scrolls, taps or types, or after a few seconds. Returns the stop function.
 */
export function settleScroll(id: string) {
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
}

/**
 * Brings a section linked as /page#id into view on page load. It lives in
 * the root layout, so it only runs on a full load (the router handles #links
 * between pages).
 */
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) return settleScroll(id);
  }, []);
  return null;
}

/** Opens a share page (like /party-vote) at its section. */
export function ScrollToSection({ id }: { id: string }) {
  useEffect(() => settleScroll(id), [id]);
  return null;
}
