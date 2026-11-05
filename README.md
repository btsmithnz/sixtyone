# SixtyOne

Live results for the 2026 New Zealand general election (Saturday 7 November 2026).
It tracks who can reach a 61-seat majority, shows every electorate on a map, and charts
how the night unfolded.

- **Race to 61**: seat strip with the usual blocs, plus a Build-a-government game.
- **Map**: all 64 general and 7 Māori electorates, coloured by the candidate or party
  in front, with close-ups of Auckland, Hamilton, Wellington and Christchurch.
- **Trends**: party vote and seats over the night, and each electorate's candidate race
  over time.
- **Nail-biters**: the closest electorate races right now.

## Getting started

```bash
pnpm install
cp .env.example .env.local      # point DATABASE_URL at Postgres
pnpm db:migrate                 # create tables
pnpm simulate                   # fake an election night (until real results exist)
pnpm dev
```

Useful scripts:

| Command | What it does |
| --- | --- |
| `pnpm scrape` | One scrape of the live feed (add `--force` to ignore If-Modified-Since) |
| `pnpm simulate` | Wipes stored results and simulates a whole night (`--until 0.5`, `--seed 7`, `--steps 20`) |
| `pnpm map:build` | Rebuilds the electorate map from Stats NZ boundaries (`--refresh` to re-download) |
| `pnpm db:generate` / `db:migrate` | Drizzle migrations after editing `src/db/schema.ts` |

⚠️ `pnpm simulate` deletes all stored results. It refuses to run when
`VERCEL_ENV=production`, but double-check `DATABASE_URL` anyway.

## How it works

```
Electoral Commission feed ──(Vercel Cron, every 5 min)──▶ /api/cron/scrape
  media.election.net.nz/xml        If-Modified-Since, 75 small requests
                                              │
                                              ▼
                                         Postgres: one snapshot per feed update
                                              │  revalidateTag("results")
                                              ▼
              Cached pages ('use cache' + ISR) served from Vercel's CDN
                                              │
              Browsers poll /api/status (cached) and router.refresh() on change
```

- **Feed**: see [docs/electoral-commission-feed.md](docs/electoral-commission-feed.md)
  for the format, its quirks, and why we use `If-Modified-Since`.
- **Storage** (`src/db/schema.ts`): reference tables (parties, electorates,
  candidates), plus snapshot tables keyed by the feed's own `updated` timestamp, so
  repeated or overlapping scrapes never duplicate data. History charts come straight
  from the snapshots.
- **Caching** (`src/lib/results.ts`): every query is a `'use cache'` function tagged
  `results`, with the `results` cacheLife profile in `next.config.ts` as a safety net.
  All 71 electorate pages are prerendered via `generateStaticParams`. When the scraper
  stores something new it calls `revalidateTag("results", "max")`: visitors keep getting
  the cached page while a fresh one renders in the background. Postgres sees a handful
  of queries per scrape however many people are watching.
- **Live updates** (`src/components/live-status.tsx`): each page polls a tiny cached
  `/api/status` every 30 seconds and refreshes only when the feed has actually changed.
- **Map** (`scripts/build-map.ts`): official 2025 boundaries are clipped to the
  coastline, simplified, projected, and written to a content-hashed SVG sprite in
  `public/map/`. Pages draw electorates with `<use href="/map/electorates.<hash>.svg#e12">`,
  so the geometry is downloaded once and cached immutably, without any map library,
  tiles or paid service.
- **Seats** (`src/lib/seats.ts`): the Commission's own allocation is used when it's
  published. Otherwise we project seats with Sainte-Laguë, the 5% / one-electorate
  threshold and overhang.

## Deploying to Vercel

1. **Database.** I recommend **Neon** via the Vercel Marketplace: serverless Postgres
   that autoscales for a traffic spike, has a built-in pooler, preview-branch databases,
   and a free tier that easily covers this. Use the **pooled** connection string as
   `DATABASE_URL`. The client already disables prepared statements and keeps one
   connection per function for pgbouncer. Supabase would work just as well.
2. **Env vars.** Set `DATABASE_URL` and `CRON_SECRET` (any long random string).
3. **Migrate.** Run `pnpm db:migrate` against the production database.
4. **Cron.** `vercel.json` schedules `/api/cron/scrape` every 5 minutes. Sub-daily crons
   need a Pro plan. On the night itself, consider tightening it to every minute
   (`* * * * *`). Unchanged files return `304`, so that's still polite to the Commission.
5. **Warm-up.** Hit the cron URL once after deploying so reference data is loaded:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/scrape?force=1`

The build reads Postgres to prerender pages, so `DATABASE_URL` must be available at
build time too.

## Data and licences

- Results: [Electoral Commission media feed](https://media.election.net.nz/xml/).
- Electorate boundaries: Stats NZ / Representation Commission 2025, via Stats NZ's
  ArcGIS services, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The
  coastline comes from Stats NZ's clipped SA3 2023 layer.

More ideas: [docs/ideas.md](docs/ideas.md).
