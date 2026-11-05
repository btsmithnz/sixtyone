/**
 * Builds the app icons from the "61" sticker in the site header.
 *
 *   pnpm icons:build
 *
 * Favicon SVGs can't load web fonts, so the "61" is converted to outlines
 * using Bricolage Grotesque (ExtraBold, condensed) from Google Fonts.
 *
 * Outputs (Next.js metadata file conventions):
 *  - src/app/icon.svg        modern browsers
 *  - src/app/apple-icon.png  iOS home screen (opaque, 180×180)
 *  - src/app/favicon.ico     legacy fallback (16, 32 and 48px PNGs in an ICO)
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import opentype from "opentype.js";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = path.join(ROOT, "src/app");

// Brand tokens, matching src/app/globals.css.
const INK = "#1b1a3a";
const VIOLET = "#5b3df5";
const PAPER = "#f3f2ff";

async function loadFont() {
  const css = await fetch(
    "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@24,75,800&text=61",
    // A plain user agent gets TrueType, which opentype.js can read.
    { headers: { "user-agent": "curl/8" } },
  ).then((r) => r.text());
  const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
  if (!url) throw new Error(`No font URL in Google Fonts response:\n${css}`);
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  return opentype.parse(buf);
}

/** The sticker: violet rounded square, ink outline, hard shadow, slight tilt. */
function sticker(font: opentype.Font, { size = 64 } = {}) {
  const c = size / 2 - size * 0.02;
  const side = size * 0.76;
  const radius = side * 0.24;
  const stroke = size * 0.04;
  const shadow = size * 0.05;
  const x = c - side / 2;

  // Fit the glyphs to ~58% of the square's height, centred optically.
  const probe = font.getPath("61", 0, 0, 100);
  const bb = probe.getBoundingBox();
  const scale = (side * 0.58) / (bb.y2 - bb.y1);
  const glyphs = font.getPath(
    "61",
    c - ((bb.x1 + bb.x2) / 2) * scale,
    c - ((bb.y1 + bb.y2) / 2) * scale,
    100 * scale,
  );
  const d = glyphs.toPathData(2);

  return `<g transform="rotate(-6 ${c} ${c})">
    <rect x="${x + shadow}" y="${x + shadow}" width="${side}" height="${side}" rx="${radius}" fill="${INK}"/>
    <rect x="${x}" y="${x}" width="${side}" height="${side}" rx="${radius}" fill="${VIOLET}" stroke="${INK}" stroke-width="${stroke}"/>
    <path d="${d}" fill="#fff"/>
  </g>`;
}

const svg = (body: string, size: number, background?: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${
    background
      ? `<rect width="${size}" height="${size}" fill="${background}"/>`
      : ""
  }${body}</svg>`;

/** Packs PNGs into an .ico (PNG-compressed entries, supported everywhere since Vista). */
function ico(pngs: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function main() {
  const font = await loadFont();

  const icon = svg(sticker(font), 64);
  await writeFile(path.join(APP, "icon.svg"), `${icon}\n`);

  // iOS fills transparency with black, so the home-screen icon sits on paper.
  const apple = svg(
    `<g transform="translate(18 18) scale(${144 / 64})">${sticker(font)}</g>`,
    180,
    PAPER,
  );
  await sharp(Buffer.from(apple))
    .png()
    .toFile(path.join(APP, "apple-icon.png"));

  const pngs = await Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      data: await sharp(Buffer.from(icon), { density: (72 * size) / 64 })
        .resize(size, size)
        .png()
        .toBuffer(),
    })),
  );
  await writeFile(path.join(APP, "favicon.ico"), ico(pngs));

  console.log("Wrote src/app/icon.svg, apple-icon.png and favicon.ico");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
