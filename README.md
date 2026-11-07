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
- **Your electorates**: star electorates to follow them side by side on `/favourites`.
  Favourites live in the browser (localStorage), so the page is one cached page for
  everyone and costs nothing extra per visitor.

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
Electoral Commission feed ──(Vercel Cron, every 5 minutes)──▶ /api/cron/scrape
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
  `/api/status` every 60 seconds and refreshes only when the feed has actually changed.
- **Map** (`scripts/build-map.ts`): official 2025 boundaries are clipped to the
  coastline, simplified, projected, and written to a content-hashed SVG sprite in
  `public/map/`. Pages draw electorates with `<use href="/map/electorates.<hash>.svg#e12">`,
  so the geometry is downloaded once and cached immutably, without any map library,
  tiles or paid service.
- **Sharing and SEO** (`src/lib/site.ts`, `src/lib/og.tsx`): every page has a canonical
  URL, a live description ("National-led 63 seats, Labour-led 57…") and a share image
  rendered from the current results (`/og`, `/og/electorates/<slug>`). The image URLs
  carry `?v=<results version>`, so Slack, iMessage, X and friends fetch a fresh preview
  after each update instead of reusing a cached one. Also `sitemap.xml`, `robots.txt`
  (previews are `noindex`), a web manifest and WebSite JSON-LD.
- **Seats** (`src/lib/seats.ts`): the Commission's own allocation is used when it's
  published. Otherwise we project seats with Sainte-Laguë, the 5% / one-electorate
  threshold and overhang.

## Deploying to Vercel

1. **Database.** Neon via the Vercel Marketplace: serverless Postgres that autoscales for
   a traffic spike and has a built-in pooler. The app uses the pooled `DATABASE_URL`;
   migrations use `DATABASE_URL_UNPOOLED` when it's set. Both come from the Neon
   integration.
2. **Neon branches for previews.** Turn on database branching for Preview deployments in
   the Neon integration. Each preview then gets its own copy-on-write branch of
   production. This matters because **migrations run during every build**
   (`pnpm build` is `drizzle-kit migrate && next build`), so without branching a preview
   build would apply an unmerged migration to the production database. Branching also
   gives you a safe place for `pnpm simulate --allow-remote`.
3. **`CRON_SECRET`.** Set it to any long random string, for Production and Preview.
4. **Cron.** `vercel.json` schedules `/api/cron/scrape` every 5 minutes. Crons that run
   more than once a day need a Pro plan. Vercel only runs crons on the **production**
   deployment, so on a preview, call the route yourself. Unchanged files return `304`,
   so polling is polite. On election night itself, set the schedule back to `* * * * *` for faster updates.
5. **Warm-up.** After a deploy, run one scrape so reference data and results load:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<deployment>/api/cron/scrape?force=1`

The build prerenders pages from Postgres. An empty database builds fine, with empty
states until the first scrape.

## Data and licences

- Results: [Electoral Commission media feed](https://media.election.net.nz/xml/).
- Electorate boundaries: Stats NZ / Representation Commission 2025, via Stats NZ's
  ArcGIS services, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The
  coastline comes from Stats NZ's clipped SA3 2023 layer.

More ideas: [docs/ideas.md](docs/ideas.md).
