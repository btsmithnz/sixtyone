import mapData from "@/data/electorate-map.json";
import {
  displayCandidateName,
  PARTY_STYLES,
  partyColorVar,
  partyStyle,
} from "@/lib/parties";
import type { ElectorateSummary } from "@/lib/results";
import { ElectorateMap, type MapResult } from "./electorate-map";

/** Server wrapper: trims results down to what the map needs. */
export function MapSection({
  electorates,
}: {
  electorates: ElectorateSummary[];
}) {
  const results: Record<number, MapResult> = {};
  for (const e of electorates) {
    const lead = e.votesCast > 0 ? e.candidates[0] : undefined;
    results[e.eNo] = {
      leader: lead
        ? {
            name: displayCandidateName(lead.name),
            pNo: lead.pNo,
            party: partyStyle(lead.pNo).short,
          }
        : null,
      marginPoints: e.marginPoints,
      percentCounted: e.percentCounted,
      complete: e.complete,
      partyLeader: e.partyVoteLeader
        ? {
            ...e.partyVoteLeader,
            party: partyStyle(e.partyVoteLeader.pNo).short,
          }
        : null,
    };
  }
  const colors: Record<number, string> = { 0: partyColorVar(0) };
  for (const pNo of Object.keys(PARTY_STYLES)) {
    colors[Number(pNo)] = partyColorVar(Number(pNo));
  }

  return (
    <ElectorateMap
      sprite={mapData.sprite}
      width={mapData.width}
      height={mapData.height}
      general={mapData.general}
      maori={mapData.maori}
      insets={mapData.insets}
      results={results}
      colors={colors}
    />
  );
}
