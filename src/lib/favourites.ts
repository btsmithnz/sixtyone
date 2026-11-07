import { useSyncExternalStore } from "react";

/**
 * Favourite electorates, kept in this browser only (no accounts, nothing sent
 * to the server). Stored as electorate numbers in the order they were added.
 *
 * Read with useSyncExternalStore: the server snapshot is null, because the
 * server can't know a visitor's favourites. Pages are cached and identical for
 * everyone, and the favourites fill in on hydration.
 */
const KEY = "sixtyone:favourites";
const EVENT = "sixtyone:favourites";
const EMPTY: number[] = [];

let cachedRaw: string | null | undefined;
let cached: number[] = EMPTY;

function read(): number[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Storage blocked (private mode, site data off): behave as empty.
  }
  // Same string, same array: useSyncExternalStore needs a stable snapshot.
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cached = Array.isArray(parsed)
      ? [...new Set(parsed.filter((n): n is number => Number.isInteger(n)))]
      : EMPTY;
  } catch {
    cached = EMPTY;
  }
  return cached;
}

function write(next: number[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Can't persist; the change still shows until the page is left.
    cachedRaw = JSON.stringify(next);
    cached = next;
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  // `storage` fires for changes made in other tabs; EVENT for this one.
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** Favourite electorate numbers, or null before hydration. */
export function useFavourites(): number[] | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function toggleFavourite(eNo: number) {
  const current = read();
  write(
    current.includes(eNo)
      ? current.filter((n) => n !== eNo)
      : [...current, eNo],
  );
}
