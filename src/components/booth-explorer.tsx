"use client";

import { ArrowLeft, MapPinOff } from "lucide-react";
import { useParams } from "next/navigation";
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { settleScroll } from "@/components/scroll-to-hash";
import { SectionHeading } from "@/components/section-heading";
import { ShareButton } from "@/components/share-button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { BoothPlace, BoothResults } from "@/lib/booths";
import { formatInt, formatPct } from "@/lib/format";
import { displayCandidateName, partyColorVar, partyStyle } from "@/lib/parties";
import { cn } from "@/lib/utils";
import type { BoothHover, BoothPoint } from "./booth-map-canvas";

const BoothMapCanvas = lazy(() => import("./booth-map-canvas"));

type Mode = "candidate" | "party";
type Choice = { label: string; pNo: number | null };

/** One place under the current vote. */
type Row = {
  place: BoothPlace;
  votes: number[];
  total: number;
  /** Index into the choices of who came first. */
  winner: number;
  /** The picked choice's share here, if one is picked. */
  focusShare: number | null;
  /** 0–1: how strongly to colour this place (1 unless a choice is picked). */
  shade: number;
};

/**
 * Booths this small swing wildly, so they don't set the colour scale or count
 * as someone's best or worst place.
 */
const SCALE_MIN_VOTES = 50;
/** The faintest colour, for a picked choice's worst place. */
const MIN_SHADE = 0.08;
/**
 * List items shown before "Show all": a Māori electorate has hundreds, and
 * rendering them all would bloat every page.
 */
const COLLAPSED = 8;
/** Names shown in the hover card. */
const HOVER_LINES = 3;

export function BoothExplorer({
  data,
  electorate,
  slug,
  boundaryUrl,
}: {
  data: BoothResults;
  electorate: string;
  /** The electorate's slug, for share links. */
  slug: string;
  boundaryUrl: string;
}) {
  // A voting place's share page (/electorates/[slug]/booths/[id]) opens
  // with that place picked.
  const { id } = useParams<{ id?: string }>();
  const linked = data.places.find((p) => String(p.id) === id)?.id ?? null;
  const [mode, setMode] = useState<Mode>("candidate");
  const [focus, setFocus] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(linked);
  const [flyTo, setFlyTo] = useState<{ id: number; seq: number } | null>(
    linked === null ? null : { id: linked, seq: 0 },
  );
  const [hover, setHover] = useState<BoothHover | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mapState, setMapState] = useState<"idle" | "near" | "failed">("idle");
  const mapBox = useRef<HTMLDivElement>(null);
  const detailBox = useRef<HTMLDivElement>(null);
  const listBox = useRef<HTMLDivElement>(null);

  // …and in the vote it was shared from (?vote=party), scrolled to: the
  // whole section on wide screens, the place's details (below the map) on
  // phones. Read in an effect: the page is the same static HTML for any
  // query string.
  useEffect(() => {
    if (linked === null) return;
    if (new URLSearchParams(location.search).get("vote") === "party")
      setMode("party");
    return settleScroll(isWide() ? "booth-by-booth" : "booth-detail");
  }, [linked]);

  // Load MapLibre only when the map is about to scroll into view.
  useEffect(() => {
    const el = mapBox.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setMapState((s) => (s === "idle" ? "near" : s));
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Hovering re-renders this component on every mouse move, so the heavy
  // lifting (and the map's dots, which re-upload when they change) is
  // memoised on just what it depends on.
  const {
    choices,
    rows,
    counted,
    best,
    worst,
    lo,
    hi,
    wins,
    points,
    sorted,
    pickable,
  } = useMemo(() => analyse(data, mode, focus), [data, mode, focus]);
  // A place with no votes in this vote drops out of the list and the map.
  const selectedRow = counted.find((r) => r.place.id === selected);
  const hovered = hover ? rows.find((r) => r.place.id === hover.id) : undefined;
  const unmapped = counted.length - points.length;

  const pick = (id: number, from: "map" | "list") => {
    setSelected(id);
    if (from === "list") {
      setFlyTo((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));
      // On phones the map is above the list: bring it back into view.
      if (!isWide() && points.some((p) => p.id === id))
        mapBox.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
    } else if (!isWide()) {
      // …and the details are below the map.
      requestAnimationFrame(() =>
        detailBox.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        }),
      );
    }
  };

  const headline = (() => {
    if (focus !== null) {
      const c = choices[focus];
      if (!best || !worst || !c) return null;
      return (
        <>
          <strong>{c.label}</strong> did best at{" "}
          <strong>{best.place.venue}</strong> (
          <span className="num">{formatPct(hi)}</span>) and worst at{" "}
          <strong>{worst.place.venue}</strong> (
          <span className="num">{formatPct(lo)}</span>).
        </>
      );
    }
    const top = wins.indexOf(Math.max(...wins));
    const c = choices[top];
    if (!c || !counted.length) return null;
    return (
      <>
        <strong>{c.label}</strong> came first at{" "}
        <strong className="num">{wins[top]}</strong> of{" "}
        <span className="num">{counted.length}</span> voting places.
      </>
    );
  })();

  return (
    <section aria-labelledby="booth-by-booth" className="sticker p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading
          id="booth-by-booth"
          share={`/electorates/${slug}#booth-by-booth`}
          className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%]"
        >
          Booth by booth
        </SectionHeading>
        <ToggleGroup
          value={[mode]}
          onValueChange={(v) => {
            if (!v[0]) return;
            setMode(v[0] as Mode);
            setFocus(null);
          }}
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Which vote"
        >
          <ToggleGroupItem value="candidate">Candidate vote</ToggleGroupItem>
          <ToggleGroupItem value="party">Party vote</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every voting place that took votes for {electorate}, sized by how many.
        {focus === null
          ? " Coloured by who came first, with how many places each won beside their name. Pick a name to see where they did best."
          : " The stronger the colour, the bigger their share. Beside each name is how many places they won."}
      </p>

      <fieldset className="mt-4">
        <legend className="sr-only">Colour the map by</legend>
        <ul className="flex flex-wrap gap-2">
          {pickable.map((c) => {
            const on = focus === c.i;
            return (
              <li key={`${mode}-${c.i}`}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFocus(on ? null : c.i)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                    on
                      ? "border-ink bg-ink text-paper"
                      : "border-border bg-card hover:border-ink/40",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-3 rounded-full border border-ink/20"
                    style={{ background: partyColorVar(c.pNo) }}
                  />
                  {c.label}
                  {c.wins ? (
                    <span
                      className={cn(
                        "num text-xs",
                        on ? "text-paper/70" : "text-muted-foreground",
                      )}
                    >
                      {c.wins}
                      <span className="sr-only"> voting places won</span>
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {headline ? <p className="mt-4 text-base">{headline}</p> : null}

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <div
            ref={mapBox}
            className="relative h-[380px] overflow-hidden rounded-2xl bg-secondary sm:h-[460px] lg:h-[560px]"
            onPointerLeave={() => setHover(null)}
          >
            {mapState === "failed" ? (
              <p className="hatch flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                <span className="rounded bg-card px-1">
                  The map couldn’t load here. Every voting place is in the list.
                </span>
              </p>
            ) : (
              <>
                <div className="hatch absolute inset-0" aria-hidden />
                {mapState === "near" ? (
                  <Suspense fallback={null}>
                    <BoothMapCanvas
                      points={points}
                      boundaryUrl={boundaryUrl}
                      selected={selected}
                      flyTo={flyTo}
                      label={`Map of voting places for ${electorate}`}
                      onSelect={(id) =>
                        id === null ? setSelected(null) : pick(id, "map")
                      }
                      onHover={setHover}
                      onError={() => setMapState("failed")}
                    />
                  </Suspense>
                ) : null}
              </>
            )}
            {hovered && hover ? (
              <HoverCard
                row={hovered}
                choices={choices}
                focus={focus}
                hover={hover}
              />
            ) : null}
          </div>
          {focus !== null ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="num">{formatPct(lo, 0)}</span>
              <span
                aria-hidden
                className="h-2.5 w-40 rounded-full border border-ink/20"
                style={{
                  background: `linear-gradient(to right, ${shadedColor(choices[focus]?.pNo, MIN_SHADE)}, ${partyColorVar(choices[focus]?.pNo)})`,
                }}
              />
              <span className="num">{formatPct(hi, 0)}</span>
              <span>{choices[focus]?.label}’s share of the vote</span>
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          {selectedRow ? (
            <div ref={detailBox} id="booth-detail" className="scroll-mt-4">
              <BoothDetail
                key={selectedRow.place.id}
                row={selectedRow}
                choices={choices}
                mode={mode}
                share={`/electorates/${slug}/booths/${selectedRow.place.id}${mode === "party" ? "?vote=party" : ""}`}
                other={otherVoteWinner(data, mode, selectedRow.place)}
                onBack={() => {
                  setSelected(null);
                  // Keyboard users go back to the row they came from.
                  const id = selectedRow.place.id;
                  requestAnimationFrame(() =>
                    (
                      listBox.current?.querySelector<HTMLElement>(
                        `[data-place="${id}"]`,
                      ) ?? listBox.current?.querySelector("h3")
                    )?.focus(),
                  );
                }}
              />
            </div>
          ) : null}
          <div ref={listBox} className={cn(selectedRow && "hidden")}>
            <div className="flex items-baseline justify-between gap-3 px-1.5">
              <h3 tabIndex={-1} className="text-sm font-semibold outline-none">
                {focus === null
                  ? "Biggest voting places first"
                  : `Where ${choices[focus]?.label} did best`}
              </h3>
              {/* What each row's percentage is. */}
              <span
                aria-hidden
                className="shrink-0 text-xs text-muted-foreground"
              >
                {focus === null ? "Winner’s share" : "Their share"}
              </span>
            </div>
            <ol className="mt-2 divide-y divide-border lg:max-h-[528px] lg:overflow-y-auto lg:pr-1">
              {(expanded ? sorted : sorted.slice(0, COLLAPSED)).map((r) => (
                <li key={r.place.id}>
                  <BoothRow
                    row={r}
                    choices={choices}
                    focus={focus}
                    onClick={() => pick(r.place.id, "list")}
                  />
                </li>
              ))}
            </ol>
            {!expanded && sorted.length > COLLAPSED ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="mt-2 w-full rounded-full border-2 border-border py-1.5 text-sm font-medium hover:border-ink/40 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Show all {sorted.length} voting places
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <p className="mt-5 text-xs text-muted-foreground">
        Special votes aren’t counted by voting place, so they’re not here.
        {data.suppressed === 1
          ? " One place took fewer than 6 votes, so it’s left out for secrecy."
          : data.suppressed
            ? ` ${data.suppressed} places took fewer than 6 votes, so they’re left out for secrecy.`
            : ""}
        {unmapped
          ? " Places that can’t go on the map (mostly mobile teams visiting care homes and hospitals) are in the list only."
          : ""}{" "}
        Results: Electoral Commission. Locations: LINZ NZ Addresses (CC BY 4.0),
        so some are approximate. Map: OpenFreeMap, © OpenMapTiles, ©
        OpenStreetMap contributors.
      </p>
    </section>
  );
}

/** Side by side map and list, rather than the list under the map. */
const isWide = () => window.matchMedia("(min-width: 1024px)").matches;

/** Everything shown for one vote and pick: rows, colours, scale, legend. */
function analyse(data: BoothResults, mode: Mode, focus: number | null) {
  const choices = choicesFor(data, mode);

  const rows: Row[] = data.places.map((place) => {
    const votes = mode === "candidate" ? place.candidate : place.party;
    const total = votes.reduce((a, n) => a + n, 0);
    let winner = 0;
    for (let i = 1; i < votes.length; i++)
      if (votes[i] > votes[winner]) winner = i;
    return {
      place,
      votes,
      total,
      winner,
      focusShare:
        focus === null ? null : total ? (votes[focus] / total) * 100 : 0,
      shade: 1,
    };
  });
  const counted = rows.filter((r) => r.total > 0);

  // A picked choice's best and worst places set its colour scale. Tiny
  // places rank after the rest.
  const big = counted.filter((r) => r.total >= SCALE_MIN_VOTES);
  const small = counted.filter((r) => r.total < SCALE_MIN_VOTES);
  const ranked = big.length ? [...big].sort(byShare) : [...small].sort(byShare);
  const best = ranked[0];
  const worst = ranked.at(-1);
  const lo = worst?.focusShare ?? 0;
  const hi = best?.focusShare ?? 0;
  if (focus !== null && hi > lo) {
    for (const r of rows) {
      const t = ((r.focusShare ?? 0) - lo) / (hi - lo);
      r.shade = MIN_SHADE + (1 - MIN_SHADE) * Math.min(1, Math.max(0, t));
    }
  }

  const wins = choices.map(() => 0);
  for (const r of counted) wins[r.winner]++;

  const points: BoothPoint[] = counted.flatMap((r) =>
    r.place.lat === null || r.place.lon === null
      ? []
      : [
          {
            id: r.place.id,
            lat: r.place.lat,
            lon: r.place.lon,
            votes: r.total,
            pNo: choices[focus ?? r.winner]?.pNo ?? null,
            shade: r.shade,
          },
        ],
  );

  // The legend doubles as the picker: everyone who came first somewhere,
  // plus anyone else with a real share of the vote.
  const grand = choices.map((_, i) =>
    counted.reduce((a, r) => a + r.votes[i], 0),
  );
  const grandTotal = grand.reduce((a, n) => a + n, 0) || 1;
  const pickable = choices
    .map((c, i) => ({ ...c, i, wins: wins[i], share: grand[i] / grandTotal }))
    .filter((c) => c.wins > 0 || c.share >= 0.02 || c.i === focus);

  return {
    choices,
    rows,
    counted,
    best,
    worst,
    lo,
    hi,
    wins,
    points,
    sorted:
      focus === null
        ? [...counted].sort(byVotes)
        : big.length
          ? [...ranked, ...small.sort(byShare)]
          : ranked,
    pickable,
  };
}

/** A party colour faded towards the card, as the map does it. */
const shadedColor = (pNo: number | null | undefined, shade: number) =>
  shade >= 1
    ? partyColorVar(pNo)
    : `color-mix(in srgb, ${partyColorVar(pNo)} ${Math.round(shade * 100)}%, var(--card))`;

const byVotes = (a: Row, b: Row) => b.total - a.total;
const byShare = (a: Row, b: Row) =>
  (b.focusShare ?? 0) - (a.focusShare ?? 0) || byVotes(a, b);

function choicesFor(data: BoothResults, mode: Mode): Choice[] {
  return mode === "candidate"
    ? data.candidates.map((c) => ({
        label: displayCandidateName(c.name),
        pNo: c.pNo,
      }))
    : data.parties.map((p) => ({
        label: partyStyle(p.pNo, p.name).short,
        pNo: p.pNo,
      }));
}

/** Who came first in the other vote at a place, and with what share. */
function otherVoteWinner(data: BoothResults, mode: Mode, place: BoothPlace) {
  const votes = mode === "candidate" ? place.party : place.candidate;
  const total = votes.reduce((a, n) => a + n, 0);
  if (!total) return null;
  const i = votes.indexOf(Math.max(...votes));
  const c = choicesFor(data, mode === "candidate" ? "party" : "candidate")[i];
  return c ? { ...c, percent: (votes[i] / total) * 100 } : null;
}

const shareOf = (r: Row, i: number) =>
  r.total ? (r.votes[i] / r.total) * 100 : 0;

function BoothRow({
  row,
  choices,
  focus,
  onClick,
}: {
  row: Row;
  choices: Choice[];
  focus: number | null;
  onClick: () => void;
}) {
  const shown = focus ?? row.winner;
  const c = choices[shown];
  const { area, lat } = row.place;
  const where =
    lat !== null ? area : area ? `${area} · not on the map` : "Not on the map";
  return (
    <button
      type="button"
      onClick={onClick}
      data-place={row.place.id}
      className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-1.5 py-2 text-left text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
    >
      <span
        aria-hidden
        className="size-3 rounded-full border border-ink/30"
        style={{ background: shadedColor(c?.pNo, row.shade) }}
      />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{row.place.venue}</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          {lat === null ? (
            <MapPinOff className="size-3.5 shrink-0" aria-hidden />
          ) : null}
          <span className="truncate">{where}</span>
        </span>
      </span>
      <span className="text-right">
        <span className="num block font-semibold">
          {formatPct(shareOf(row, shown))}
          <span className="sr-only">
            {" "}
            {focus === null ? `${c?.label} came first` : `for ${c?.label}`}
          </span>
        </span>
        <span className="num block text-xs text-muted-foreground">
          {formatInt(row.total)} votes
        </span>
      </span>
    </button>
  );
}

function BoothDetail({
  row,
  choices,
  mode,
  share,
  other,
  onBack,
}: {
  row: Row;
  choices: Choice[];
  mode: Mode;
  /** The place's share page. */
  share: string;
  /** The winner of the other vote here. */
  other: (Choice & { percent: number }) | null;
  onBack: () => void;
}) {
  const { place } = row;
  // Announce the place to screen readers as it opens (it's keyed by place).
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const ranked = row.votes
    .map((votes, i) => ({ votes, i }))
    .filter((v) => v.votes > 0)
    .sort((a, b) => b.votes - a.votes);
  const top = ranked.slice(0, 8);
  const rest = ranked.slice(8).reduce((a, v) => a + v.votes, 0);
  const max = top[0]?.votes || 1;
  const sectionTotal = place.advance + place.electionDay;
  const advancePct = sectionTotal ? (place.advance / sectionTotal) * 100 : 0;

  return (
    <article aria-label={place.venue}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All voting places
        </button>
        <ShareButton
          path={share}
          title={`How ${place.venue} voted`}
          label="Share"
          className="flex-row-reverse"
        />
      </div>
      <h3
        ref={heading}
        tabIndex={-1}
        className="mt-2 font-display text-2xl leading-tight font-extrabold tracking-tight outline-none [font-stretch:90%]"
      >
        {place.venue}
      </h3>
      {place.area || place.address ? (
        <p className="text-sm text-muted-foreground">
          {[place.area, place.address].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {place.located === "address" ? null : (
        <p className="mt-1 text-xs text-muted-foreground">
          {
            {
              approximate: "The map shows roughly where this is.",
              mobile:
                "Not on the map: a mobile team took these votes in several places.",
              unknown: "Not on the map: we couldn’t pin down where this is.",
            }[place.located]
          }
        </p>
      )}

      <p className="mt-4 flex items-baseline gap-2">
        <span className="num font-display text-4xl leading-none font-extrabold tracking-tight [font-stretch:80%]">
          {formatInt(row.total)}
        </span>
        <span className="text-sm font-medium">
          {mode === "candidate" ? "candidate votes" : "party votes"}
        </span>
      </p>
      {sectionTotal ? (
        <div className="mt-3">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-secondary">
            <span
              className="h-full bg-primary"
              style={{ width: `${advancePct}%` }}
            />
          </div>
          <p className="mt-1 flex justify-between text-xs text-muted-foreground">
            {/* Of voters (counted from party votes), so it fits either vote. */}
            <span>
              <span className="num">{formatPct(advancePct, 0)}</span> voted in
              advance
            </span>
            <span>
              <span className="num">{formatPct(100 - advancePct, 0)}</span> on
              election day
            </span>
          </p>
        </div>
      ) : null}

      <ol className="mt-4 space-y-2.5">
        {top.map(({ votes, i }) => {
          const c = choices[i];
          return (
            <li
              key={i}
              className="grid grid-cols-[minmax(0,8.5rem)_1fr_3.5rem] items-center gap-3 text-sm"
            >
              <span className="truncate font-medium" title={c?.label}>
                {c?.label}
              </span>
              <span className="h-2.5 rounded-full bg-secondary">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${(votes / max) * 100}%`,
                    background: partyColorVar(c?.pNo),
                  }}
                />
              </span>
              <span className="num text-right font-semibold">
                {formatPct(shareOf(row, i))}
              </span>
            </li>
          );
        })}
      </ol>
      {rest ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Others:{" "}
          <span className="num">
            {(rest / row.total) * 100 < 0.05
              ? "under 0.1%"
              : formatPct((rest / row.total) * 100)}
          </span>
        </p>
      ) : null}
      {other ? (
        <p className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-sm">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full border border-ink/20"
            style={{ background: partyColorVar(other.pNo) }}
          />
          <span>
            {mode === "candidate" ? "Party vote" : "Candidate vote"}:{" "}
            <strong>{other.label}</strong> came first with{" "}
            <span className="num">{formatPct(other.percent)}</span>
          </span>
        </p>
      ) : null}
    </article>
  );
}

function HoverCard({
  row,
  choices,
  focus,
  hover: { x, y, w, h },
}: {
  row: Row;
  choices: Choice[];
  focus: number | null;
  hover: BoothHover;
}) {
  // The top few here, plus the picked name if it isn't one of them.
  const ranked = row.votes
    .map((votes, i) => ({ votes, i }))
    .filter((v) => v.votes > 0)
    .sort((a, b) => b.votes - a.votes || a.i - b.i);
  const lines = ranked.slice(0, HOVER_LINES);
  if (focus !== null && !lines.some((v) => v.i === focus))
    lines.push({ votes: row.votes[focus] ?? 0, i: focus });
  const max = ranked[0]?.votes || 1;

  // Above the pointer when it fits, otherwise below, and always inside the
  // map. The card's height varies, so it's measured before it's painted.
  const card = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const height = el.offsetHeight;
    const above = y - 16 - height;
    el.style.top = `${above >= 8 ? above : Math.max(8, Math.min(y + 20, h - height - 8))}px`;
  });
  return (
    <div
      ref={card}
      aria-hidden
      className="sticker pointer-events-none absolute z-10 w-56 !rounded-xl p-3 text-sm"
      style={{ left: Math.max(8, Math.min(x - 112, w - 232)), top: y + 20 }}
    >
      <div className="font-display text-base leading-tight font-extrabold">
        {row.place.venue}
      </div>
      {row.place.area ? (
        <div className="text-muted-foreground">{row.place.area}</div>
      ) : null}
      <ol className="mt-2 space-y-1.5">
        {lines.map(({ votes, i }, n) => {
          const c = choices[i];
          return (
            <li
              key={i}
              className={cn(
                i === focus && "font-semibold",
                // The picked name, when it's further down.
                n === HOVER_LINES && "border-t border-border pt-1.5",
              )}
            >
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate">{c?.label}</span>
                <span className="num">{formatPct(shareOf(row, i))}</span>
              </div>
              <span className="mt-0.5 block h-1.5 rounded-full bg-secondary">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${(votes / max) * 100}%`,
                    background: partyColorVar(c?.pNo),
                  }}
                />
              </span>
            </li>
          );
        })}
      </ol>
      {/* Only mice hover (see the map), so it's always a click. */}
      <div className="mt-2 flex items-baseline justify-between gap-2 text-muted-foreground">
        <span className="num">{formatInt(row.total)} votes</span>
        <span className="text-xs">Click for more</span>
      </div>
    </div>
  );
}
