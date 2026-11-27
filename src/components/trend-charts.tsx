"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatTime } from "@/lib/format";

export type TrendSeries = { key: string; label: string; color: string };
export type TrendRow = { t: number; counted: number } & Record<string, number>;

type XMode = "time" | "counted";

/**
 * Series keys for the official result: a dashed line on from the end of the
 * night (`_to`, no tooltip of its own) to a dot (`_at`).
 */
const TO = "_to";
const AT = "_at";
const COUNTED_TICKS = [0, 25, 50, 75, 100];

/**
 * Line chart of how shares moved through the night. With `official`, the
 * official result is drawn as a dot just past the end of the night, joined
 * by a dashed line: it landed weeks later, so it has no place on the clock.
 */
export function TrendChart({
  rows,
  series,
  official,
  unit,
  referenceY,
  referenceLabel,
  height = 320,
}: {
  rows: TrendRow[];
  series: TrendSeries[];
  /** The official result for each series key, once it's in. */
  official?: Record<string, number> | null;
  unit: "%" | "seats";
  referenceY?: number;
  referenceLabel?: string;
  height?: number;
}) {
  const [x, setX] = useState<XMode>("time");
  const config: ChartConfig = Object.fromEntries(
    series.flatMap((s) => [
      [s.key, { label: s.label, color: s.color }],
      [`${s.key}${AT}`, { label: s.label, color: s.color }],
    ]),
  );

  const first = rows[0];
  const last = rows.at(-1);
  // A little past the end of the night, on either axis.
  const officialAt =
    official && first && last
      ? {
          t: last.t + Math.max((last.t - first.t) * 0.12, 15 * 60_000),
          counted: 112,
        }
      : null;
  const data: TrendRow[] =
    officialAt && official && last
      ? [
          ...rows.slice(0, -1),
          {
            ...last,
            ...Object.fromEntries(
              series.map((s) => [`${s.key}${TO}`, last[s.key]]),
            ),
          },
          {
            ...officialAt,
            official: 1,
            ...Object.fromEntries(
              series.flatMap((s) =>
                s.key in official
                  ? [
                      [`${s.key}${TO}`, official[s.key]],
                      [`${s.key}${AT}`, official[s.key]],
                    ]
                  : [],
              ),
            ),
          },
        ]
      : rows;

  if (rows.length < 2) {
    return (
      <div
        className="hatch grid place-items-center rounded-2xl text-center text-sm text-muted-foreground"
        style={{ height }}
      >
        <p className="max-w-[28ch] rounded-xl bg-card px-4 py-3">
          {official
            ? "Election night’s count wasn’t recorded here, so there’s nothing to chart."
            : "This fills in as results come through on the night."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <ToggleGroup
          value={[x]}
          onValueChange={(v) => v[0] && setX(v[0] as XMode)}
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Horizontal axis"
        >
          <ToggleGroupItem value="time">By time</ToggleGroupItem>
          <ToggleGroupItem value="counted">By % counted</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <ChartContainer config={config} className="w-full" style={{ height }}>
        <LineChart
          data={data}
          // Room above the plot for the "Official" label.
          margin={{ left: 0, right: 12, top: officialAt ? 22 : 8, bottom: 0 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 4" />
          <XAxis
            dataKey={x === "time" ? "t" : "counted"}
            type="number"
            domain={
              x === "time"
                ? ["dataMin", "dataMax"]
                : [0, officialAt ? 112 : 100]
            }
            ticks={x === "counted" ? COUNTED_TICKS : undefined}
            tickFormatter={(v: number) =>
              x === "counted"
                ? `${Math.round(v)}%`
                : last && v > last.t
                  ? "" // The gap before the official result isn't a time.
                  : formatTime(v)
            }
            tickLine={false}
            axisLine={false}
            minTickGap={36}
            className="num"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(v: number) => (unit === "%" ? `${v}%` : String(v))}
            className="num"
          />
          {referenceY !== undefined ? (
            <ReferenceLine
              y={referenceY}
              stroke="var(--foreground)"
              strokeDasharray="6 4"
              label={{
                value: referenceLabel,
                position: "insideTopLeft",
                fill: "var(--muted-foreground)",
                fontSize: 12,
              }}
            />
          ) : null}
          {officialAt ? (
            <ReferenceLine
              x={officialAt[x === "time" ? "t" : "counted"]}
              stroke="var(--muted-foreground)"
              strokeDasharray="2 4"
              label={{
                value: "Official",
                position: "top",
                // Ends at the line: centred, it would run off the chart.
                textAnchor: "end",
                fill: "var(--muted-foreground)",
                fontSize: 12,
              }}
            />
          ) : null}
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as TrendRow | undefined;
                  if (!row) return "";
                  return row.official
                    ? "Official result"
                    : `${formatTime(row.t)}, ${Math.round(row.counted)}% counted`;
                }}
                formatter={(value, name) => (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-2.5 rounded-[3px]"
                        style={{ background: config[name as string]?.color }}
                      />
                      {config[name as string]?.label}
                    </span>
                    <span className="num font-semibold">
                      {unit === "%" ? `${Number(value).toFixed(1)}%` : value}
                    </span>
                  </div>
                )}
              />
            }
          />
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              stroke={`var(--color-${s.key})`}
              strokeWidth={2.5}
              dot={false}
              type="monotone"
              isAnimationActive={false}
            />
          ))}
          {officialAt
            ? series.flatMap((s) => [
                <Line
                  key={`${s.key}${TO}`}
                  dataKey={`${s.key}${TO}`}
                  stroke={`var(--color-${s.key})`}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={false}
                  tooltipType="none"
                  isAnimationActive={false}
                />,
                <Line
                  key={`${s.key}${AT}`}
                  dataKey={`${s.key}${AT}`}
                  stroke="transparent"
                  dot={{
                    r: 4.5,
                    fill: `var(--color-${s.key})`,
                    stroke: "var(--card)",
                    strokeWidth: 1.5,
                  }}
                  isAnimationActive={false}
                />,
              ])
            : null}
        </LineChart>
      </ChartContainer>
    </div>
  );
}
