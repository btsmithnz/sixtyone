"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MapShape = {
  eNo: number;
  name: string;
  slug: string;
  centroid: number[];
};

export type MapInset = {
  id: string;
  label: string;
  eNos: number[];
  viewBox: number[];
};

export type MapResult = {
  leader: { name: string; pNo: number | null; party: string } | null;
  marginPoints: number | null;
  percentCounted: number;
  complete: boolean;
  partyLeader: { pNo: number; party: string; percent: number } | null;
};

type Mode = "electorate" | "party";
type Roll = "general" | "maori";

export function ElectorateMap({
  sprite,
  width,
  height,
  general,
  maori,
  insets,
  results,
  colors,
}: {
  sprite: string;
  width: number;
  height: number;
  general: MapShape[];
  maori: MapShape[];
  insets: MapInset[];
  results: Record<number, MapResult>;
  /** CSS colour per p_no (0 = independent). */
  colors: Record<number, string>;
}) {
  const [roll, setRoll] = useState<Roll>("general");
  const [mode, setMode] = useState<Mode>("electorate");
  const [hover, setHover] = useState<{
    eNo: number;
    x: number;
    y: number;
    w?: number;
  } | null>(null);
  const router = useRouter();
  const patternId = useId().replace(/:/g, "");

  const shapes = roll === "general" ? general : maori;
  const shownInsets =
    roll === "general" ? insets : insets.filter((i) => i.id === "auckland");
  const byENo = new Map([...general, ...maori].map((s) => [s.eNo, s]));

  const fillFor = (eNo: number, hatchId: string) => {
    const r = results[eNo];
    const pNo = mode === "electorate" ? r?.leader?.pNo : r?.partyLeader?.pNo;
    const hasResult = mode === "electorate" ? !!r?.leader : !!r?.partyLeader;
    if (!r || !hasResult) return { fill: `url(#${hatchId})`, opacity: 1 };
    return {
      fill: colors[pNo ?? 0] ?? colors[0],
      opacity: r.complete ? 1 : 0.4 + 0.6 * (r.percentCounted / 100),
    };
  };

  // Legend: the parties actually leading somewhere in this view.
  const legend = new Map<number, string>();
  for (const s of shapes) {
    const r = results[s.eNo];
    const lead =
      mode === "electorate"
        ? r?.leader && { pNo: r.leader.pNo ?? 0, party: r.leader.party }
        : r?.partyLeader;
    if (lead) legend.set(lead.pNo ?? 0, lead.party);
  }

  const hovered = hover ? byENo.get(hover.eNo) : undefined;
  const hoveredResult = hover ? results[hover.eNo] : undefined;

  /**
   * Electorate shapes for one SVG view. The main map and each inset share
   * this; insets pass a thinner stroke and their own scaled hatch pattern, and
   * aren't keyboard stops (the main map already is).
   */
  const renderShapes = ({
    strokeWidth,
    hatchId,
    interactive,
  }: {
    strokeWidth: number;
    hatchId: string;
    interactive: boolean;
  }) => (
    <>
      {shapes.map((s) => {
        const { fill, opacity } = fillFor(s.eNo, hatchId);
        const label = `${s.name}: ${describe(results[s.eNo], mode)}`;
        return (
          <a
            key={s.eNo}
            href={`/electorates/${s.slug}`}
            aria-label={label}
            tabIndex={interactive ? 0 : -1}
            onClick={(e) => {
              e.preventDefault();
              router.push(`/electorates/${s.slug}`);
            }}
            onFocus={
              interactive
                ? () => setHover({ eNo: s.eNo, x: -1, y: -1 })
                : undefined
            }
            onBlur={interactive ? () => setHover(null) : undefined}
            className="outline-none"
          >
            <use
              href={`${sprite}#e${s.eNo}`}
              fill={fill}
              fillOpacity={opacity}
              stroke="var(--card)"
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              className="cursor-pointer transition-[fill,fill-opacity] duration-500"
            />
          </a>
        );
      })}
      {/* The hover outline goes on top of every shape. Drawn on the shape
          itself, neighbours later in the document would paint over the
          outer half of its stroke on some sides but not others. */}
      {hover ? (
        <use
          href={`${sprite}#e${hover.eNo}`}
          aria-hidden
          fill="none"
          stroke="var(--ink)"
          strokeWidth={strokeWidth * 3}
          strokeLinejoin="round"
          className="pointer-events-none"
        />
      ) : null}
    </>
  );

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = (e.target as Element).closest("a");
    const href = target?.getAttribute("href");
    const slug = href?.split("/").pop();
    const shape = slug ? shapes.find((s) => s.slug === slug) : undefined;
    if (!shape) return setHover(null);
    const box = e.currentTarget.getBoundingClientRect();
    setHover({
      eNo: shape.eNo,
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      w: box.width,
    });
  };

  return (
    <section aria-labelledby="map-heading" className="sticker p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="map-heading"
          className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
        >
          The map
        </h2>
        <div className="flex flex-wrap gap-2">
          <ToggleGroup
            value={[roll]}
            onValueChange={(v) => v[0] && setRoll(v[0] as Roll)}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Which electorates"
          >
            <ToggleGroupItem value="general">General</ToggleGroupItem>
            <ToggleGroupItem value="maori">Māori</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            value={[mode]}
            onValueChange={(v) => v[0] && setMode(v[0] as Mode)}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Colour by"
          >
            <ToggleGroupItem value="electorate">Candidate vote</ToggleGroupItem>
            <ToggleGroupItem value="party">Party vote</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {mode === "electorate"
          ? "Coloured by the candidate in front. Paler means less of the vote is counted."
          : "Coloured by the party winning the party vote there."}
      </p>

      <div
        className="relative mt-4 grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="mx-auto h-auto max-h-[680px] w-full"
          aria-label={`Map of ${roll === "general" ? "general" : "Māori"} electorates`}
        >
          <defs>
            <pattern
              id={patternId}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill="var(--card)" />
              <rect width="2.5" height="6" fill="var(--hatch)" />
            </pattern>
          </defs>
          {renderShapes({
            strokeWidth: 1,
            hatchId: patternId,
            interactive: true,
          })}
          {shownInsets.map((inset) => {
            const [x, y, w, h] = inset.viewBox;
            return (
              <g key={inset.id} aria-hidden className="pointer-events-none">
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  rx={4}
                />
                <text
                  x={x + w + 8}
                  y={y + h / 2}
                  dominantBaseline="middle"
                  className="fill-foreground font-display text-[22px] font-bold"
                >
                  {inset.label}
                </text>
              </g>
            );
          })}
        </svg>

        <div
          className={cn(
            "grid content-start gap-3",
            shownInsets.length > 1 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {shownInsets.map((inset) => {
            const [, , w] = inset.viewBox;
            return (
              <figure
                key={inset.id}
                className={cn(
                  "overflow-hidden rounded-2xl bg-secondary/50 p-2",
                  inset.id === "auckland" &&
                    shownInsets.length > 1 &&
                    "col-span-2",
                )}
              >
                <figcaption className="px-1 text-sm font-semibold">
                  {inset.label}
                </figcaption>
                <svg
                  viewBox={inset.viewBox.join(" ")}
                  className={cn(
                    "h-auto w-full",
                    inset.id === "auckland" ? "max-h-[420px]" : "max-h-[200px]",
                  )}
                  aria-label={`${inset.label} close-up`}
                >
                  <defs>
                    <pattern
                      id={`${patternId}-${inset.id}`}
                      width={w / 80}
                      height={w / 80}
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(45)"
                    >
                      <rect width={w / 80} height={w / 80} fill="var(--card)" />
                      <rect
                        width={w / 200}
                        height={w / 80}
                        fill="var(--hatch)"
                      />
                    </pattern>
                  </defs>
                  {renderShapes({
                    strokeWidth: w / 260,
                    hatchId: `${patternId}-${inset.id}`,
                    interactive: false,
                  })}
                </svg>
              </figure>
            );
          })}
        </div>

        {hovered ? (
          <MapTooltip
            name={hovered.name}
            result={hoveredResult}
            mode={mode}
            x={hover?.x ?? -1}
            y={hover?.y ?? -1}
            containerWidth={hover?.w ?? 0}
            color={(pNo) => colors[pNo ?? 0] ?? colors[0]}
          />
        ) : null}
      </div>

      <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {[...legend.entries()]
          .sort((a, b) => a[1].localeCompare(b[1]))
          .map(([pNo, party]) => (
            <li key={pNo} className="flex items-center gap-1.5">
              <span
                className="size-3.5 rounded-[4px] border border-ink/20"
                style={{ background: colors[pNo] ?? colors[0] }}
              />
              {party}
            </li>
          ))}
        <li className="flex items-center gap-1.5 text-muted-foreground">
          <span className="hatch size-3.5 rounded-[4px] border border-ink/20" />
          No results yet
        </li>
      </ul>
    </section>
  );
}

function describe(r: MapResult | undefined, mode: Mode) {
  if (!r) return "no results yet";
  if (mode === "party") {
    return r.partyLeader
      ? `${r.partyLeader.party} leads the party vote with ${formatPct(r.partyLeader.percent)}`
      : "no results yet";
  }
  if (!r.leader) return "no results yet";
  return `${r.leader.name} (${r.leader.party}) ${r.complete ? "won" : "leads"}${
    r.marginPoints !== null ? ` by ${formatPct(r.marginPoints)}` : ""
  }, ${formatPct(r.percentCounted, 0)} counted`;
}

function MapTooltip({
  name,
  result,
  mode,
  x,
  y,
  containerWidth,
  color,
}: {
  containerWidth: number;
  name: string;
  result: MapResult | undefined;
  mode: Mode;
  x: number;
  y: number;
  color: (pNo: number | null) => string;
}) {
  // Keyboard focus has no pointer position: pin the card to the top left.
  const pinned = x < 0;
  const lead =
    mode === "electorate"
      ? result?.leader && {
          title: result.leader.name,
          sub: result.leader.party,
          pNo: result.leader.pNo,
          stat:
            result.marginPoints !== null
              ? `${result.complete ? "Won" : "Ahead"} by ${formatPct(result.marginPoints)}`
              : "",
        }
      : result?.partyLeader && {
          title: result.partyLeader.party,
          sub: "Top party vote",
          pNo: result.partyLeader.pNo,
          stat: formatPct(result.partyLeader.percent),
        };
  return (
    <div
      aria-hidden
      className="sticker pointer-events-none absolute z-10 w-60 !rounded-xl p-3 text-sm"
      style={
        pinned
          ? { left: 0, top: 0 }
          : {
              // Flip to the left of the pointer near the right edge.
              left:
                x + 16 + 240 > containerWidth
                  ? Math.max(0, x - 16 - 240)
                  : x + 16,
              top: Math.max(0, y + 16),
            }
      }
    >
      <div className="font-display text-lg leading-tight font-extrabold">
        {name}
      </div>
      {lead ? (
        <div className="mt-2 flex items-start gap-2">
          <span
            className="mt-1 size-3 shrink-0 rounded-full"
            style={{ background: color(lead.pNo) }}
          />
          <div>
            <div className="font-semibold">{lead.title}</div>
            <div className="text-muted-foreground">{lead.sub}</div>
            <div className="num mt-1">{lead.stat}</div>
          </div>
        </div>
      ) : (
        <div className="mt-1 text-muted-foreground">No results yet</div>
      )}
      {result && result.percentCounted > 0 ? (
        <div className="mt-2 border-t border-border pt-2 text-muted-foreground">
          <span className="num">{formatPct(result.percentCounted, 0)}</span> of
          voting places counted
        </div>
      ) : null}
    </div>
  );
}
