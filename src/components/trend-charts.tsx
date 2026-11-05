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

/** Line chart of how shares moved through the night. */
export function TrendChart({
  rows,
  series,
  unit,
  referenceY,
  referenceLabel,
  height = 320,
}: {
  rows: TrendRow[];
  series: TrendSeries[];
  unit: "%" | "seats";
  referenceY?: number;
  referenceLabel?: string;
  height?: number;
}) {
  const [x, setX] = useState<XMode>("time");
  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }]),
  );

  if (rows.length < 2) {
    return (
      <div
        className="hatch grid place-items-center rounded-2xl text-center text-sm text-muted-foreground"
        style={{ height }}
      >
        <p className="max-w-[28ch] rounded-xl bg-card px-4 py-3">
          This fills in as results come through on the night.
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
          data={rows}
          margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 4" />
          <XAxis
            dataKey={x === "time" ? "t" : "counted"}
            type="number"
            domain={x === "time" ? ["dataMin", "dataMax"] : [0, 100]}
            tickFormatter={(v: number) =>
              x === "time" ? formatTime(v) : `${Math.round(v)}%`
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
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as TrendRow | undefined;
                  return row
                    ? `${formatTime(row.t)}, ${Math.round(row.counted)}% counted`
                    : "";
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
        </LineChart>
      </ChartContainer>
    </div>
  );
}
