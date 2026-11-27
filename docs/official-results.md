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

- **Pages show the latest snapshot, and official outranks preliminary**, whatever the
  timestamps: a preliminary update stored after the official count can't replace it.
  The national snapshot's stage is the page's stage (`Overview.stage`); each electorate
  also carries its own (`ElectorateSummary.stage`), and an official electorate always
  counts as complete.
- **History stays preliminary.** The charts read preliminary snapshots only, and the
  official result is drawn as a separate dot. Otherwise the official snapshot (at 100%)
  would replace election night's final point.
- **The comparison** is the last preliminary snapshot, read only once an official one
  exists: `PartyResult.preliminary` (vote share and seats), `ElectorateSummary.preliminary`
  (leader and margin) and `Overview.preliminary` (vote total and House size).
- **Recounts** just add a newer official snapshot; the newest wins.

### Getting official data in

Both paths store the same rows. Each import has its own `updated` time (when it was
published or saved): the newest timestamp is the results version, so a re-import with
the same one is a no-op.

1. **Feed:** set `COUNT_STAGE=official` (Production, then redeploy so the cron route
   sees it) before the feed publishes the official count, and keep it while recounts
   may come through. Remove it afterwards, so the next election's night is stored as
   preliminary. If it's forgotten, the official numbers are stored as preliminary: the
   site keeps showing any official count already stored, but election night's history
   and baseline pick up the official numbers.
2. **Results pages (what 2026 used):** the results site is HTML behind a Cloudflare
   challenge, so the pages are saved from a browser into the gitignored
   `data/official-<year>/` (`index.html`, `successful-candidates.html`, every
   `electorate-details-NN.html`, and a `manifest.json` of `{ source, fetchedAt, pages }`).
   Then:
   - `pnpm official:distil` turns them into `imports/official-<year>.json`: names and
     numbers only, about 140 KB, committed. Every total on the pages is checked against
     its parts (votes, informals, majorities, seats, electorate winners), so a change in
     the page format fails here.
   - `pnpm official:import` dry-runs it against `DATABASE_URL`: it matches every name to
     the stored parties, candidates and electorates and prints the seat changes and the
     electorates that changed hands. Add `--write` to store it.
   - **The build runs `official:import --write`** after migrating, so committing the file
     is the release: the PR's preview deployment imports into its Neon branch (check it
     there), and merging imports into production. A new deployment starts with an empty
     cache, so nothing needs revalidating. It's a no-op once stored, on a database with no
     parties, and when a newer official count is stored. A name that doesn't match fails
     the build.
   - It writes one official national snapshot and one per electorate **in a single
     transaction**, with the Commission's seat allocation in the party rows.
   - The pages have no voting place counts, electors or special votes. Places come from
     election night's count, turnout uses election night's roll, and special votes are
     stored as 0. The E9 statistics (mid-December) have the rest; a later file with a
     newer `fetchedAt` adds a newer official snapshot, which wins.
   - For the next election, delete the old file from `imports/`: its names won't match
     the new database, which fails the build.

After a manual import (one that isn't part of a deploy), refresh the site:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/revalidate
```

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
