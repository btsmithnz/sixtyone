"use client";

import { useEffect, useRef } from "react";

/** How long to keep lining up a linked section while the page settles. */
const SETTLE_MS = 5000;

/**
 * Brings the element with this id into view, and keeps it there while the
 * page settles. The browser does this itself for /page#id, but only for an
 * element already on the page when it looks: a section that streams in a
 * moment later is missed, and one can move when content above it streams in.
 * So this lines it up as the page changes, and stops when the reader
 * scrolls, taps or types, or after a few seconds; then `onSettled` runs.
 * Returns a function that stops it early (without `onSettled`).
 */
export function settleScroll(id: string, onSettled?: () => void) {
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
    for (const e of takeover) removeEventListener(e, settled);
  };
  const settled = () => {
    stop();
    onSettled?.();
  };
  const timer = setTimeout(settled, SETTLE_MS);
  for (const e of takeover) addEventListener(e, settled, { passive: true });
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

/**
 * Opens a share page (like /party-vote) at its section, once per visit. The
 * page stays mounted (hidden) when you navigate away and its effects run
 * again when you come back, which would undo where you'd scrolled to; a ref
 * survives that. It's set once the scroll settles, not when it starts, as
 * dev mode runs effects twice. A #link wins (ScrollToHash handles it), so
 * the two don't fight.
 */
export function ScrollToSection({ id }: { id: string }) {
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current || location.hash) return;
    return settleScroll(id, () => {
      settled.current = true;
    });
  }, [id]);
  return null;
}
