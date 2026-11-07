"use client";

import { Star } from "lucide-react";
import { toggleFavourite, useFavourites } from "@/lib/favourites";
import { cn } from "@/lib/utils";

/**
 * Star toggle for one electorate. `labelled` shows "Favourite" text beside the
 * star (electorate page); otherwise it's an icon button (cards).
 */
export function FavouriteButton({
  eNo,
  name,
  labelled = false,
  className,
}: {
  eNo: number;
  name: string;
  labelled?: boolean;
  className?: string;
}) {
  const favourites = useFavourites();
  const on = favourites?.includes(eNo) ?? false;
  const action = on
    ? `Remove ${name} from favourites`
    : `Add ${name} to favourites`;
  return (
    <button
      type="button"
      onClick={() => toggleFavourite(eNo)}
      aria-pressed={on}
      aria-label={labelled ? undefined : action}
      title={action}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
        // Not disabled before hydration: React replays an early tap once the
        // page hydrates. Just quieter until we know this browser's favourites.
        favourites === null && "opacity-60",
        labelled
          ? "sticker !rounded-full px-3 py-1 text-sm font-semibold hover:bg-secondary"
          : "size-9 justify-center text-muted-foreground hover:bg-secondary hover:text-foreground",
        on && "text-foreground",
        className,
      )}
    >
      <Star
        aria-hidden
        className={cn(
          "size-4 transition-transform",
          on &&
            "scale-110 fill-[#ffd60a] stroke-[#1b1a3a] dark:stroke-[#ffd60a]",
        )}
      />
      {labelled ? (on ? "Favourite" : "Add to favourites") : null}
    </button>
  );
}
