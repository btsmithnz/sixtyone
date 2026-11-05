import type { Metadata } from "next";

export const SITE_NAME = "SixtyOne";
export const SITE_TAGLINE = "NZ election 2026 live results";
export const SITE_DESCRIPTION =
  "Live results for the 2026 New Zealand general election on Saturday 7 November: who's getting to 61 seats, every electorate on the map, and how the count unfolds.";

/**
 * Canonical origin. Vercel sets VERCEL_PROJECT_PRODUCTION_URL to the
 * production domain (also on preview builds), so canonical links and share
 * images always point at the real site. NEXT_PUBLIC_SITE_URL overrides it.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const OG_SIZE = { width: 1200, height: 630 };

/**
 * Open Graph + Twitter metadata for a page. `image` is a share-image route;
 * `version` (the results version) is appended so each update gets a new
 * image URL. Slack, Discord, iMessage and X cache previews by image URL, so
 * without it a link shared at 10pm could show the 8pm numbers.
 */
export function shareMetadata({
  title,
  description,
  path,
  image,
  imageAlt,
  version,
}: {
  title: string;
  description: string;
  path: string;
  image: string;
  imageAlt: string;
  version: number | null;
}): Metadata {
  const url = version ? `${image}?v=${version}` : image;
  const images = [{ url, alt: imageAlt, ...OG_SIZE, type: "image/png" }];
  return {
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_NZ",
      url: path,
      title,
      description,
      images,
    },
    twitter: { card: "summary_large_image", title, description, images },
  };
}
