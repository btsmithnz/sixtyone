import mapData from "@/data/electorate-map.json";
import { getBoothResults } from "@/lib/booths";
import { BoothExplorer } from "./booth-explorer";

/** Booth-by-booth results, once the Commission's voting place data is loaded. */
export async function BoothSection({
  eNo,
  name,
}: {
  eNo: number;
  name: string;
}) {
  const data = await getBoothResults(eNo);
  if (!data?.places.length) return null;
  return (
    <BoothExplorer
      data={data}
      electorate={name}
      boundaryUrl={`${mapData.boundaries}/${eNo}.json`}
    />
  );
}
