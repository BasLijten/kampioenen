# Kampioenen — Technische Documentatie

De actuele bron voor de kampioenslogica is [`docs/agents/championship-algorithm.md`](agents/championship-algorithm.md). Die documentatie is agentgericht en verwijst naar de code als autoriteit.

Het voorgestelde opvolgmodel en de vergelijking met de huidige baseline staan in [`docs/agents/championship-prediction-model.md`](agents/championship-prediction-model.md). Dit document beschrijft doelarchitectuur en migratievereisten; het betekent niet dat de huidige code al ClubElo gebruikt.

## Architectuur

De site is 100% statisch gegenereerd met Next.js. Er zijn geen client-side API-calls of runtime data-fetches.

**Pipeline:**

```
scripts/fetch-data.ts → data/eredivisie/standings.json
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

## Prediction modellen

Elke fixture heeft een `source` veld dat aangeeft welk model de win/draw/loss kansen heeft bepaald:

| Interne source | Wanneer | Actuele bron |
|--------|---------|------|
| `"api"` | Een passende prediction beschikbaar | BZZOIRO `/predictions/?upcoming=true` |
| `"poisson"` | Geen API prediction beschikbaar, of bij fallback data | Berekend uit standings |

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

- **50.000 iteraties** per simulatierun
- Deterministische seeded Monte Carlo-run; dezelfde snapshot en seed leveren dezelfde resultaten

### Wedstrijdsimulatie

Per wedstrijd wordt een random getal `r ∈ [0, 1)` getrokken:

```
if r < homeWinProb        → thuiswinst (+3 punten thuis)
if r < homeWinProb + draw → gelijkspel (+1 punt elk)
anders                    → uitwinst (+3 punten uit)
```

### Kampioenschap check

Na elke kalenderdatum wordt gecontroleerd of het doelteam wiskundig kampioen is:

```
isChampion(team) = voor elke andere team:
  maxPunten(team) = huidigePunten + (34 - gespeeld) × 3
  maxPunten(team) < psvPunten
```

### Output

- `totalChampionshipProbability` — fractie iteraties waarin PSV kampioen wordt
- `dateProbabilities[]` — per speelronde: kans dat PSV precies die ronde kampioen wordt
- `bestCaseDate/Round` — vroegst mogelijke kampioenschap (PSV wint alles, rivalen verliezen)
- `neverChampionProbability` — fractie iteraties waarin PSV niet kampioen wordt

## npm scripts

| Script | Commando | Beschrijving |
|--------|----------|-------------|
| `fetch-data` | `npx tsx scripts/fetch-data.ts` | Haalt standings en wedstrijden (football-data.org) plus predictions (BZZOIRO) op → `data/eredivisie/standings.json` |
| `simulate` | `npx tsx scripts/simulate.ts` | Draait Monte Carlo simulatie → `data/eredivisie/simulation-results.json` |
| `update-data` | `fetch-data` + `simulate` | Volledige data-refresh |
| `build` | `prebuild` (simulate) + `next build` | Bouwt statische site met verse simulatieresultaten |

### Data APIs

- football-data.org: standings endpoint (`FOOTBALL_DATA_ORG_KEY` in `.env.local`)
- BZZOIRO: predictions endpoint (`BZZOIRO_TOKEN` in `.env.local`)
- League filter: Eredivisie (API league ID 88)
- Predictions blijven best-effort (Poisson fallback als ze ontbreken)

## Data bestanden

| Bestand | Inhoud |
|---------|--------|
| `data/eredivisie/standings.json` | `{ teams, remainingFixtures, fetchedAt }` — gegenereerde snapshot van football-data.org + wedstrijdkansen |
| `data/eredivisie/simulation-results.json` | `{ clubResults, teams, fixtures, fetchedAt, runMetadata, simulatedAt }` — MC-resultaten en runmetadata |
| `config/fallback/eredivisie.ts` | Hardcoded fallbackdata voor de Eredivisie |
