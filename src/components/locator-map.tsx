import mapData from "@/data/electorate-map.json";

/** A small NZ map highlighting one electorate. Pure SVG, server-rendered. */
export function LocatorMap({
  eNo,
  color,
  label,
}: {
  eNo: number;
  color: string;
  label: string;
}) {
  const roll = eNo > 64 ? mapData.maori : mapData.general;
  const shape = roll.find((s) => s.eNo === eNo);
  // Zoom out from the electorate enough to see where it is.
  const [x0, y0, x1, y1] = shape?.bounds ?? [
    0,
    0,
    mapData.width,
    mapData.height,
  ];
  const size = Math.max(x1 - x0, y1 - y0, 160) * 2.4;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const viewBox = [cx - size / 2, cy - size / 2, size, size].join(" ");

  return (
    <svg
      viewBox={viewBox}
      className="aspect-square w-full rounded-2xl bg-secondary/60"
      role="img"
      aria-label={label}
    >
      {roll.map((s) => (
        <use
          key={s.eNo}
          href={`${mapData.sprite}#e${s.eNo}`}
          fill={s.eNo === eNo ? color : "var(--hatch)"}
          stroke="var(--card)"
          strokeWidth={size / 400}
        />
      ))}
      <use
        href={`${mapData.sprite}#e${eNo}`}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={size / 160}
        strokeLinejoin="round"
      />
    </svg>
  );
}
