/**
 * Minimal RFC 4180 CSV helpers for the data scripts. Fields may be quoted and
 * contain commas or doubled quotes, but not newlines (none of our inputs do).
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let v = "";
      i++;
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            v += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else v += line[i++];
      }
      out.push(v);
      i++; // the comma
    } else {
      const end = line.indexOf(",", i);
      if (end === -1) {
        out.push(line.slice(i));
        break;
      }
      out.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return out;
}

const quote = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsvRow = (values: (string | number | null | undefined)[]) =>
  values.map(quote).join(",");

/** Streams a CSV file as objects keyed by its header row. */
export async function* readCsv(
  file: string,
): AsyncGenerator<Record<string, string>> {
  const lines = createInterface({
    input: createReadStream(file, "utf8"),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  let header: string[] | undefined;
  for await (const line of lines) {
    if (!line) continue;
    if (!header) {
      header = parseCsvLine(line.replace(/^﻿/, ""));
      continue;
    }
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] ?? "";
    yield row;
  }
}
