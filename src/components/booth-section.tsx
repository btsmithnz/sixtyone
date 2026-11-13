import mapData from "@/data/electorate-map.json";
import { getBoothResults } from "@/lib/booths";
import { BoothExplorer } from "./booth-explorer";

/** Booth-by-booth results, once the Commission's voting place data is loaded. */
export async function BoothSection({
  eNo,
  name,
  slug,
}: {
  eNo: number;
  name: string;
  slug: string;
}) {
  const data = await getBoothResults(eNo);
  if (!data?.places.length) return null;
  return (
    <BoothExplorer
      data={data}
      electorate={name}
      slug={slug}
      boundaryUrl={`${mapData.boundaries}/${eNo}.json`}
    />
  );
}
