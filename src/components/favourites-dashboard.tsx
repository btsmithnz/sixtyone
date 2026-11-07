"use client";

import { Plus, Search, Star } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toggleFavourite, useFavourites } from "@/lib/favourites";
import { formatInt, formatPct } from "@/lib/format";
import { foldDiacritics } from "@/lib/text";
import { FavouriteButton } from "./favourite-button";
import { Skeleton } from "./ui/skeleton";

/** Just what a dashboard card needs, so the page stays small. */
export type FavouriteCard = {
  eNo: number;
  name: string;
  slug: string;
  percentCounted: number;
  complete: boolean;
  margin: number | null;
  /** Top three, already in order. Empty until votes are counted. */
  candidates: { name: string; party: string; color: string; percent: number }[];
  partyVote: { party: string; color: string; percent: number } | null;
};

type Order = "added" | "closest";

const fold = (s: string) => foldDiacritics(s).toLowerCase();
const gap = (e: FavouriteCard) =>
  e.candidates.length > 1
    ? e.candidates[0].percent - e.candidates[1].percent
    : Number.POSITIVE_INFINITY;

export function FavouritesDashboard({
  electorates,
}: {
  electorates: FavouriteCard[];
}) {
  const favourites = useFavourites();
  const [order, setOrder] = useState<Order>("added");

  // Before hydration the server can't know this browser's favourites.
  if (favourites === null) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  const byNo = new Map(electorates.map((e) => [e.eNo, e]));
  const picked = favourites
    .map((n) => byNo.get(n))
    .filter((e): e is FavouriteCard => !!e);
  const shown =
    order === "closest" ? [...picked].sort((a, b) => gap(a) - gap(b)) : picked;

  return (
    <div className="space-y-8">
      {picked.length ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{summary(picked)}</p>
            {picked.length > 1 ? (
              <ToggleGroup
                value={[order]}
                onValueChange={(v) => v[0] && setOrder(v[0] as Order)}
                variant="outline"
                size="sm"
                spacing={0}
                aria-label="Order"
              >
                <ToggleGroupItem value="added">Order added</ToggleGroupItem>
                <ToggleGroupItem value="closest">Closest first</ToggleGroupItem>
              </ToggleGroup>
            ) : null}
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((e) => (
              <li key={e.eNo}>
                <Card e={e} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="hatch rounded-2xl p-6">
          <div className="max-w-prose space-y-2 rounded-xl bg-card p-4">
            <p className="font-semibold">
              Follow the electorates you care about
            </p>
            <p className="text-sm text-muted-foreground">
              Tap the{" "}
              <Star className="inline size-4 align-[-2px]" aria-label="star" />{" "}
              on any electorate, or add some below. They’re saved in this
              browser only.
            </p>
          </div>
        </div>
      )}

      <AddElectorates electorates={electorates} favourites={favourites} />
    </div>
  );
}

/** "National ahead in 2, Labour in 1. 1 still to report." */
function summary(cards: FavouriteCard[]) {
  const tally = new Map<string, number>();
  let waiting = 0;
  for (const e of cards) {
    const lead = e.candidates[0];
    if (lead) tally.set(lead.party, (tally.get(lead.party) ?? 0) + 1);
    else waiting++;
  }
  const leads = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([party, n], i) =>
      i === 0 ? `${party} ahead in ${n}` : `${party} in ${n}`,
    );
  const parts = [];
  if (leads.length) parts.push(`${leads.join(", ")}.`);
  if (waiting)
    parts.push(
      waiting === cards.length
        ? "No results in yet."
        : `${waiting} still to report.`,
    );
  return parts.join(" ");
}

function Card({ e }: { e: FavouriteCard }) {
  const [lead] = e.candidates;
  return (
    <article className="sticker flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/electorates/${e.slug}`}
          className="min-w-0 rounded font-display text-2xl leading-tight font-extrabold [font-stretch:85%] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {e.name}
        </Link>
        <FavouriteButton eNo={e.eNo} name={e.name} className="-mt-1 -mr-1" />
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={Math.round(e.percentCounted)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${e.name} voting places counted`}
        >
          <div
            className="h-full bg-primary transition-[width] duration-700"
            style={{ width: `${e.percentCounted}%` }}
          />
        </div>
        <span className="num shrink-0">
          {formatPct(e.percentCounted, 0)} counted
        </span>
      </div>

      {lead ? (
        <>
          <ol className="mt-4 space-y-2.5">
            {e.candidates.map((c) => (
              <li key={`${c.name}-${c.party}`}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{c.name}</span>{" "}
                    <span className="text-muted-foreground">{c.party}</span>
                  </span>
                  <span className="num shrink-0 font-semibold">
                    {formatPct(c.percent)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{ width: `${c.percent}%`, background: c.color }}
                  />
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pt-4 text-sm">
            <span>
              {e.complete ? "Won" : "Ahead"} by{" "}
              <strong className="num">{formatInt(e.margin ?? 0)}</strong> votes
            </span>
            {e.partyVote ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ background: e.partyVote.color }}
                />
                Party vote: {e.partyVote.party}{" "}
                <span className="num">{formatPct(e.partyVote.percent)}</span>
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No results yet.</p>
      )}
    </article>
  );
}

function AddElectorates({
  electorates,
  favourites,
}: {
  electorates: FavouriteCard[];
  favourites: number[];
}) {
  const [query, setQuery] = useState("");
  const q = fold(useDeferredValue(query).trim());
  const matches = q
    ? electorates
        .filter((e) => !favourites.includes(e.eNo) && fold(e.name).includes(q))
        .slice(0, 8)
    : [];

  return (
    <section aria-labelledby="add-heading" className="space-y-3">
      <h2
        id="add-heading"
        className="font-display text-2xl font-extrabold [font-stretch:85%]"
      >
        Add electorates
      </h2>
      <label className="sticker flex max-w-md items-center gap-2 !rounded-full px-4 py-2">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">Find an electorate to add</span>
        <input
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
          placeholder="Find an electorate, like Ōtāhuhu"
          className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
          type="search"
        />
      </label>
      {q ? (
        matches.length ? (
          <ul className="flex flex-wrap gap-2">
            {matches.map((e) => (
              <li key={e.eNo}>
                <button
                  type="button"
                  onClick={() => toggleFavourite(e.eNo)}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-border bg-card px-3 py-1 text-sm font-medium transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <Plus className="size-3.5" aria-hidden />
                  {e.name}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No other electorates match “{query}”.
          </p>
        )
      ) : null}
    </section>
  );
}
