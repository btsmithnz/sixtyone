"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatInt, formatPct } from "@/lib/format";
import { type ListQueue, listChange } from "@/lib/list-queue";
import {
  type Blocs,
  type KnifeEdge,
  leanOf,
  OFFICIAL_RESULTS_DATE,
  type Preset,
  presetLeans,
  type Seats,
  SPECIALS_ESTIMATE,
  seatsFor,
  splitSpecials,
  YEARS,
} from "@/lib/specials";
import { cn } from "@/lib/utils";

export type WhatIfParty = {
  pNo: number;
  short: string;
  color: string;
  votes: number;
  /** Seats on the preliminary count, as the Commission allocated them. */
  seats: number;
  electorateSeats: number;
  /** The party's list, in order, without its electorate winners. */
  listQueue: ListQueue;
};

/** A knife-edge seat with the person it would bring in or drop. */
export type NamedKnifeEdge = KnifeEdge & {
  person: { name: string; listNo: number } | null;
};

const PRESETS: { value: Preset; label: string }[] = [
  ...YEARS.map((y) => ({ value: y, label: String(y) })),
  {
    value: "average",
    label: `Average of ${YEARS[0]}–${String(YEARS.at(-1)).slice(2)}`,
  },
  { value: "none", label: "Election night" },
];

const MAX_SHIFT = 10;

type Status = "right" | "left" | "neither";

export function SpecialsWhatIf({
  parties,
  outsideWins,
  blocs,
  knifeEdges,
}: {
  parties: WhatIfParty[];
  outsideWins: number;
  blocs: Blocs;
  /** Closest seats on the preliminary count, nearest first. */
  knifeEdges: NamedKnifeEdge[];
}) {
  const [preset, setPreset] = useState<Preset>("average");
  const [shift, setShift] = useState(0);

  const byNo = useMemo(
    () => new Map(parties.map((p) => [p.pNo, p])),
    [parties],
  );
  const prelim = useMemo(
    () => new Map(parties.map((p) => [p.pNo, p.votes])),
    [parties],
  );
  const wins = useMemo(
    () =>
      new Map(
        parties
          .filter((p) => p.electorateSeats > 0)
          .map((p) => [p.pNo, p.electorateSeats]),
      ),
    [parties],
  );

  // Bloc names come from election night, so they don't flip as you play.
  const blocName = (ids: number[], fallback: string) => {
    const lead = parties
      .filter((p) => ids.includes(p.pNo))
      .sort((a, b) => b.seats - a.seats)[0];
    return lead ? `${lead.short}-led` : fallback;
  };
  const leftName = blocName(blocs.left, "Left bloc");
  const rightName = blocName(blocs.right, "Right bloc");

  const leans = useMemo(() => presetLeans(preset), [preset]);
  const project = useMemo(() => {
    return (s: number) => {
      const specials = splitSpecials({
        prelim,
        leans,
        specials: SPECIALS_ESTIMATE,
        shift: s,
        blocs,
      });
      const votes = new Map(
        [...prelim].map(([p, v]) => [p, v + (specials.get(p) ?? 0)]),
      );
      return { votes, seats: seatsFor(votes, wins, outsideWins) };
    };
  }, [prelim, leans, wins, outsideWins, blocs]);

  const night = useMemo(
    () => seatsFor(prelim, wins, outsideWins),
    [prelim, wins, outsideWins],
  );
  const { votes, seats } = useMemo(() => project(shift), [project, shift]);
  const status = statusOf(seats, blocs);

  // How much further the specials would have to lean to change the outcome.
  const tipping = useMemo(() => {
    for (let step = 1; step <= 200; step++) {
      for (const dir of [1, -1] as const) {
        const s = shift + (dir * step) / 10;
        const next = statusOf(project(s).seats, blocs);
        if (next !== status) return { points: step / 10, dir, next };
      }
    }
    return null;
  }, [project, shift, status, blocs]);

  const total = [...votes.values()].reduce((a, b) => a + b, 0);
  const nightTotal = [...prelim.values()].reduce((a, b) => a + b, 0);
  const rows = parties
    .filter((p) => p.seats > 0 || (seats.byParty.get(p.pNo) ?? 0) > 0)
    .map((p) => ({
      ...p,
      nightPct: (p.votes / nightTotal) * 100,
      pct: ((votes.get(p.pNo) ?? 0) / total) * 100,
      nightSeats: night.byParty.get(p.pNo) ?? 0,
      newSeats: seats.byParty.get(p.pNo) ?? 0,
    }))
    .sort((a, b) => b.newSeats - a.newSeats || b.pct - a.pct);

  // Named list MPs who'd come in or drop out. Electorate seats are fixed, so
  // every change is at the bottom of a party list.
  const people = rows.flatMap((r) => {
    const list = (n: number) => Math.max(0, n - r.electorateSeats);
    const { in: inn, out } = listChange(
      r.listQueue,
      list(r.nightSeats),
      list(r.newSeats),
    );
    return [
      ...inn.map((m) => ({ ...m, party: r, dir: "in" as const })),
      ...out.map((m) => ({ ...m, party: r, dir: "out" as const })),
    ];
  });
  const comingIn = people.filter((p) => p.dir === "in");
  const goingOut = people.filter((p) => p.dir === "out");

  const blocTotal = (ids: number[], s: Seats) =>
    ids.reduce((a, p) => a + (s.byParty.get(p) ?? 0), 0);

  const verdict = (() => {
    const name = status === "right" ? rightName : leftName;
    const blocIds = status === "right" ? blocs.right : blocs.left;
    if (status !== "neither") {
      const n = blocTotal(blocIds, seats);
      return `${name} would have a majority: ${n} of ${seats.houseSize} seats.`;
    }
    const r = blocTotal(blocs.right, seats);
    const l = blocTotal(blocs.left, seats);
    const [lead, n] = r >= l ? [rightName, r] : [leftName, l];
    return `No majority: ${lead} would have ${n} of ${seats.houseSize}, ${seats.majority - n} short, so the crossbench would decide.`;
  })();

  const tippingText = (() => {
    if (!tipping) return null;
    const towards = tipping.dir > 0 ? leftName : rightName;
    const outcome =
      tipping.next === "neither"
        ? `${status === "right" ? rightName : leftName} would lose its majority`
        : `${tipping.next === "right" ? rightName : leftName} would have a majority`;
    return `If special votes leaned ${points(tipping.points)} further to ${towards}, ${outcome}.`;
  })();

  const leanSummary = (() => {
    if (preset === "none") {
      return "Special votes split exactly like election night, so nothing changes.";
    }
    const seated = parties
      .filter((p) => p.seats > 0)
      .map((p) => ({ short: p.short, lean: leanOf(leans, p.pNo) }));
    const fmt = (l: number) => `${l.toFixed(1)}×`;
    const up = seated
      .filter((p) => p.lean > 1.05)
      .sort((a, b) => b.lean - a.lean)
      .slice(0, 3)
      .map((p) => `${p.short} ${fmt(p.lean)}`);
    const down = seated
      .filter((p) => p.lean < 0.95)
      .sort((a, b) => a.lean - b.lean)
      .slice(0, 3)
      .map((p) => `${p.short} ${fmt(p.lean)}`);
    const when = preset === "average" ? "Across 2017–2023" : `In ${preset}`;
    return `${when}, special votes went more to ${list(up)}, and less to ${list(down)}, than their election-night share.`;
  })();

  return (
    <section
      aria-labelledby="special-votes"
      className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
    >
      <div className="sticker p-5 sm:p-7">
        <SectionHeading
          id="special-votes"
          share="/#special-votes"
          className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%] sm:text-4xl"
        >
          What could the special votes change?
        </SectionHeading>
        <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
          About {formatInt(Math.round(SPECIALS_ESTIMATE / 1000) * 1000)} special
          votes are still being checked and counted, around{" "}
          {formatPct(
            (SPECIALS_ESTIMATE / (nightTotal + SPECIALS_ESTIMATE)) * 100,
            0,
          )}{" "}
          of all votes. They land with the official results on{" "}
          {OFFICIAL_RESULTS_DATE}. In past elections they’ve leaned differently
          from the election-night count.
        </p>

        <div className="mt-5 space-y-2">
          <p id="preset-label" className="text-sm font-semibold">
            Special votes lean like…
          </p>
          <ToggleGroup
            value={[String(preset)]}
            onValueChange={(v) => {
              if (!v[0]) return;
              const next = PRESETS.find((p) => String(p.value) === v[0]);
              if (next) setPreset(next.value);
            }}
            variant="outline"
            size="sm"
            spacing={1.5}
            aria-labelledby="preset-label"
            className="w-full flex-wrap"
          >
            {PRESETS.map((p) => (
              <ToggleGroupItem
                key={p.value}
                value={String(p.value)}
                className="rounded-full px-3 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {p.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            {leanSummary}
          </p>
        </div>

        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label htmlFor="specials-shift" className="text-sm font-semibold">
              Then lean them further
            </label>
            <span className="num text-sm text-muted-foreground">
              {shift === 0
                ? "No extra lean"
                : `${points(Math.abs(shift))} to ${shift > 0 ? leftName : rightName}`}
              {shift !== 0 ? (
                <button
                  type="button"
                  onClick={() => setShift(0)}
                  className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium transition hover:bg-secondary hover:text-foreground"
                >
                  <RotateCcw className="size-3" aria-hidden />
                  Reset
                </button>
              ) : null}
            </span>
          </div>
          <input
            id="specials-shift"
            type="range"
            min={-MAX_SHIFT}
            max={MAX_SHIFT}
            step={0.5}
            // Left of centre leans to the left bloc, so the slider reads
            // like the strip above.
            value={-shift}
            onChange={(e) => setShift(-Number(e.target.value))}
            aria-valuetext={
              shift === 0
                ? "No extra lean"
                : `${points(Math.abs(shift))} to ${shift > 0 ? leftName : rightName}`
            }
            className="mt-2 w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>← {leftName}</span>
            <span>{rightName} →</span>
          </div>
        </div>

        <div
          className="mt-6 rounded-2xl bg-secondary/60 p-4"
          aria-live="polite"
        >
          <div className="flex items-end justify-between gap-4">
            <BlocResult
              name={leftName}
              before={blocTotal(blocs.left, night)}
              after={blocTotal(blocs.left, seats)}
              majority={seats.majority}
              align="left"
            />
            <BlocResult
              name={rightName}
              before={blocTotal(blocs.right, night)}
              after={blocTotal(blocs.right, seats)}
              majority={seats.majority}
              align="right"
            />
          </div>
          <p className="mt-3 text-base leading-snug font-medium">{verdict}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {seats.houseSize}-seat House
            {seats.houseSize !== night.houseSize
              ? ` (${night.houseSize} on election night)`
              : ""}
            , so {seats.majority} to govern.
            {tippingText ? ` ${tippingText}` : ""}
          </p>
        </div>

        <table className="mt-5 w-full text-sm">
          <caption className="sr-only">
            Seats and party vote on election night and in this scenario
          </caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="pb-1 font-medium">
                Party
              </th>
              <th scope="col" className="pb-1 text-right font-medium">
                Party vote
              </th>
              <th scope="col" className="pb-1 text-right font-medium">
                Seats
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = r.newSeats - r.nightSeats;
              return (
                <tr key={r.pNo} className="border-t border-border">
                  <th scope="row" className="py-1.5 text-left font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-3 shrink-0 rounded-full"
                        style={{ background: r.color }}
                      />
                      {r.short}
                    </span>
                  </th>
                  <td className="num py-1.5 text-right whitespace-nowrap">
                    <span className="text-muted-foreground">
                      {formatPct(r.nightPct)} →
                    </span>{" "}
                    {formatPct(r.pct)}
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    <span className="num font-semibold">{r.newSeats}</span>
                    <span
                      className={cn(
                        "num ml-2 inline-block w-8 rounded-full text-center text-xs font-semibold",
                        d > 0 &&
                          "bg-[#16a34a]/15 text-[#15803d] dark:text-[#4ade80]",
                        d < 0 && "bg-live/15 text-live",
                        d === 0 && "text-muted-foreground",
                      )}
                    >
                      {d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "–"}
                      <span className="sr-only">
                        {d === 0
                          ? " no change"
                          : ` ${d > 0 ? "more" : "fewer"} than election night`}
                      </span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {comingIn.length || goingOut.length ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <PeopleList title="Would come in" people={comingIn} />
            <PeopleList title="Would drop out" people={goingOut} />
          </div>
        ) : null}
        <p className="mt-4 text-xs text-muted-foreground">
          A what-if, not a forecast. It keeps every electorate with its
          election-night winner, and uses the Electoral Commission’s estimate of
          special votes, which will change once they’re checked.
        </p>
      </div>

      <KnifeEdges edges={knifeEdges} byNo={byNo} />
    </section>
  );
}

function statusOf(seats: Seats, blocs: Blocs): Status {
  const sum = (ids: number[]) =>
    ids.reduce((a, p) => a + (seats.byParty.get(p) ?? 0), 0);
  if (sum(blocs.right) >= seats.majority) return "right";
  if (sum(blocs.left) >= seats.majority) return "left";
  return "neither";
}

function BlocResult({
  name,
  before,
  after,
  majority,
  align,
}: {
  name: string;
  before: number;
  after: number;
  majority: number;
  align: "left" | "right";
}) {
  const has = after >= majority;
  return (
    <div className={cn(align === "right" && "text-right")}>
      <div className="text-sm font-semibold">{name}</div>
      <div
        className={cn(
          "flex items-baseline gap-2",
          align === "right" && "justify-end",
        )}
      >
        {after !== before ? (
          <span className="num text-xl font-bold text-muted-foreground line-through decoration-2">
            {before}
          </span>
        ) : null}
        <span className="num font-display text-5xl leading-none font-extrabold tracking-tight [font-stretch:80%]">
          {after}
        </span>
      </div>
      <div className="mt-1 text-xs">
        {has ? (
          <span className="font-semibold">Majority</span>
        ) : (
          <span className="text-muted-foreground">
            {majority - after} short of {majority}
          </span>
        )}
      </div>
    </div>
  );
}

function PeopleList({
  title,
  people,
}: {
  title: string;
  people: {
    name: string;
    listNo: number;
    party: { short: string; color: string };
  }[];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {people.length ? (
        <ul className="mt-1.5 space-y-1">
          {people.map((p) => (
            <li
              key={`${p.party.short}-${p.listNo}`}
              className="flex items-center gap-2 text-sm"
            >
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-full"
                style={{ background: p.party.color }}
              />
              <span>
                {p.name}{" "}
                <span className="text-muted-foreground">
                  {p.party.short} #{p.listNo}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">Nobody</p>
      )}
    </div>
  );
}

function KnifeEdges({
  edges,
  byNo,
}: {
  edges: NamedKnifeEdge[];
  byNo: Map<number, WhatIfParty>;
}) {
  return (
    <div className="sticker p-5 sm:p-7">
      <SectionHeading
        id="knife-edge"
        share="/#knife-edge"
        className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
      >
        Seats on a knife-edge
      </SectionHeading>
      <p className="mt-1 text-sm text-muted-foreground">
        The closest calls on election night, in party votes, if nobody else’s
        votes changed. Special votes add about{" "}
        {formatInt(Math.round(SPECIALS_ESTIMATE / 1000) * 1000)}, so any of
        these could move.
      </p>
      <ol className="mt-4 space-y-3">
        {edges.map((e) => {
          const p = byNo.get(e.pNo);
          const other = e.other !== null ? byNo.get(e.other) : null;
          if (!p) return null;
          return (
            <li
              key={`${e.pNo}-${e.kind}`}
              className="rounded-xl border-l-[6px] bg-secondary/60 py-2 pr-3 pl-3"
              style={{ borderColor: p.color }}
            >
              <div className="text-sm font-semibold">
                {p.short}’s {ordinal(e.seat)} seat
              </div>
              <div className="text-sm">
                <strong className="num">{formatInt(e.votes)}</strong>{" "}
                {e.kind === "gain" ? "votes short" : "votes to spare"}
              </div>
              {e.person ? (
                <div className="text-sm">
                  {e.kind === "gain" ? "Would bring in " : "Held by "}
                  <span className="font-medium">{e.person.name}</span>{" "}
                  <span className="num text-muted-foreground">
                    (list #{e.person.listNo})
                  </span>
                </div>
              ) : null}
              <div className="text-xs text-muted-foreground">
                {e.kind === "gain"
                  ? other
                    ? `It would come from ${other.short}.`
                    : `The House would grow to ${e.houseSize}.`
                  : other
                    ? `It would go to ${other.short}.`
                    : `The House would shrink to ${e.houseSize}.`}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-sm">
        <Link
          href="/parliament"
          className="font-medium underline underline-offset-2"
        >
          See who’s in and who’s out
        </Link>{" "}
        <span className="text-muted-foreground">in the new Parliament.</span>
      </p>
    </div>
  );
}

/** Percentage points: "1.5 points", "1 point". */
function points(n: number) {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${v} ${v === "1" ? "point" : "points"}`;
}

function list(items: string[]) {
  if (items.length <= 1) return items[0] ?? "nobody";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
