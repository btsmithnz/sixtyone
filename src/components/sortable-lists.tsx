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
import { cn } from "@/lib/utils";

/**
 * One sort setting for every list on a page: by ranking (party list
 * position; people without one go last) or A–Z by surname, either way
 * reversible. Lists render on the server in the default order.
 */
type SortBy = "rank" | "name";
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
  content: ReactNode;
};

const byName = (a: SortableItem, b: SortableItem) =>
  a.sortName.localeCompare(b.sortName, "en-NZ", { sensitivity: "base" });

export function SortedList({
  items,
  className,
  itemClassName,
}: {
  items: SortableItem[];
  className?: string;
  itemClassName?: string;
}) {
  const { by, reversed } = useSort();
  const sorted = useMemo(() => {
    const list = [...items].sort((a, b) =>
      by === "rank"
        ? (a.rank ?? Number.POSITIVE_INFINITY) -
            (b.rank ?? Number.POSITIVE_INFINITY) || byName(a, b)
        : byName(a, b),
    );
    return reversed ? list.reverse() : list;
  }, [items, by, reversed]);
  return (
    <ul className={className}>
      {sorted.map((item) => (
        <li key={item.key} className={itemClassName}>
          {item.content}
        </li>
      ))}
    </ul>
  );
}
