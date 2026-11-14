"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { countedLabel, formatInt } from "@/lib/format";
import type { CountStage } from "@/lib/stage";
import { foldDiacritics } from "@/lib/text";
import { FavouriteButton } from "./favourite-button";

export type ElectorateCard = {
  eNo: number;
  name: string;
  slug: string;
  kind: "general" | "maori";
  leaderName: string | null;
  party: string | null;
  color: string;
  ink: string;
  margin: number | null;
  percentCounted: number;
  stage: CountStage;
  complete: boolean;
};

const fold = (s: string) => foldDiacritics(s).toLowerCase();

export function ElectorateGrid({
  electorates,
}: {
  electorates: ElectorateCard[];
}) {
  const [query, setQuery] = useState("");
  const q = fold(useDeferredValue(query).trim());
  const matches = (e: ElectorateCard) =>
    !q ||
    fold(e.name).includes(q) ||
    (e.leaderName ? fold(e.leaderName).includes(q) : false) ||
    (e.party ? fold(e.party).includes(q) : false);
  const groups = [
    {
      id: "general-electorates",
      title: "General electorates",
      items: electorates.filter((e) => e.kind === "general" && matches(e)),
    },
    {
      id: "maori-electorates",
      title: "Māori electorates",
      items: electorates.filter((e) => e.kind === "maori" && matches(e)),
    },
  ];

  return (
    <div className="space-y-10">
      <label className="sticker flex max-w-md items-center gap-2 !rounded-full px-4 py-2">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">Find an electorate</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find an electorate, candidate or party"
          className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
          type="search"
        />
      </label>

      {groups.map((g) =>
        g.items.length ? (
          <section key={g.id} aria-labelledby={g.id}>
            <SectionHeading
              id={g.id}
              className="font-display text-2xl font-extrabold [font-stretch:85%]"
            >
              {g.title}
            </SectionHeading>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {g.items.map((e) => (
                <li key={e.eNo} className="relative">
                  <Link
                    href={`/electorates/${e.slug}`}
                    className="group flex h-full overflow-hidden rounded-2xl border-2 border-ink bg-card shadow-[3px_3px_0_var(--sticker-shadow)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-[#4a47a0]"
                  >
                    <span
                      aria-hidden
                      className={
                        e.leaderName ? "w-3 shrink-0" : "hatch w-3 shrink-0"
                      }
                      style={
                        e.leaderName
                          ? {
                              background: e.color,
                              opacity: e.complete
                                ? 1
                                : 0.4 + 0.6 * (e.percentCounted / 100),
                            }
                          : undefined
                      }
                    />
                    <span className="min-w-0 flex-1 p-3 pr-11">
                      <span className="block truncate font-display text-lg leading-tight font-extrabold [font-stretch:90%]">
                        {e.name}
                      </span>
                      {e.leaderName ? (
                        <>
                          <span className="mt-1 block truncate text-sm">
                            {e.leaderName}{" "}
                            <span className="text-muted-foreground">
                              {e.party}
                            </span>
                          </span>
                          <span className="num mt-1 block text-xs text-muted-foreground">
                            {e.complete ? "Won" : "Ahead"} by{" "}
                            {formatInt(e.margin ?? 0)},{" "}
                            {countedLabel(e.stage, e.percentCounted)}
                          </span>
                        </>
                      ) : (
                        <span className="mt-1 block text-sm text-muted-foreground">
                          No results yet
                        </span>
                      )}
                    </span>
                  </Link>
                  {/* Beside the link, not inside it: a button can't sit in an <a>. */}
                  <FavouriteButton
                    eNo={e.eNo}
                    name={e.name}
                    className="absolute top-1.5 right-1.5"
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
      {groups.every((g) => !g.items.length) ? (
        <p className="text-muted-foreground">
          No electorates match “{query}”. Try a place name, like “Ōtāhuhu” or
          “Otahuhu”.
        </p>
      ) : null}
    </div>
  );
}
