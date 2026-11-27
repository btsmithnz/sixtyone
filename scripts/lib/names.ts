import { foldDiacritics } from "../../src/lib/text";

/**
 * Lenient key for matching the Commission's names to stored ones: case,
 * macrons, curly quotes and spacing don't matter.
 */
export const nameKey = (s: string) =>
  foldDiacritics(s.normalize("NFKC"))
    .replace(/[‘’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
