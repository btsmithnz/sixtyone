"use client";

import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { formatPct } from "@/lib/format";
import { BASE_SEATS, majorityOf, raisedMajority } from "@/lib/seats";
import { cn } from "@/lib/utils";

export type SeatParty = {
  pNo: number;
  short: string;
  color: string;
  ink: string;
  seats: number;
};

type Side = "left" | "right" | "cross";

const CONFETTI = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2;
  const dist = 60 + (i % 4) * 22;
  return {
    dx: `${Math.cos(angle) * dist}px`,
    dy: `${Math.sin(angle) * dist - 30}px`,
    rot: `${(i % 2 ? 1 : -1) * (180 + i * 30)}deg`,
    hue: ["#5b3df5", "#ff3d7f", "#ffd60a", "#14b8a6"][i % 4],
    delay: `${(i % 5) * 30}ms`,
  };
});

export function RaceTo61({
  parties,
  houseSize,
  defaultBlocs,
  seatsSource,
  percentCounted,
}: {
  parties: SeatParty[];
  houseSize: number;
  defaultBlocs: { left: number[]; right: number[] };
  seatsSource: "feed" | "projected" | "none";
  /** Share of voting places counted. Nobody is "over the line" until it's 100. */
  percentCounted: number;
}) {
  const initial = useMemo(() => {
    const m: Record<number, Side> = {};
    for (const p of parties) {
      m[p.pNo] = defaultBlocs.left.includes(p.pNo)
        ? "left"
        : defaultBlocs.right.includes(p.pNo)
          ? "right"
          : "cross";
    }
    return m;
  }, [parties, defaultBlocs]);
  const [sides, setSides] = useState<Record<number, Side>>(initial);
  const sideOf = (pNo: number) => sides[pNo] ?? initial[pNo] ?? "cross";
  const customised = parties.some((p) => sideOf(p.pNo) !== initial[p.pNo]);

  const majority = majorityOf(houseSize);
  const bySeats = [...parties].sort((a, b) => b.seats - a.seats);
  const left = bySeats.filter((p) => sideOf(p.pNo) === "left");
  const right = bySeats.filter((p) => sideOf(p.pNo) === "right");
  const cross = bySeats.filter((p) => sideOf(p.pNo) === "cross");
  const sum = (ps: SeatParty[]) => ps.reduce((a, p) => a + p.seats, 0);
  const leftSeats = sum(left);
  const rightSeats = sum(right);
  const crossSeats = sum(cross);
  const counted = leftSeats + rightSeats + crossSeats;

  const blocName = (ps: SeatParty[], fallback: string) =>
    ps[0] ? `${ps[0].short}-led` : fallback;
  const leftName = blocName(left, "Left bloc");
  const rightName = blocName(right, "Right bloc");
  // A bloc can reach the majority on the first few votes counted (the
  // Commission allocates seats from the start), so it's only a win once every
  // voting place is in. Until then it's "enough so far".
  const ahead =
    leftSeats >= majority ? "left" : rightSeats >= majority ? "right" : null;
  const countDone = percentCounted >= 100;
  // How full each seat is drawn: the strip "loads in" as the count does.
  const fill = Math.min(100, Math.max(0, percentCounted));
  const winner = countDone ? ahead : null;

  // One tick per seat: left bloc from the left, right bloc from the right,
  // crossbench next to the right bloc, empty (uncounted) seats in the middle.
  const ticks: (SeatParty | null)[] = [];
  for (const p of left) for (let i = 0; i < p.seats; i++) ticks.push(p);
  const middle = houseSize - counted;
  for (let i = 0; i < middle; i++) ticks.push(null);
  for (const p of [...cross].reverse())
    for (let i = 0; i < p.seats; i++) ticks.push(p);
  for (const p of [...right].reverse())
    for (let i = 0; i < p.seats; i++) ticks.push(p);

  const verdict = (() => {
    if (counted === 0)
      return "No seats yet. The first results land soon after 7pm.";
    if (winner === "left")
      return `${leftName} government is over the line with ${leftSeats} seats.`;
    if (winner === "right")
      return `${rightName} government is over the line with ${rightSeats} seats.`;
    if (ahead) {
      const [name, seats] =
        ahead === "left" ? [leftName, leftSeats] : [rightName, rightSeats];
      return `${name} has ${seats} seats on the count so far, enough to govern. With ${formatPct(percentCounted)} of voting places counted, that can still change.`;
    }
    const lead = leftSeats >= rightSeats ? "left" : "right";
    const leadName = lead === "left" ? leftName : rightName;
    const short = majority - Math.max(leftSeats, rightSeats);
    return crossSeats > 0
      ? `Nobody's there yet. ${leadName} is ${short} short, so the crossbench holds the cards.`
      : `Nobody's there yet. ${leadName} is ${short} short of ${majority}.`;
  })();

  const move = (pNo: number, dir: -1 | 1) => {
    const order: Side[] = ["left", "cross", "right"];
    const i = order.indexOf(sideOf(pNo));
    const next = order[Math.min(2, Math.max(0, i + dir))];
    setSides((s) => ({ ...s, [pNo]: next }));
  };

  return (
    <section aria-labelledby="race-heading" className="sticker p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2
          id="race-heading"
          className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%] sm:text-4xl"
        >
          Who’s getting to {majority}?
        </h2>
        <p className="text-sm text-muted-foreground">
          {seatsSource === "projected"
            ? "Our seat projection from the count so far"
            : seatsSource === "feed"
              ? "Seats as allocated by the Electoral Commission so far"
              : null}
        </p>
        {houseSize > BASE_SEATS ? (
          <p className="basis-full text-sm font-medium">
            {/* Matches the "62*" logo, when it shows. */}
            {raisedMajority({ seatsSource, houseSize }) ? (
              <span className="font-bold text-live">* </span>
            ) : null}
            Overhang: a {houseSize}-seat House, so {majority} to govern.
          </p>
        ) : null}
      </div>

      {/* Bloc totals */}
      <div className="mt-5 flex items-end justify-between gap-4">
        <BlocTotal
          name={leftName}
          seats={leftSeats}
          majority={majority}
          state={ahead === "left" ? (countDone ? "won" : "ahead") : null}
          align="left"
        />
        <BlocTotal
          name={rightName}
          seats={rightSeats}
          majority={majority}
          state={ahead === "right" ? (countDone ? "won" : "ahead") : null}
          align="right"
        />
      </div>

      {/* The strip */}
      <div className="relative mt-3">
        <div
          className="grid h-14 overflow-hidden rounded-md sm:h-16 sm:gap-[2px] sm:overflow-visible sm:rounded-none"
          style={{
            gridTemplateColumns: `repeat(${houseSize}, minmax(0, 1fr))`,
          }}
          role="img"
          aria-label={`${leftName} ${leftSeats} seats, ${rightName} ${rightSeats} seats, crossbench ${crossSeats}, ${majority} needed to govern.`}
        >
          {ticks.map((p, i) =>
            p ? (
              // A pale tint says whose seat it is; the solid part rises with
              // the share of voting places counted.
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: seats are positional
                key={i}
                title={p.short}
                className="relative overflow-hidden transition-colors duration-500 sm:rounded-[3px]"
                style={{
                  background: `color-mix(in srgb, ${p.color} 28%, transparent)`,
                }}
              >
                <span
                  className="absolute inset-x-0 bottom-0 transition-[height,background-color] duration-1000 ease-out motion-reduce:transition-none"
                  style={{ height: `${fill}%`, background: p.color }}
                />
              </span>
            ) : (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: seats are positional
                key={i}
                title="Not yet allocated"
                className="hatch sm:rounded-[3px]"
              />
            ),
          )}
        </div>
        {/* One finish line in the middle: a majority is more than half the
            seats, so a bloc governs exactly when it crosses the halfway
            point, whatever the size of the House. */}
        <FinishLine />
        {winner ? (
          <div
            key={`${winner}-${leftSeats}-${rightSeats}`}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2"
          >
            {CONFETTI.map((c, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: static decoration
                key={i}
                className="absolute size-2 rounded-[2px]"
                style={
                  {
                    background: c.hue,
                    "--dx": c.dx,
                    "--dy": c.dy,
                    "--rot": c.rot,
                    animation: `confetti 900ms cubic-bezier(.2,.7,.3,1) ${c.delay} both`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        ) : null}
      </div>

      {counted > 0 && !countDone ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Seats fill in as the count goes on:{" "}
          <span className="num font-semibold text-foreground">
            {formatPct(percentCounted)}
          </span>{" "}
          of voting places counted so far.
        </p>
      ) : null}

      <p className="mt-6 max-w-[60ch] text-lg leading-snug" aria-live="polite">
        {verdict}
      </p>

      {/* Build-a-government */}
      {parties.length > 0 ? (
        <div className="mt-6 border-t-2 border-dashed border-border pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-xl font-bold [font-stretch:90%]">
              Build-a-government
            </h3>
            {customised ? (
              <button
                type="button"
                onClick={() => setSides(initial)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <RotateCcw className="size-3.5" aria-hidden />
                Reset to the usual blocs
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Move parties between the blocs and the crossbench to see who could
            form a government.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Column
              title={leftName}
              seats={leftSeats}
              parties={left}
              onMove={move}
              side="left"
            />
            <Column
              title="Crossbench"
              seats={crossSeats}
              parties={cross}
              onMove={move}
              side="cross"
            />
            <Column
              title={rightName}
              seats={rightSeats}
              parties={right}
              onMove={move}
              side="right"
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BlocTotal({
  name,
  seats,
  majority,
  state,
  align,
}: {
  name: string;
  seats: number;
  majority: number;
  /** "won" once the count is done; "ahead" when at the majority mid-count. */
  state: "won" | "ahead" | null;
  align: "left" | "right";
}) {
  const badge =
    state === "won" ? (
      <OverTheLine />
    ) : state === "ahead" ? (
      <EnoughSoFar />
    ) : null;
  return (
    <div className={cn("relative", align === "right" && "text-right")}>
      <div className="text-sm font-medium text-muted-foreground">{name}</div>
      <div className="flex items-center gap-3">
        {align === "right" ? badge : null}
        <span className="num font-display text-6xl leading-none font-extrabold tracking-tight [font-stretch:75%] sm:text-7xl">
          {seats}
        </span>
        {align === "left" ? badge : null}
      </div>
      <span className="sr-only">
        {state === "won"
          ? "Has a majority"
          : state === "ahead"
            ? "Enough for a majority on the count so far"
            : `${Math.max(0, majority - seats)} short of a majority`}
      </span>
    </div>
  );
}

function OverTheLine() {
  return (
    <span
      className="sticker inline-block !rounded-full bg-[#ffd60a] px-3 py-1 font-display text-sm font-extrabold whitespace-nowrap text-[#1b1a3a] [font-stretch:90%]"
      style={{ animation: "pop-in 600ms cubic-bezier(.2,.9,.3,1.3) both" }}
    >
      Over the line!
    </span>
  );
}

/** At the majority mid-count: worth flagging, not celebrating. */
function EnoughSoFar() {
  return (
    <span className="inline-block rounded-full border-2 border-dashed border-border px-3 py-1 font-display text-sm font-bold whitespace-nowrap text-muted-foreground [font-stretch:90%]">
      Enough so far
    </span>
  );
}

function FinishLine() {
  return (
    <div
      aria-hidden
      className="finish-line pointer-events-none absolute -top-2 -bottom-2 left-1/2 w-1.5 -translate-x-1/2 rounded-sm ring-2 ring-card"
    />
  );
}

function Column({
  title,
  seats,
  parties,
  onMove,
  side,
}: {
  title: string;
  seats: number;
  parties: SeatParty[];
  onMove: (pNo: number, dir: -1 | 1) => void;
  side: Side;
}) {
  return (
    <div className="rounded-2xl bg-secondary/60 p-3">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-sm font-semibold">{title}</span>
        <span className="num font-display text-lg font-extrabold">{seats}</span>
      </div>
      <ul className="mt-2 flex min-h-11 flex-wrap gap-2">
        {parties.map((p) => (
          <li
            key={p.pNo}
            className="flex items-center gap-1 rounded-full border-2 border-ink py-0.5 pr-1 pl-1 text-sm font-semibold shadow-[2px_2px_0_var(--sticker-shadow)] dark:border-[#4a47a0]"
            style={{ background: p.color, color: p.ink }}
          >
            <MoveButton
              label={`Move ${p.short} left`}
              disabled={side === "left"}
              onClick={() => onMove(p.pNo, -1)}
            >
              <ArrowLeft className="size-3.5" />
            </MoveButton>
            <span className="px-0.5">
              {p.short} <span className="num opacity-80">{p.seats}</span>
            </span>
            <MoveButton
              label={`Move ${p.short} right`}
              disabled={side === "right"}
              onClick={() => onMove(p.pNo, 1)}
            >
              <ArrowRight className="size-3.5" />
            </MoveButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-6 place-items-center rounded-full transition hover:bg-black/15 focus-visible:outline-2 focus-visible:outline-current disabled:opacity-25 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
