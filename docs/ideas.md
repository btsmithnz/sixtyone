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
- **Share cards.** Live preview images for the home page, each electorate, and sections
  and voting places with their own share pages.
- **Booth by booth.** Voting place results, imported once after the night (not polled
  live: that would be ~9k requests per cycle to the Commission's uncached origin) and
  mapped for every electorate, with standout places.
- **Follow an electorate.** Star electorates to see them side by side on `/favourites`.

## Worth doing next

1. **Kingmaker list.** Enumerate every minimal coalition that reaches 61 and highlight
   parties that appear in all of them.
2. **Swing against 2023.** Needs 2023 results re-aggregated onto the 2025 boundaries
   (booth-level 2023 data plus voting place locations makes this possible).
3. **Web push for followed electorates**, when a followed race flips.
4. **Official results.** The final count lands about three weeks later and specials
   often flip a seat. Ingest it and show "election night vs final".
5. **Hex cartogram view.** An equal-area tile map stops rural electorates dominating
   and makes Auckland legible without an inset.
6. **Embeds.** An iframe-able race strip for other sites and blogs.
