import mapData from "@/data/electorate-map.json";
import { getBoothResults, getHomePlaces } from "@/lib/booths";
import { findStandouts } from "@/lib/standouts";
import { BoothExplorer } from "./booth-explorer";

/** Standout places shown above an electorate's booth map. */
const STANDOUTS = 3;

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
  const [data, homes] = await Promise.all([
    getBoothResults(eNo),
    getHomePlaces(),
  ]);
  if (!data?.places.length) return null;
  return (
    <BoothExplorer
      data={data}
      electorate={name}
      slug={slug}
      standouts={findStandouts(data, homes[eNo] ?? []).slice(0, STANDOUTS)}
      boundaryUrl={`${mapData.boundaries}/${eNo}.json`}
    />
  );
}
