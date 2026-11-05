import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

/** Lets people add SixtyOne to their home screen for election night. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME}: NZ election 2026 live results`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#f3f2ff",
    theme_color: "#5b3df5",
    lang: "en-NZ",
    categories: ["news", "politics"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
