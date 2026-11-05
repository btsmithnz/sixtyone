# Ideas

## Already built

- **Build-a-government.** Move parties between blocs and the crossbench and watch the
  race to 61 respond. Election night is mostly about coalition maths.
- **Nail-biters.** The closest electorate races, updated live.
- **Our own seat projection.** Sainte-Laguë with threshold and overhang, used until the
  Commission publishes its allocation, so seats show up from the first results.
- **"By % counted" charts.** Plotting against how much is counted rather than clock
  time shows the advance-vote drift clearly.
- **Simulator.** `pnpm simulate` replays a plausible night through the real parsers, so
  the site can be tested before 7pm on the 7th.

## Worth doing next

1. **Share cards.** Per-electorate Open Graph images (`opengraph-image.tsx`), for
   example "Auckland Central: Swarbrick ahead by 1,203 with 82% counted". Election
   night is a very social-media night.
2. **Booth-level dot map.** After the night, backfill the 9,363 voting-place files once
   and plot booths by lat/lon, coloured by who won them. Don't poll these files live:
   that's ~9k requests per cycle to the Commission's uncached origin.
3. **Kingmaker list.** Enumerate every minimal coalition that reaches 61 and highlight
   parties that appear in all of them.
4. **Swing against 2023.** Needs 2023 results re-aggregated onto the 2025 boundaries
   (booth-level 2023 data plus voting place locations makes this possible).
5. **Follow an electorate.** Pin a few electorates to the top of the home page
   (localStorage), or send web push when a followed race flips.
6. **Official results.** The final count lands about three weeks later and specials
   often flip a seat. Ingest it and show "election night vs final".
7. **Hex cartogram view.** An equal-area tile map stops rural electorates dominating
   and makes Auckland legible without an inset.
8. **Embeds.** An iframe-able race strip for other sites and blogs.
