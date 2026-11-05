# Electoral Commission results feed

The Electoral Commission (Te Kaitiaki Take Kōwhiri) publishes election-night results as a
tree of static XML files at:

```
https://media.election.net.nz/xml/
```

This document describes the feed as observed on **5 November 2026**, two days before
the 2026 General Election (7 November 2026). At that point every file was
pre-populated with the final lists of parties, candidates, electorates and voting places,
but every vote count was `0`. All files carried `updated="2026-10-22T15:19:30"`.

> Expect small changes on the night. Everything below comes from inspecting the
> pre-election files, not from a live count. Keep the parser lenient: ignore unknown
> elements, and treat missing or empty numbers as `0`.

---

## Directory layout

```
/xml/
├── election.xml          # national totals + per-party votes & seats        (~5 KB)
├── statistics.xml        # static counts (parties, candidates, electors…)   (<1 KB)
├── parties.xml           # party reference data (all 36 parties)            (~7 KB)
├── candidates.xml        # candidate reference data (530 candidates)        (~100 KB)
├── electorates.xml       # electorate reference data (71 electorates)       (~7 KB)
├── votingplaces.xml      # voting place reference data (address, lat/lon)   (~617 KB)
├── e01/
│   ├── e01.xml           # electorate 1 totals: party votes + candidate votes
│   └── votingplaces/
│       ├── 01-01001.xml  # electorate 1 results counted at voting place 1 in electorate 1
│       ├── 01-01002.xml
│       └── …
├── e02/
│   └── …
└── e71/
    ├── e71.xml
    └── votingplaces/     # Māori electorates have many more files (see below)
```

- `eNN` is the electorate number, zero-padded to two digits (`e01` to `e71`).
- Electorates **1–64** are general electorates (alphabetical), and **65–71** are the
  seven Māori electorates (also alphabetical).
- The server is Apache behind Cloudflare. Directory listings are enabled, so you can
  browse every folder.

### Voting-place file naming

```
{e_no:02}-{vp_e_no:02}{vp_no:03}.xml
   │         │          └─ voting place number within its physical electorate
   │         └─ the electorate the voting place is physically located in
   └─ the electorate whose votes are being reported
```

A voting place issues ballot papers for **several electorates**. For example, a booth in
Botany (electorate 3) issues both Botany general-roll papers and Hauraki-Waikato Māori-roll
papers. So `e65/votingplaces/65-03002.xml` holds Hauraki-Waikato votes cast at voting
place #2 in Botany.

This explains why the Māori electorate folders are so large. Their voters vote at booths
across many general electorates:

| Folder | Files |
| --- | --- |
| `e01`–`e64` (general) | 28 to 127 each |
| `e65` Hauraki-Waikato | 305 |
| `e66` Ikaroa-Rāwhiti | 277 |
| `e67` Tāmaki Makaurau | 387 |
| `e68` Te Tai Hauāuru | 395 |
| `e69` Te Tai Tokerau | 339 |
| `e70` Te Tai Tonga | 847 |
| `e71` Waiariki | 202 |

`statistics.xml` reports `total_voting_place_results = 9363` (the number of these files)
and `total_voting_places = 2686` (physical locations).

---

## Identifiers

| Key | Meaning | Found in |
| --- | --- | --- |
| `e_no` | Electorate number 1–71 | everywhere |
| `p_no` | Party number. Stable across elections and **not** contiguous (e.g. 5 = ACT, 13 = Labour, 16 = National) | parties, election, eNN, voting places |
| `c_no` | Candidate number | candidates, eNN, voting places |
| `vp_id` | Globally unique voting place id | votingplaces.xml, voting-place files |
| `vp_e_no` + `vp_no` | Physical electorate and voting place number within it | voting-place files |

In `candidates.xml`, `0` means "none": `<electorate>0</electorate>` is a list-only
candidate, `<party>0</party>` is an independent, and `<list_no>0</list_no>` means the
candidate is not on a party list.

---

## Reference files

These are effectively static during the night, so fetch them once and cache them.

### `electorates.xml`

```xml
<electorates>
    <electorate e_no="1">
        <electorate_name>Auckland Central</electorate_name>
    </electorate>
    …
</electorates>
```

Names include macrons (`Kaikōura`, `Māngere`, `Ōtāhuhu`, `Taupō`, `Tāmaki`,
`Whangārei`, `Whangaparāoa`, `Waitākere`, `Rangitīkei`, `Ikaroa-Rāwhiti`,
`Te Tai Hauāuru`). Files are UTF-8.

### `parties.xml`

```xml
<parties>
    <party p_no="5">
        <abbrev>ACT</abbrev>
        <short_name>ACT New Zealand</short_name>
        <party_name>ACT New Zealand</party_name>
        <registered>yes</registered>
    </party>
    …
</parties>
```

- 36 parties in total, of which 17 are `registered="yes"`. Only registered parties appear
  on the party-vote ballot and in the `partyvotes` / `partystatus` sections.
- Unregistered parties appear only as affiliations for electorate candidates.
- Abbreviations are **not unique**. `PPNZ` is used by both p_no 63 (Protect and Prosper)
  and p_no 77 (People's Party). Always key on `p_no`.
- Names can contain entities (`&amp;`), curly apostrophes (`Women’s Rights Party`) and
  trailing whitespace (`New World Order McCann Party `). Trim them.

Registered parties for 2026:

| p_no | abbrev | name |
| --- | --- | --- |
| 5 | ACT | ACT New Zealand |
| 10 | GP | Green Party |
| 13 | LAB | Labour Party |
| 14 | TPMAO | Te Pāti Māori |
| 16 | NAT | National Party |
| 17 | NZF | New Zealand First Party |
| 20 | OFP | NZ Outdoors & Freedom Party |
| 24 | OPP | Opportunity Party |
| 34 | NC | Conservative Party NZ |
| 36 | ALCP | Aotearoa Legalise Cannabis Party |
| 52 | AJP | Animal Justice Party Aotearoa New Zealand |
| 56 | WRP | Women’s Rights Party |
| 66 | VNZ | Vision New Zealand |
| 68 | APN | Alliance Party |
| 69 | FPT | Free Palestine |
| 70 | NLY | New Zealand Loyal |
| 71 | TTTP | Te Tai Tokerau Party |

### `candidates.xml`

```xml
<candidates>
    <candidate c_no="243">
        <candidate_name>SWARBRICK, Chlöe</candidate_name>
        <electorate>1</electorate>
        <party>10</party>
        <list_no>2</list_no>
    </candidate>
    …
</candidates>
```

- 530 candidates: 61 list-only (`electorate=0`) and 87 electorate-only (`list_no=0`).
- Names are formatted `SURNAME, Given`, with the surname in upper case.
- There's no explicit flag for list-only candidates, so use `electorate=0`.

### `votingplaces.xml`

```xml
<votingplaces>
    <votingplace vp_id="362" vp_e_no="37">
        <vp_address>Kawakawa Bay Public Hall, 19 Kawakawa-Orere Road, Kawakawa Bay</vp_address>
        <vp_lat>-36.950050406009325</vp_lat>
        <vp_lon>175.1703876225217</vp_lon>
    </votingplace>
    <votingplace vp_id="361" vp_e_no="34">
        <vp_address>Mobile Team, Team 1, Taken in Ōtāhuhu Electorate</vp_address>
        <vp_lat></vp_lat>
        <vp_lon></vp_lon>
    </votingplace>
    …
</votingplaces>
```

- Lat/lon are empty for mobile teams, care homes and similar places.
- ⚠️ **This file is unreliable through Cloudflare.** Repeated fetches returned either
  `502` or a truncated body (~48 KB of 617 KB, `curl: (18) transfer closed with
  outstanding read data remaining`). If you need it, retry with backoff, check that the
  body ends with `</votingplaces>`, and keep a good copy. SixtyOne does not depend on it.

### `statistics.xml`

```xml
<statistics updated="2026-10-22T15:19:30">
    <total_registered_parties>17</total_registered_parties>
    <total_all_parties>36</total_all_parties>
    <total_electorates>71</total_electorates>
    <total_candidates>530</total_candidates>
    <total_voting_places>2686</total_voting_places>
    <total_voting_place_results>9363</total_voting_place_results>
    <total_electors>3633546</total_electors>
</statistics>
```

`total_electors` (enrolled voters) is the denominator for turnout.

---

## Results files

These change through the night.

### `election.xml`: national summary

```xml
<election updated="2026-10-22T15:19:30">
    <statistics>
        <total_voting_places_counted>0</total_voting_places_counted>
        <percent_voting_places_counted>0.0</percent_voting_places_counted>
        <total_votes_cast>0</total_votes_cast>
        <percent_votes_cast>0.0</percent_votes_cast>
        <total_electorates_final>0</total_electorates_final>
        <percent_electorates_final>0.00</percent_electorates_final>
        <total_minimal_votes>0</total_minimal_votes>
        <total_special_votes>0</total_special_votes>
        <total_registered_parties>17</total_registered_parties>
    </statistics>
    <partystatus>
        <party p_no="5">
            <votes>0</votes>
            <percent_votes>0</percent_votes>
            <party_seats>0</party_seats>       <!-- list seats -->
            <candidate_seats>0</candidate_seats> <!-- electorate seats -->
            <total_seats>0</total_seats>
        </party>
        …
    </partystatus>
</election>
```

- `partystatus` has one entry per registered party (17).
- `percent_votes_cast` is turnout as a percentage of `total_electors`.
- The Commission calculates and publishes the seat allocation (`party_seats` +
  `candidate_seats`) as the count progresses, using Sainte-Laguë with the 5% / one
  electorate threshold. Overhang seats show up as a `total_seats` sum above 120.
- `total_special_votes` will stay `0` on election night. Special votes are only counted
  for the official result, about three weeks later.

### `eNN/eNN.xml`: electorate totals

```xml
<electorate e_no="1" final="true" updated="2026-10-22T15:19:30">
    <statistics>
        <total_voting_places>0</total_voting_places>
        <total_voting_places_counted>0</total_voting_places_counted>
        <percent_voting_places_counted>0.0</percent_voting_places_counted>
        <total_votes_cast>0</total_votes_cast>
        <percent_votes_cast>0.0</percent_votes_cast>
        <total_party_informals>0</total_party_informals>
        <total_candidate_informals>0</total_candidate_informals>
        <total_registered_parties>17</total_registered_parties>
        <total_candidates>6</total_candidates>
    </statistics>
    <partyvotes>
        <party p_no="5"><votes>0</votes></party>
        …                                  <!-- all 17 registered parties -->
    </partyvotes>
    <candidatevotes>
        <candidate c_no="276"><votes>0</votes></candidate>
        …                                  <!-- every candidate standing in this electorate -->
    </candidatevotes>
</electorate>
```

- Votes come as raw counts. Percentages and margins are left to you.
- `final` is an attribute on the root element. Before the night every electorate already
  says `final="true"`, which is clearly a placeholder, so **don't trust `final` while
  `total_voting_places_counted` is below `total_voting_places`**. Treat an electorate as
  complete only when every voting place is counted.
- The candidate in the lead is the provisional electorate winner. Nothing in the XML
  names a "winner".

### `eNN/votingplaces/*.xml`: per-booth results

```xml
<votingplace vp_id="380" vp_e_no="1" e_no="1" vp_no="1" updated="2026-10-22T15:19:30">
    <time_received></time_received>        <!-- empty until the booth reports -->
    <statistics>
        <total_issued_ballot_papers>0</total_issued_ballot_papers>
        <total_party_informals>0</total_party_informals>
        <total_candidate_informals>0</total_candidate_informals>
    </statistics>
    <partyvotes> … </partyvotes>
    <candidatevotes> … </candidatevotes>
</votingplace>
```

This is the most granular data: 9,363 files. `time_received` is set when that booth's
result arrives, which makes it the best signal for exactly when each result landed.

---

## HTTP behaviour and polling etiquette

| Observation | Implication |
| --- | --- |
| `Last-Modified` header present (in UTC; it matches the `updated` attribute) | Use **`If-Modified-Since`** for conditional requests. A `304` costs almost nothing. |
| `ETag` is weak (`W/"…-gzip"`) and `If-None-Match` still returned `200` | Don't rely on ETags. Use `If-Modified-Since`. |
| `cf-cache-status: DYNAMIC` | Cloudflare does not cache these files, so every request reaches the Commission's origin. Be polite. |
| `content-type: application/xml`, UTF-8 | Decode as UTF-8 so macrons survive. |
| Large files occasionally fail (`502`, truncated HTTP/2 streams) | Retry with backoff and check the closing root tag before trusting a body. |

### Timestamps

The `updated` attributes are **New Zealand local time with no offset**
(`2026-10-22T15:19:30` is NZDT, UTC+13). The matching `Last-Modified` header is
`Thu, 22 Oct 2026 02:19:30 GMT`. Convert with the `Pacific/Auckland` zone before storing.
Election night (7 November 2026) falls in NZDT, UTC+13.

---

## How SixtyOne uses the feed

Each scrape (Vercel Cron, every few minutes on the night):

1. `GET election.xml` with `If-Modified-Since`. On `304`, stop.
2. Otherwise store a national snapshot (`election.xml` statistics + `partystatus`),
   keyed by its `updated` timestamp so duplicates are ignored.
3. `GET` all 71 `eNN/eNN.xml` files with limited concurrency, each with its own
   `If-Modified-Since`, and store an electorate snapshot for each one whose `updated`
   changed.
4. Revalidate the `results` cache tag so pages rebuild from the new data.

Reference files (`parties.xml`, `candidates.xml`, `electorates.xml`, `statistics.xml`)
are re-synced on every scrape that finds changes. They're small and upserts are cheap.

Per-voting-place files aren't scraped. At 9,363 requests per cycle, that would be rude
to the Commission's origin and isn't needed for electorate-level charts. A one-off
backfill after the night is a sensible extension: see [ideas](./ideas.md).
