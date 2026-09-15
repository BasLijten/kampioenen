# Historical pre-match ClubElo extraction and reuse contract

Research for [issue #110](https://github.com/BasLijten/kampioenen/issues/110): “Confirm the historical pre-match ClubElo extraction and reuse contract”.

- Researched: 2026-09-15
- Branch: `research/clubelo-pre-match-contract`
- Scope: evidence and decision only; no product code or generated data changed

## Decision

**Fail closed: do not approve a historical ClubElo backfill or publish a derived dataset yet.**

The Football-Data.co.uk match rows are usable as the target-match index from 2015/16 onward, but the current evidence does not establish a reproducible, authorized, and reachable ClubElo extraction contract for strict pre-match `Elo` and `HFA` values. A future importer may proceed only after the ClubElo owner confirms the endpoint, schema, point-in-time semantics, request limits, and reuse/publication conditions, followed by a small audited extraction.

## What is proven

### Football-Data.co.uk supplies the match rows

The official Netherlands season page links the Eredivisie `N1.csv` files for 2015/16 and later seasons. The [2015/16 file](https://football-data.co.uk/mmz4281/1516/N1.csv) returned HTTP 200 on the research date and contained 306 match rows after the header. Its header begins:

```text
Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,...
```

There is **no `Time` column** in 2015/16. A later file, [2021/22](https://football-data.co.uk/mmz4281/2122/N1.csv), includes `Time` between `Date` and `HomeTeam`. The source [column notes](https://football-data.co.uk/notes.txt) define `Date` as `dd/mm/yy`, `Time` as kick-off time, `HomeTeam`/`AwayTeam`, `FTHG`/`FTAG` as full-time goals, and `FTR` as `H`, `D`, or `A`.

Consequences:

- A 2015/16 row can be keyed by match date and the two source team names.
- It cannot be assigned a verified exact pre-kickoff instant from this file alone.
- For 2015/16, a date-only selection must use a conservative previous-valid-rating rule; it must not claim exact time ordering for multiple matches on the same date.
- The CSV includes bookmaker odds and other fields. Those are not part of this Elo-only contract and must be excluded.

The files are downloadable, but the checked [disclaimer](https://football-data.co.uk/disclaimer.php) is a liability notice, not an explicit open-data or redistribution licence. Publicly committing raw CSVs or derived snapshots therefore needs a separate permission decision.

### ClubElo publishes the relevant model semantics

The official [ClubElo system description](https://clubelo.com/System) says that the Elo difference is converted to win probability with the Elo equation, that `k = 20` is used, and that home-field advantage (`HFA`) is added to the Elo difference for a home match. It says HFA is adjusted separately for each country and day using the observed exchange of Elo points.

The official ClubElo result/calculation page visibly exposes these fields:

```text
Prior Δ | HFA | Elo % | FT | ET | P | Game Δ | Post-Game Δ
```

The page also exposes per-club rows with `Date`, `H/A`, `Opponent`, `Prior Δ`, `HFA`, `Elo %`, `FT`, `Game Δ`, `Post-Game Δ`, `Elo +/-`, `New Elo`, and `New Rank`; see the [Ajax page](https://clubelo.com/Ajax) and the [current results page](https://clubelo.com/Results).

For the extraction contract, the safe interpretation is:

| Field | Contract meaning | Use for pre-match fit? |
| --- | --- | --- |
| `Prior Δ` | The displayed prior home-minus-away Elo difference; the official example is consistent with adding HFA before applying the Elo probability equation. This is an inference from the published equation and table, not a documented CSV schema. | Only as a checked diagnostic; store separate home and away ratings instead. |
| `HFA` | The home-field adjustment used for that country/day/match calculation. | Yes, only when its point-in-time semantics are proven. |
| `Elo %` | ClubElo’s displayed probability after applying the effective difference. | No: derived output, not an independent predictor. |
| `FT` | Full-time score. | No: target/outcome, not a predictor. |
| `Game Δ`, `Post-Game Δ`, `Elo +/-`, `New Elo`, `New Rank` | Match/update or post-match values. | No: post-match leakage. |

The official [Netherlands page](https://clubelo.com/NED) demonstrates that ClubElo publishes a Netherlands HFA and club Elo rankings. The official [data/source page](https://clubelo.com/Data) states that the rankings are based entirely on football results and lists Netherlands coverage from 1956-09-02, with Weltfussball.de and Football-Data.co.uk among the sources. This establishes historical Dutch coverage, not a downloadable per-match pre-match API guarantee.

### Reuse permission is positive but not a technical licence

ClubElo’s official [About page](https://clubelo.com/About) says its calculations, diagrams, and rankings may be used for further use, with a request to cite the author. That supports a cited analysis, but it does not specify:

- bulk-download or automated request limits;
- a stable API/CSV endpoint or response schema;
- permission to mirror raw responses;
- permission to publish a complete historical snapshot or derived row-level dataset; or
- a guarantee that historical values are immutable.

Treat “cite ClubElo” as necessary attribution, not as confirmation of all planned caching and publication rights.

## What is not proven

### Historical endpoint and schema

The commonly referenced routes are:

```text
http://api.clubelo.com/<YYYY-MM-DD>
http://api.clubelo.com/<club>
```

The route shape and the expected historical fields are described by the non-primary [`soccerdata` ClubElo adapter](https://github.com/probberechts/soccerdata/blob/master/soccerdata/clubelo.py), which parses `From`, `To`, `Rank`, `Club`, `Country`, `Level`, and `Elo`. That adapter is useful route-discovery evidence only; it is not ClubElo’s contract, licence, or availability guarantee.

On 2026-09-15, read-only probes from this environment produced:

| Request | Observation |
| --- | --- |
| `https://api.clubelo.com/2015-08-07` | Connection timeout after 15 seconds |
| `https://api.clubelo.com/Ajax` | Connection timeout after 15 seconds |
| `http://api.clubelo.com/2015-08-07` | HTTP 502, empty body, no `Retry-After` or rate-limit header |
| `http://api.clubelo.com/Ajax` | HTTP 502, empty body, no `Retry-After` or rate-limit header |
| `https://clubelo.com/Ajax` | HTTP 200; official HTML page reachable, with current calculation rows and embedded chart data |

The failure may be temporary, host-specific, or evidence of an endpoint migration. It is not evidence that the data is permanently unavailable. It is evidence that the route cannot be treated as a dependable importer today.

### Pre-match point-in-time semantics

The official calculation table proves that ClubElo can display a `Prior Δ` and an `HFA` alongside a completed match. It does **not** prove that a date snapshot returned by an API is:

- the last rating before that match;
- the first rating before that match;
- an end-of-day snapshot after all matches on that date; or
- a value tied to kick-off time.

This distinction matters for a Football-Data.co.uk row. If multiple fixtures share a date, an end-of-day rating can include the result being predicted or another same-day match. Using it would leak future information. `New Elo`, `Post-Game Δ`, and any after-match chart point are explicitly unusable for a pre-match predictor.

For 2015/16, missing `Time` removes the evidence needed to order same-day fixtures. A strict importer must therefore use a rating interval known to be valid before the calendar date, or fail the row. It must not fabricate midnight/local-time semantics from the date-only CSV.

### Rate limits and operational guarantees

No first-party ClubElo page checked publishes an API rate limit, fair-use number, retry policy, authentication requirement, uptime commitment, or versioned schema. The probes above also returned no rate-limit headers. Do not infer unlimited access from the public website or from the absence of a key.

## Minimum contract required before implementation

Obtain written confirmation from ClubElo, or a directly verifiable first-party API specification, for all of the following:

1. The current HTTPS endpoint and whether historical date/team retrieval is supported from 2015-08-08 onward.
2. The exact response schema and units for home Elo, away Elo, HFA, effective difference, and validity interval/timestamp.
3. Whether a date response is before all matches on that date, after all matches, or otherwise defined; and how same-day matches are ordered.
4. Whether 2015/16 date-only Football-Data rows may be joined using the previous-valid-day rating.
5. Request frequency, caching expectations, and handling of 4xx/5xx/timeouts.
6. Whether local raw caching, hashes/manifests, derived row-level data, and public publication are permitted with attribution.
7. Whether ClubElo may revise historical ratings and how a snapshot/version should be pinned.

After confirmation, run a one-season read-only spike. It must join every Football-Data row through an explicit team mapping, prove `ratingValidAt < matchTime` (or the documented date-only fallback), retain raw-response hashes and retrieval metadata, and fail rather than impute an Elo/HFA value when any required field or semantic check is missing.

## Recommended ticket outcome

Resolve issue #110 as **no-go pending provider confirmation**:

- Football-Data.co.uk is accepted as a practical historical match-row source from 2015/16 onward, with the 2015/16 no-`Time` limitation recorded.
- ClubElo remains the preferred conceptual Elo/HFA source because its official model and Netherlands coverage match the research need.
- Historical pre-match extraction is **not approved** until endpoint reachability, schema, date semantics, rate limits, and reuse/publication permission are confirmed.
- No fallback Elo values, same-day end-of-day snapshots, or post-match ClubElo fields may be substituted silently.

## Sources

- [ClubElo About](https://clubelo.com/About)
- [ClubElo System](https://clubelo.com/System)
- [ClubElo Data and sources](https://clubelo.com/Data)
- [ClubElo Netherlands](https://clubelo.com/NED)
- [ClubElo Ajax calculation page](https://clubelo.com/Ajax)
- [ClubElo current results page](https://clubelo.com/Results)
- [Football-Data.co.uk Netherlands seasons](https://football-data.co.uk/netherlandsm.php)
- [Football-Data.co.uk 2015/16 Eredivisie CSV](https://football-data.co.uk/mmz4281/1516/N1.csv)
- [Football-Data.co.uk 2021/22 Eredivisie CSV](https://football-data.co.uk/mmz4281/2122/N1.csv)
- [Football-Data.co.uk column notes](https://football-data.co.uk/notes.txt)
- [Football-Data.co.uk disclaimer](https://football-data.co.uk/disclaimer.php)
- [soccerdata ClubElo adapter (secondary route/schema evidence)](https://github.com/probberechts/soccerdata/blob/master/soccerdata/clubelo.py)
