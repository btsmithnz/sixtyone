# Official results

About three weeks after election night the Electoral Commission declares the official
result: every special vote counted and every ordinary vote rechecked. SixtyOne then
makes the official count the main thing it shows, and keeps election night's
preliminary count as history ("How the night unfolded") and as the baseline for what
changed.

Nothing here is specific to 2026. The live, preliminary site keeps working for the
next election; the official count is just a later stage of the same data.

## What the Commission publishes

Based on the 2023 statistics pages (`electionresults.govt.nz/electionresults_2023/statistics/`).
The format isn't guaranteed to match, so parsers are written on the day.

- **National:** seats by party (electorate and list), official vote shares, the
  Sainte-Laguë quotients, and the party lists with the seat each list MP filled
  ("Seat Allocation 28").
- **By electorate:** ordinary and special votes for both the party and candidate votes,
  informal and disallowed votes, electors on the roll, and turnout. Winners with their
  majority.
- **Specials:** totals by electorate (NZ and overseas) and why votes were disallowed.
  The summary CSVs don't split specials by party.
- **Also:** official split-vote tables and per-voting-place results (booth tables
  already take an official stage).
- **Not included:** a timeline. The official count is one snapshot.

If the results feed (`media.election.net.nz/xml`) comes back, it may publish the official
count in the same XML format as election night.

## Data model

Every snapshot carries a `stage`: `preliminary` or `official` (`src/db/schema.ts`,
`src/lib/stage.ts`).

- **Pages show the newest snapshot**, as they always have, and official snapshots are
  newer. The national snapshot's stage is the page's stage (`Overview.stage`); each
  electorate also carries its own (`ElectorateSummary.stage`), and an official
  electorate always counts as complete.
- **History stays preliminary.** The charts read preliminary snapshots only, and the
  official result is drawn as a separate dot. Otherwise the official snapshot (at 100%)
  would replace election night's final point.
- **The comparison** is the last preliminary snapshot, read only once an official one
  exists: `PartyResult.preliminary` (vote share and seats), `ElectorateSummary.preliminary`
  (leader and margin) and `Overview.preliminary` (vote total and House size).
- **Recounts** just add a newer official snapshot; the newest wins.

### Getting official data in

Both paths store the same rows, then call `revalidateTag("results", "max")` once.

1. **Feed:** run the scraper with `COUNT_STAGE=official` so what it stores is tagged
   official.
2. **CSV/HTML:** an import script (dry run first, like `pnpm booths:import`) writes one
   official national snapshot and one per electorate **in a single transaction**, so
   visitors never see half the electorates official. Electorate snapshots need no voting
   place counts: an official electorate is always complete.

Test the whole switch beforehand with `pnpm simulate --official`, which adds a plausible
set of special votes to the last preliminary snapshot and stores the result as official.

## What shows a change since election night

Every party and candidate gains votes in the official count, so changes in raw votes are
noise. Changes show only where a share, a margin or an outcome can move:

| Show the change | Final figure only |
| --- | --- |
| Seats per party, bloc totals, House size | Each candidate's votes |
| National party vote share (points) | Party vote within an electorate |
| Electorates that changed hands | Booths, standouts, split votes |
| Electorate margins | Favourites |
| MPs in and out (Parliament page) | |
| Total votes | |

It's called "since election night", not "special votes", because the official count also
rechecks ordinary votes.

## Where it shows

- **Home:** the race to 61 settles; a "What changed since election night" card replaces
  the special votes what-if (hidden, not deleted); the count meter becomes the official
  vote total; party vote shows changes in points; the night's charts gain an official
  marker.
- **Electorate pages:** official badge, margin against election night, and a callout when
  the seat changed hands.
- **Map and nail-biters:** coloured and ranked by the official result. The map's tooltip
  flags seats that changed hands; nail-biters show election night's margin alongside.
- **Parliament:** official MPs, plus who came in or dropped out since election night.
- **Copy:** titles, descriptions, share images and the status line follow the stage.
