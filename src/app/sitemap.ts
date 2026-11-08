import type { MetadataRoute } from "next";
import mapData from "@/data/electorate-map.json";
import { getLastUpdated } from "@/lib/results";
import { SITE_URL } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const version = await getLastUpdated();
  const lastModified = version ? new Date(version) : undefined;
  const page = (
    path: string,
    priority: number,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
  ) => ({ url: `${SITE_URL}${path}`, lastModified, changeFrequency, priority });
  return [
    page("/", 1, "always"),
    page("/electorates", 0.8, "always"),
    page("/parliament", 0.7, "hourly"),
    ...[...mapData.general, ...mapData.maori].map((e) =>
      page(`/electorates/${e.slug}`, 0.6, "hourly"),
    ),
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
