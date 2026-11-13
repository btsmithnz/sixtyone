import mapData from "@/data/electorate-map.json";
import { getBoothResults, getHomePlaces } from "@/lib/booths";
import { findStandouts, type Vote } from "@/lib/standouts";
import { BoothExplorer } from "./booth-explorer";

/** Standout places at the top of an electorate's voting place list, per vote. */
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
  const home = homes[eNo] ?? [];
  const standoutsIn = (vote: Vote) =>
    findStandouts(data, home, [vote]).slice(0, STANDOUTS);
  return (
    <BoothExplorer
      data={data}
      electorate={name}
      slug={slug}
      standouts={{
        candidate: standoutsIn("candidate"),
        party: standoutsIn("party"),
      }}
      boundaryUrl={`${mapData.boundaries}/${eNo}.json`}
    />
  );
}
