"use client";

import { ArrowDownUp } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useId,
  useMemo,
  useState,
} from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatPct } from "@/lib/format";
import type { ElectorateResult } from "@/lib/parliament";
import { cn } from "@/lib/utils";

/**
 * One sort setting for every list on a page: by ranking (party list
 * position), A–Z by surname, or how people did in the electorate they stood
 * in (candidate vote, or their party's party vote there; best first). Any
 * order can be reversed; people without a value (no list place, didn't
 * stand in an electorate) always go last. Lists render on the server in the
 * default order.
 */
type SortBy = "rank" | "name" | "candidate" | "party";
type SortState = {
  by: SortBy;
  reversed: boolean;
  setBy: (by: SortBy) => void;
  setReversed: (r: boolean) => void;
};

const SortContext = createContext<SortState | null>(null);

export function ListSortProvider({ children }: { children: ReactNode }) {
  const [by, setBy] = useState<SortBy>("rank");
  const [reversed, setReversed] = useState(false);
  const value = useMemo(
    () => ({ by, reversed, setBy, setReversed }),
    [by, reversed],
  );
  return <SortContext value={value}>{children}</SortContext>;
}

function useSort() {
  const s = useContext(SortContext);
  if (!s) throw new Error("Wrap sortable lists in <ListSortProvider>");
  return s;
}

export function ListSortControls({ className }: { className?: string }) {
  const { by, reversed, setBy, setReversed } = useSort();
  const labelId = useId();
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span id={labelId} className="text-sm text-muted-foreground">
        Sort
      </span>
      <ToggleGroup
        value={[by]}
        onValueChange={(v) => v[0] && setBy(v[0] as SortBy)}
        variant="outline"
        size="sm"
        spacing={0}
        aria-labelledby={labelId}
      >
        <ToggleGroupItem value="rank">Ranking</ToggleGroupItem>
        <ToggleGroupItem value="name">A–Z</ToggleGroupItem>
        <ToggleGroupItem value="candidate">Candidate vote</ToggleGroupItem>
        <ToggleGroupItem value="party">Party vote</ToggleGroupItem>
      </ToggleGroup>
      <button
        type="button"
        aria-pressed={reversed}
        onClick={() => setReversed(!reversed)}
        className="inline-flex h-7 items-center gap-1.5 rounded-[min(var(--radius-md),12px)] border border-border px-2.5 text-[0.8rem] font-medium transition-colors hover:bg-muted aria-pressed:bg-muted"
      >
        <ArrowDownUp className="size-3.5" aria-hidden />
        Reverse
      </button>
    </div>
  );
}

export type SortableItem = {
  key: string;
  /** Lower ranks first; null goes after everyone ranked. */
  rank: number | null;
  /** "Surname, Given" for A–Z. */
  sortName: string;
  /** How they did in the electorate they stood in, if they did. */
  result: ElectorateResult | null;
  content: ReactNode;
};

const byName = (a: SortableItem, b: SortableItem) =>
  a.sortName.localeCompare(b.sortName, "en-NZ", { sensitivity: "base" });

/** What each order sorts on; null goes last. A–Z is by name alone. */
const keyOf = (item: SortableItem, by: SortBy): number | null =>
  by === "rank"
    ? item.rank
    : by === "candidate"
      ? (item.result?.candidate ?? null)
      : by === "party"
        ? (item.result?.party ?? null)
        : 0;

/** Votes sort best first; rankings and names from the top. */
const DESCENDING: Record<SortBy, boolean> = {
  rank: false,
  name: false,
  candidate: true,
  party: true,
};

export function SortedList({
  items,
  className,
  itemClassName,
  rowClassName,
  resultClassName,
}: {
  items: SortableItem[];
  className?: string;
  /** Each list item: the row, and under it the result line when sorting by votes. */
  itemClassName?: string;
  /** The row holding each item's content. */
  rowClassName?: string;
  resultClassName?: string;
}) {
  const { by, reversed } = useSort();
  const sorted = useMemo(() => {
    const flip = reversed ? -1 : 1;
    const dir = (DESCENDING[by] ? -1 : 1) * flip;
    return [...items].sort((a, b) => {
      const ka = keyOf(a, by);
      const kb = keyOf(b, by);
      if (ka === null || kb === null)
        return ka === kb ? byName(a, b) : ka === null ? 1 : -1;
      return (ka - kb) * dir || byName(a, b) * flip;
    });
  }, [items, by, reversed]);
  const showResults = by === "candidate" || by === "party";
  return (
    <ul className={className}>
      {sorted.map((item) => (
        <li key={item.key} className={itemClassName}>
          <div className={rowClassName}>{item.content}</div>
          {showResults && item.result ? (
            <ResultLine
              result={item.result}
              by={by}
              className={resultClassName}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** "Hutt South: 41.2% candidate vote, 35.0% party vote", the sorted one bold. */
function ResultLine({
  result: r,
  by,
  className,
}: {
  result: ElectorateResult;
  by: SortBy;
  className?: string;
}) {
  const strong = "font-semibold text-foreground";
  return (
    <span
      className={cn(
        "num mt-0.5 block text-xs text-muted-foreground",
        className,
      )}
    >
      {r.electorate}:{" "}
      <span className={cn(by === "candidate" && strong)}>
        {formatPct(r.candidate)} candidate vote
      </span>
      {r.party !== null ? (
        <>
          ,{" "}
          <span className={cn(by === "party" && strong)}>
            {formatPct(r.party)} party vote
          </span>
        </>
      ) : null}
    </span>
  );
}
