# PSV Kampioen — Technische Documentatie

## Architectuur

De site is 100% statisch gegenereerd met Next.js. Er zijn geen client-side API-calls of runtime data-fetches.

**Pipeline:**

```
scripts/fetch-data.ts → data/eredivisie.json
                              ↓
scripts/simulate.ts   → data/simulation-result.json
                              ↓
app/page.tsx (build)  → statische HTML
```

`page.tsx` is een Server Component die `data/simulation-result.json` leest met `fs.readFileSync` tijdens `next build`.

## Data scope

- **Alle 18 Eredivisie-teams** worden opgehaald via API-Football (standings endpoint)
- **Alle 9 wedstrijden per ronde** worden gesimuleerd (niet alleen top-6 onderling)
- **UI toont top 6** — de `StandingsTable` component sorteert op punten en toont `.slice(0, 6)`
- Standaard fallback data in `lib/data.ts` bevat alleen de top 6 teams met onderlinge wedstrijden

## Prediction modellen

Elke fixture heeft een `source` veld dat aangeeft welk model de win/draw/loss kansen heeft bepaald:

| Source | Wanneer | Bron |
|--------|---------|------|
| `"api"` | API-Football prediction beschikbaar (typisch ≤14 dagen voor wedstrijd) | `/predictions` endpoint |
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
- Deterministisch per run (geen seed), herberekent bij elke `npm run simulate`

### Wedstrijdsimulatie

Per wedstrijd wordt een random getal `r ∈ [0, 1)` getrokken:

```
if r < homeWinProb        → thuiswinst (+3 punten thuis)
if r < homeWinProb + draw → gelijkspel (+1 punt elk)
anders                    → uitwinst (+3 punten uit)
```

### Kampioenschap check

Na elke gespeelde ronde wordt gecontroleerd of PSV wiskundig kampioen is:

```
isChampion(psv) = voor elke andere team:
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
| `fetch-data` | `npx tsx scripts/fetch-data.ts` | Haalt standings + fixtures + predictions op via API-Football → `data/eredivisie.json` |
| `simulate` | `npx tsx scripts/simulate.ts` | Draait Monte Carlo simulatie → `data/simulation-result.json` |
| `update-data` | `fetch-data` + `simulate` | Volledige data-refresh |
| `build` | `prebuild` (simulate) + `next build` | Bouwt statische site met verse simulatieresultaten |

### API-Football

- Free tier: 100 requests/dag
- League ID: 88 (Eredivisie), Season: 2024
- Predictions zijn best-effort (parallel via `Promise.allSettled`)
- API key in `.env.local` als `API_FOOTBALL_KEY`

## Data bestanden

| Bestand | Inhoud |
|---------|--------|
| `data/eredivisie.json` | `{ teams, remainingFixtures, fetchedAt }` — live data van API-Football |
| `data/simulation-result.json` | `{ result, teams, fixtures, fetchedAt, simulatedAt }` — MC resultaten |
| `lib/data.ts` | Statische fallback data (top 6, ronde 28) |
