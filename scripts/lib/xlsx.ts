/**
 * Just enough of an .xlsx reader for the Electoral Commission's statistics
 * spreadsheets: unzips with node:zlib and reads cell text with
 * fast-xml-parser. Every cell comes back as a string (the Commission stores
 * numbers as text anyway), with "" for empty cells.
 */
import { inflateRawSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";

function unzip(buf: Buffer): Map<string, Buffer> {
  // End of central directory: the last 22+ bytes, signature 0x06054b50.
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Bad zip entry");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start =
      local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, inflateRawSync(data));
    else throw new Error(`Unsupported zip compression ${method} for ${name}`);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  // Elements only: cells also have a `t` (type) attribute.
  isArray: (name, _jpath, _leaf, isAttribute) =>
    !isAttribute &&
    ["sheet", "Relationship", "row", "c", "si", "r", "t"].includes(name),
});

type Node = Record<string, unknown>;
const text = (v: unknown): string => {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.map(text).join("");
  if (typeof v === "object") return text((v as Node)["#text"]);
  // fast-xml-parser decodes named entities but not numeric ones (&#257; = ā).
  return String(v).replace(/&#(x?)([0-9a-f]+);/gi, (_, hex, n) =>
    String.fromCodePoint(Number.parseInt(n, hex ? 16 : 10)),
  );
};

/** Plain or rich text (`<t>`, or runs of `<r><t>`), as in `<si>` and `<is>`. */
const richText = (n: unknown): string => {
  const node = (n ?? {}) as Node;
  return node.r ? text((node.r as Node[]).map((r) => r.t)) : text(node.t);
};

/** "AB12" → 27 (zero-based column index). */
const columnIndex = (ref: string) =>
  [...ref.replace(/\d+$/, "")].reduce(
    (n, ch) => n * 26 + ch.charCodeAt(0) - 64,
    0,
  ) - 1;

/** Reads every sheet in a workbook as rows of cell strings, keyed by sheet name. */
export function readXlsx(buf: Buffer): Map<string, string[][]> {
  const files = unzip(buf);
  const xml = (name: string) => {
    const f = files.get(name);
    return f ? (parser.parse(f.toString("utf8")) as Node) : undefined;
  };

  const shared =
    (
      (xml("xl/sharedStrings.xml")?.sst as Node | undefined)?.si as
        | Node[]
        | undefined
    )?.map(richText) ?? [];

  const rels = new Map(
    (
      ((xml("xl/_rels/workbook.xml.rels")?.Relationships as Node)
        ?.Relationship as Node[]) ?? []
    ).map((r) => [String(r.Id), String(r.Target).replace(/^\/?(xl\/)?/, "")]),
  );
  const sheets = ((xml("xl/workbook.xml")?.workbook as Node).sheets as Node)
    .sheet as Node[];

  const out = new Map<string, string[][]>();
  for (const sheet of sheets) {
    const target = rels.get(String(sheet["r:id"]));
    if (!target) throw new Error(`No file for sheet ${sheet.name}`);
    const ws = xml(`xl/${target}`)?.worksheet as Node;
    const rows = ((ws.sheetData as Node)?.row as Node[] | undefined) ?? [];
    out.set(
      String(sheet.name),
      rows.map((row) => {
        const cells: string[] = [];
        for (const c of (row.c as Node[] | undefined) ?? []) {
          const v = text(c.v);
          cells[columnIndex(String(c.r))] =
            c.t === "s"
              ? (shared[Number(v)] ?? "")
              : c.t === "inlineStr"
                ? richText(c.is)
                : v;
        }
        return Array.from(cells, (v) => (v ?? "").replace(/\r/g, "").trim());
      }),
    );
  }
  return out;
}
