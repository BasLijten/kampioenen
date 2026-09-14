# Kampioenen — Technische Documentatie

De actuele bron voor de kampioenslogica is [`docs/agents/championship-algorithm.md`](agents/championship-algorithm.md). Die documentatie is agentgericht en verwijst naar de code als autoriteit.

Het voorgestelde opvolgmodel en de vergelijking met de huidige baseline staan in [`docs/agents/championship-prediction-model.md`](agents/championship-prediction-model.md). Dit document beschrijft doelarchitectuur en migratievereisten; het betekent niet dat de huidige code al ClubElo gebruikt.

## Architectuur

De site is 100% statisch gegenereerd met Next.js. Er zijn geen client-side API-calls of runtime data-fetches.

**Pipeline:**

```
scripts/fetch-data.ts → data/eredivisie/standings.json
                              ↓
scripts/fetch-data.ts → data/eredivisie/clubelo-snapshots/*
                              ↓
scripts/simulate.ts   → data/eredivisie/simulation-results.json
                              ↓
app/page.tsx (build)  → statische HTML
```

`page.tsx` is een Server Component die `data/eredivisie/simulation-results.json` leest met `fs.readFileSync` tijdens `next build`.

## Data scope

- **Alle 18 Eredivisie-teams** worden opgehaald via football-data.org (standings endpoint)
- **Alle door football-data.org teruggegeven resterende wedstrijden** worden gesimuleerd (niet alleen top-6 onderling)
- De actuele pagina gebruikt alle teams voor de simulatie en de eindpositievoorspelling; `StandingsTable` is geen onderdeel van de huidige `app/page.tsx`-rendering
- Fallbackdata in `config/fallback/eredivisie.ts` bevat alleen zes teams met handmatige kansen

## Production prediction model

Elke production fixture heeft `source: "clubelo"`. Het model gebruikt een goedgekeurde mapping, één lokale ClubElo-snapshot en een per-competitie 50-Elo-bucketkalibratie met general prior:

| Input | Productiebron |
|--------|---------|
| Teamsterkte | Lokale ClubElo-snapshot |
| W/D/A | Per-competitie kalibratie, general prior als fallback |
| Competitiestand en fixtures | football-data.org snapshot |

Per fixture wordt **precies een** model gebruikt — ze worden nooit gecombineerd.

## Poisson-model

Het Poisson-model berekent wedstrijdkansen uit de huidige standings-data.

### Team Strength

Voor elk team worden aanvals- en verdedigingsratings berekend:

```
leagueAvg = totaal_doelpunten / totaal_wedstrijden / 2

attack(team)  = (goalsFor / played) / leagueAvg
defense(team) = (goalsAgainst / played) / leagueAvg
```

Een `attack > 1` betekent dat het team meer scoort dan gemiddeld. Een `defense < 1` betekent dat het team minder tegendoelpunten incasseert dan gemiddeld.

### Expected Goals

```
HOME_ADVANTAGE = 1.35

λ_home = attack(home) × defense(away) × leagueAvg × HOME_ADVANTAGE
λ_away = attack(away) × defense(home) × leagueAvg
```

### Kansberekening

Met de Poisson verdeling P(X = k) = (λ^k × e^-λ) / k! wordt voor elke scorelijn (0-0 t/m 8-8) de kans berekend:

```
P(home_goals = h, away_goals = a) = Poisson(λ_home, h) × Poisson(λ_away, a)
```

Vervolgens:
- `homeWinProb` = som van alle P waar h > a
- `drawProb` = som van alle P waar h == a
- `awayWinProb` = som van alle P waar h < a

Genormaliseerd zodat de som exact 1.0 is.

### Constanten

| Constante | Waarde | Toelichting |
|-----------|--------|-------------|
| `HOME_ADVANTAGE` | 1.35 | Thuisvoordeel multiplier op expected goals |
| `MAX_GOALS` | 8 | Maximum doelpunten per team in kansenmatrix |

### Voorbeeld

PSV (84 GF, 28 GA, 28 gespeeld) vs Utrecht (51 GF, 45 GA, 28 gespeeld), leagueAvg ≈ 1.50:

```
PSV attack  = (84/28) / 1.50 = 2.00
PSV defense = (28/28) / 1.50 = 0.67
UTR attack  = (51/28) / 1.50 = 1.21
UTR defense = (45/28) / 1.50 = 1.07

λ_home = 2.00 × 1.07 × 1.50 × 1.35 = 4.33
λ_away = 1.21 × 0.67 × 1.50 = 1.22
```

## Monte Carlo simulatie

### Parameters

- **100.000 iteraties** per production simulatierun
- Seeded per run; dezelfde seed en fixturevolgorde leveren reproduceerbare resultaten op

### Wedstrijdsimulatie

Per wedstrijd wordt een random getal `r ∈ [0, 1)` getrokken:

```
if r < homeWinProb        → thuiswinst (+3 punten thuis)
if r < homeWinProb + draw → gelijkspel (+1 punt elk)
anders                    → uitwinst (+3 punten uit)
```

Daarna wordt conditioneel een scorelijn getrokken voor goals-for, goals-against en doelsaldo. Deze scorelijn kan de gekozen W/D/A-uitkomst niet veranderen en wordt gebruikt voor de geconfigureerde officiële tiebreakers.

### Kampioenschap check

Na elke kalenderdatum wordt gecontroleerd of het doelteam wiskundig kampioen is:

```
isChampion(team) = voor elke andere team:
maxPunten(team) = huidigePunten + (daadwerkelijk resterende fixtures) × 3
  maxPunten(team) < psvPunten
```

### Output

- `totalChampionshipProbability` — fractie iteraties waarin PSV kampioen wordt
- `dateProbabilities[]` — per speelronde: kans dat PSV precies die ronde kampioen wordt
- `bestCaseDate/Round` — vroegst mogelijke kampioenschap (PSV wint alles, rivalen verliezen)
- `neverChampionProbability` — fractie iteraties waarin PSV niet vóór het einde clincht
- `noClinchProbability` — expliciete no-clinch-kans naast de uiteindelijke kampioenschapskans

## npm scripts

| Script | Commando | Beschrijving |
|--------|----------|-------------|
| `fetch-data` | `npx tsx scripts/fetch-data.ts` | Haalt standings en wedstrijden van football-data.org op en importeert een complete ClubElo-snapshot via de goedgekeurde mapping |
| `simulate` | `npx tsx scripts/simulate.ts` | Draait Monte Carlo simulatie → `data/eredivisie/simulation-results.json` |
| `update-data` | `fetch-data` + `simulate` | Volledige data-refresh |
| `build` | `prebuild` (simulate) + `next build` | Bouwt statische site met verse simulatieresultaten |

### Data APIs

- football-data.org: standings endpoint (`FOOTBALL_DATA_ORG_KEY` in `.env.local`)
- ClubElo: team strength pages, imported into immutable local snapshots
- League: Eredivisie (football-data.org competition code `DED`)
- Production prediction runs fail closed when required mappings, calibration or snapshots are missing

## Data bestanden

| Bestand | Inhoud |
|---------|--------|
| `data/eredivisie/standings.json` | `{ teams, remainingFixtures, fetchedAt, standingsSnapshotId, fixturesSnapshotId }` — competitiesnapshot van football-data.org |
| `data/eredivisie/clubelo-mapping.json` | Goedgekeurde, versioneerde current mappings |
| `data/eredivisie/clubelo-calibration.json` | Versioneerde per-competitie kalibratie en general prior |
| `data/eredivisie/clubelo-snapshots/` | Immutable ClubElo snapshots per competitie, seizoen en bronronde |
| `data/eredivisie/simulation-results.json` | `{ clubResults, teams, fixtures, metadata, fetchedAt, simulatedAt }` — seeded MC-resultaten |
| `config/fallback/eredivisie.ts` | Hardcoded fallbackdata voor de Eredivisie |
