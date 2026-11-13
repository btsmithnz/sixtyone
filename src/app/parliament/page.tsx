import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LiveStatus } from "@/components/live-status";
import { SectionHeading } from "@/components/section-heading";
import {
  ListSortControls,
  ListSortProvider,
  SortedList,
} from "@/components/sortable-lists";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPct } from "@/lib/format";
import {
  buildParliament,
  type LeavingMp,
  type Mp,
  type Parliament,
} from "@/lib/parliament";
import { partyColorVar, partyStyle } from "@/lib/parties";
import { getOverview } from "@/lib/results";
import { shareMetadata } from "@/lib/site";
import { OFFICIAL_RESULTS_DATE } from "@/lib/specials";

export async function generateMetadata(): Promise<Metadata> {
  const title = "Your new Parliament";
  const description =
    "Who's in and who's out on the 2026 NZ election results: every MP, who's new, and who's leaving.";
  return {
    title,
    description,
    ...shareMetadata({
      title: `${title} | NZ election 2026`,
      description,
      path: "/parliament",
      version: (await getOverview()).version,
    }),
  };
}

export default function ParliamentPage() {
  return (
    <div className="space-y-6 pt-2">
      <h1 className="font-display text-5xl font-extrabold tracking-tight [font-stretch:80%] sm:text-6xl">
        Your new Parliament
      </h1>
      <Suspense fallback={<Skeleton className="h-[640px] rounded-3xl" />}>
        <ParliamentResults />
      </Suspense>
    </div>
  );
}

async function ParliamentResults() {
  const overview = await getOverview();
  const { stats, parties, houseSize, version, updatedAt } = overview;
  const parliament = buildParliament(overview);
  const { mps, leaving } = parliament;

  if (!mps.length) {
    return (
      <>
        <LiveStatus updatedAt={updatedAt} version={version} />
        <p className="hatch rounded-2xl p-6 text-sm text-muted-foreground">
          <span className="rounded bg-card px-1">
            The new Parliament shows up here once results come in.
          </span>
        </p>
      </>
    );
  }

  const counted = stats?.percentCounted ?? 0;
  const newCount = mps.filter((m) => !m.returning).length;
  const groups = groupByParty(mps, parties);
  const lost = leaving.filter((m) => m.reason === "lost");
  const retired = leaving.filter((m) => m.reason === "retired");

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <LiveStatus updatedAt={updatedAt} version={version} />
        <p className="max-w-[65ch] text-muted-foreground">
          {counted >= 100
            ? "Who’s in and who’s out on the election-night count."
            : `Who’s in and who’s out on the count so far, with ${formatPct(counted)} of voting places counted.`}{" "}
          Special votes are added in the official results on{" "}
          {OFFICIAL_RESULTS_DATE}, and they can move the last list seats of each
          party.{" "}
          <Link href="/#special-votes" className="underline underline-offset-2">
            See what they could change
          </Link>
          .
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="MPs" value={mps.length} />
        <Stat label="New" value={newCount} />
        <Stat label="Returning" value={mps.length - newCount} />
        <Stat label="Leaving" value={leaving.length} />
      </dl>

      <p className="-mt-4 text-xs text-muted-foreground">
        “New” means they weren’t in the outgoing Parliament. A few have been MPs
        before.
      </p>

      {houseSize > mps.length ? (
        <p className="max-w-[65ch] text-sm text-muted-foreground">
          {houseSize - mps.length} of the {houseSize} seats can’t be filled: a
          party is owed more list seats than it has people on its list, so those
          seats stay empty.
        </p>
      ) : null}

      <ListSortProvider>
        <section aria-labelledby="whos-in" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionHeading
              id="whos-in"
              className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%] sm:text-4xl"
            >
              Who’s in
            </SectionHeading>
            <ListSortControls />
          </div>
          <div className="space-y-6">
            {groups.map((g) => (
              <PartyCard
                key={g.pNo ?? "ind"}
                group={g}
                parliament={parliament}
              />
            ))}
          </div>
        </section>

        <section aria-labelledby="whos-out" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionHeading
              id="whos-out"
              className="font-display text-3xl font-extrabold tracking-tight [font-stretch:85%] sm:text-4xl"
            >
              Who’s out
            </SectionHeading>
            <ListSortControls />
          </div>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            Members of the outgoing Parliament who aren’t coming back, with the
            party they were elected for.
          </p>
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <LeavingCard
              title="Stood again, not elected"
              people={lost}
              empty="Everyone who stood again is back."
            />
            <LeavingCard
              title="Didn’t stand again"
              people={retired}
              empty="Every MP stood again."
            />
          </div>
        </section>
      </ListSortProvider>
    </div>
  );
}

type Group = {
  pNo: number | null;
  name: string;
  color: string;
  electorateMps: Mp[];
  listMps: Mp[];
};

function groupByParty(mps: Mp[], parties: { pNo: number; name: string }[]) {
  const names = new Map(parties.map((p) => [p.pNo, p.name]));
  const groups = new Map<number | null, Group>();
  for (const m of mps) {
    const key = m.pNo ?? null;
    let g = groups.get(key);
    if (!g) {
      g = {
        pNo: key,
        name: partyStyle(key, key ? names.get(key) : undefined).short,
        color: partyColorVar(key),
        electorateMps: [],
        listMps: [],
      };
      groups.set(key, g);
    }
    (m.electorate ? g.electorateMps : g.listMps).push(m);
  }
  const size = (g: Group) => g.electorateMps.length + g.listMps.length;
  return [...groups.values()].sort((a, b) => size(b) - size(a));
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="sticker p-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="num font-display text-5xl leading-none font-extrabold tracking-tight [font-stretch:80%]">
        {value}
      </dd>
    </div>
  );
}

function PartyCard({
  group: g,
  parliament,
}: {
  group: Group;
  parliament: Parliament;
}) {
  const total = g.electorateMps.length + g.listMps.length;
  const queue = g.pNo !== null ? parliament.queues.get(g.pNo) : undefined;
  const filled = g.pNo !== null ? (parliament.listSeats.get(g.pNo) ?? 0) : 0;
  // A short list can't fill every seat it's owed.
  const seated = Math.min(filled, queue?.length ?? 0);
  const lastIn = seated > 0 ? queue?.[seated - 1] : undefined;
  const nextIn = queue?.[seated];
  const newCount = [...g.electorateMps, ...g.listMps].filter(
    (m) => !m.returning,
  ).length;
  // Owed more list seats than the list has names.
  const unfilled = Math.max(0, filled - g.listMps.length);

  return (
    <article
      className="sticker overflow-hidden"
      aria-labelledby={`party-${g.pNo ?? "ind"}`}
    >
      <div className="h-2" style={{ background: g.color }} aria-hidden />
      <div className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3
            id={`party-${g.pNo ?? "ind"}`}
            className="font-display text-2xl font-extrabold [font-stretch:90%]"
          >
            {g.name} <span className="num text-muted-foreground">{total}</span>
          </h3>
          <p className="text-sm text-muted-foreground">
            {g.electorateMps.length} electorate, {g.listMps.length} list
            {newCount ? `, ${newCount} new` : ""}
          </p>
        </div>

        <SortedList
          // Flows down each column, like a printed list.
          className="mt-3 gap-x-8 sm:columns-2 lg:columns-3"
          itemClassName="flex break-inside-avoid items-baseline justify-between gap-3 border-b border-border py-1.5 text-sm"
          items={[...g.electorateMps, ...g.listMps].map((m) => ({
            key: String(m.cNo),
            rank: m.listNo,
            sortName: m.sortName,
            content: (
              <>
                <span className="min-w-0">
                  <span className="font-medium">{m.name}</span>
                  {!m.returning ? (
                    <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 align-[1px] text-[0.7rem] font-semibold text-primary-foreground">
                      New
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right text-xs text-muted-foreground">
                  {m.electorate ? (
                    <Link
                      href={`/electorates/${m.electorate.slug}`}
                      className="hover:text-foreground hover:underline"
                    >
                      {m.electorate.name}
                    </Link>
                  ) : (
                    "List"
                  )}
                  {m.listNo ? <span className="num"> #{m.listNo}</span> : null}
                </span>
              </>
            ),
          }))}
        />

        {unfilled ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {unfilled} more list {unfilled === 1 ? "seat is" : "seats are"}{" "}
            owed, but the list has run out, so{" "}
            {unfilled === 1 ? "it stays" : "they stay"} empty.
          </p>
        ) : null}
        {lastIn || nextIn ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {lastIn ? (
              <>
                Last in on the list:{" "}
                <span className="font-medium text-foreground">
                  {lastIn.name}
                </span>{" "}
                <span className="num">(#{lastIn.listNo})</span>.{" "}
              </>
            ) : null}
            {nextIn ? (
              <>
                Next in line:{" "}
                <span className="font-medium text-foreground">
                  {nextIn.name}
                </span>{" "}
                <span className="num">(#{nextIn.listNo})</span>.
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function LeavingCard({
  title,
  people,
  empty,
}: {
  title: string;
  people: LeavingMp[];
  empty: string;
}) {
  return (
    <div className="sticker p-5">
      <h3 className="font-display text-2xl font-extrabold [font-stretch:90%]">
        {title}{" "}
        <span className="num text-muted-foreground">{people.length}</span>
      </h3>
      {people.length ? (
        <SortedList
          className="mt-3"
          itemClassName="flex items-start gap-2.5 border-b border-border py-2 text-sm"
          items={people.map((m) => ({
            key: m.sortName,
            // Their 2026 list position.
            rank: m.stood?.listNo ?? null,
            sortName: m.sortName,
            content: (
              <>
                <span
                  aria-hidden
                  className="mt-1 size-3 shrink-0 rounded-full"
                  style={{ background: partyColorVar(m.pNo) }}
                />
                <span className="min-w-0">
                  <span className="font-medium">{m.name}</span>{" "}
                  <span className="text-muted-foreground">
                    {partyStyle(m.pNo).short}
                  </span>
                  {m.stood ? (
                    <span className="block text-xs text-muted-foreground">
                      {stoodText(m)}
                    </span>
                  ) : null}
                </span>
              </>
            ),
          }))}
        />
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

/** "Stood in Hutt South, #3 on the list", noting a change of party. */
function stoodText({ pNo, stood }: LeavingMp) {
  if (!stood) return "";
  const parts: string[] = [];
  if (stood.electorate) parts.push(`stood in ${stood.electorate}`);
  if (stood.listNo) parts.push(`#${stood.listNo} on the list`);
  let text = parts.join(", ") || "stood";
  if (stood.pNo !== pNo) {
    text += stood.pNo
      ? ` for ${partyStyle(stood.pNo).short}`
      : " as an independent";
  }
  return text[0].toUpperCase() + text.slice(1);
}
