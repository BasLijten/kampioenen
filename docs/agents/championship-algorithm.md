# Kampioensalgoritme

## Wanneer lezen

Lees dit document vóór je de kampioensberekening, wedstrijdkansen, simulatie-output, gegenereerde data of de uitleg daarover analyseert of wijzigt. De code is de autoriteit; dit document legt de huidige code vast en benoemt bekende afwijkingen en valkuilen.

## Bronvolgorde

Volg de gegevens door deze pipeline:

1. `scripts/fetch-data.ts` haalt actuele stand en resterende wedstrijden op.
2. `scripts/fetch-data.ts` importeert voor dezelfde run een complete ClubElo-snapshot via de goedgekeurde mapping.
3. `scripts/simulate.ts` leest `data/{league}/standings.json`, de mapping, kalibratie en lokale ClubElo-snapshot en schrijft `data/{league}/simulation-results.json`.
4. `app/page.tsx` leest `simulation-results.json` tijdens de build en rendert statische HTML.

De brondata in `data/` is een gegenereerde snapshot, geen nieuwe algoritmische bron. Controleer bij twijfel altijd `lib/simulation.ts`, `lib/poisson.ts`, `lib/transform.ts` en de fetchscripts.

## Invoer en bronnen

### Stand en programma

De actuele standings en resterende wedstrijden komen uit `football-data.org`:

- standings-endpoint: punten, aantal gespeelde wedstrijden, W/G/V, doelpunten voor en tegen;
- matches-endpoint: wedstrijden met status `SCHEDULED` of `TIMED`;
- competitiecode en `totalRounds` komen uit `config/leagues.ts`.

Voor de Eredivisie is `totalRounds = 34`.

### Wedstrijdkansen

In productie wordt precies één kansmodel gebruikt: `elo-monte-carlo-v1`. De modelinput is de ClubElo-rating uit de lokale snapshot en de per-competitie kalibratie, met de general prior als fallback. ClubElo’s eigen toekomstige 1/X/2-voorspellingen worden niet gebruikt. De interne `Fixture.source`-waarde `"clubelo"` markeert deze output. `lib/poisson.ts` blijft beschikbaar voor legacy- en tussenopslagpaden, maar bepaalt geen production prediction.

De Monte Carlo-sampling gebruikt een seeded generator en de drie opgeslagen kansen. Na de W/D/A-keuze wordt conditioneel een scorelijn uit de fixture-goalverdelingen (of een Poisson-verdeling op expected goals) getrokken. Die scorelijn kan de eerder gekozen uitslag niet wijzigen; zij is bedoeld voor score-tiebreakers.

### Poisson-fallback

Het Poisson-model gebruikt per team `goalsFor`, `goalsAgainst` en `played`:

```text
totalMatches = som(played) / 2
leagueAvg    = totaal_doelpunten / totalMatches / 2
attack    = (goalsFor / played) / leagueAvg
defense   = (goalsAgainst / played) / leagueAvg
```

De eerste formule is algebraïsch gelijk aan totaal aantal doelpunten gedeeld door het totaal aantal gespeelde teamwedstrijden.

Met `HOME_ADVANTAGE = 1.35` worden de verwachte doelpunten:

```text
lambda thuis = attack(thuis) × defense(uit) × leagueAvg × 1.35
lambda uit   = attack(uit)   × defense(thuis) × leagueAvg
```

De kansenmatrix bevat scorelijnen van 0-0 tot en met 8-8. De onafhankelijke Poisson-kansen worden opgeteld tot thuiswinst, gelijkspel en uitwinst en daarna genormaliseerd.

De velden `won`, `drawn` en `lost` worden wel uit de standings gekopieerd en in de stand getoond, maar bepalen de kampioenscheck of het Poisson-model niet rechtstreeks.

## Kampioenscheck

De puntenverwerking is de standaard 3/1/0-regel:

- thuiswinst: thuisteam `+3`;
- gelijkspel: beide teams `+1`;
- uitwinst: uitteam `+3`;
- beide teams krijgen na iedere fixture `played +1`.

Fixtures worden stabiel gesorteerd op werkelijke kalenderdatum en daarna op fixture-id. Na alle wedstrijden van iedere kalenderdatum wordt voor ieder team dat nog geen kampioen is gecontroleerd:

```text
concurrentMax = concurrentPoints + (aantal daadwerkelijk resterende fixtures) × pointsForWin
```

Het team is kampioen als voor iedere andere ploeg geldt:

```text
concurrentMax < teamPoints
```

Een gelijke stand betekent dus dat het team nog niet mathematisch kampioen is, tenzij de actuele en volledige geconfigureerde tiebreakers al een strikte volgorde vastleggen. De competitieconfiguratie bepaalt de versie, punten voor winst/gelijkspel/verlies en geordende tiebreakers. Een vereiste maar incomplete head-to-head-dataset blokkeert de run vóór simulatie.

De standaard production run gebruikt 100.000 iteraties. De run gebruikt seed `1` en accepteert `SIMULATION_ITERATIONS` en `SIMULATION_SEED`, zodat dezelfde snapshots, rules-version, fixturevolgorde en seed dezelfde output opleveren.

## Uitkomsten

Per team worden deze waarden berekend:

- `totalChampionshipProbability`: kampioenscenario’s gedeeld door het aantal iteraties;
- `neverChampionProbability` en `neverChampionCount`: scenario’s zonder clinch;
- `dateProbabilities`: kans dat de clinch in een ronde valt;
- `cumulativeProbability`: cumulatieve som van de ronde-kansen;
- `bestCaseDate` en `bestCaseRound`: vroegste datum waarop de best-case-staat kampioen is;
- `expectedDate`: de datum met de hoogste `dateProbabilities`-waarde;
- `positionProbabilities`: eindposities op basis van gesimuleerde punten.

De huidige simulator publiceert daarnaast `noClinchProbability`, `tieProbability`, `simulatedGoalsFor`, `simulatedGoalsAgainst` en `simulatedGoalDifference`. `totalChampionshipProbability` volgt de unieke kampioen uit de geconfigureerde eindrangschikking; `dateProbabilities` bevat de feitelijke kalenderdatum en het administratieve ronde-label.

De eindrangschikking sorteert eerst op punten en daarna volgens de geconfigureerde tiebreakers. Gelijke groepen blijven gelijk wanneer `requireUniqueRanking` niet is ingesteld. Een configuratie die een unieke volgorde vereist gebruikt de seeded generator voor de resterende gelijkstand en bewaart seed, rules-version en fixturevolgorde in de output. De simulator houdt `goalsFor`, `goalsAgainst` en `goalDifference` per gesimuleerde eindstand bij.

`explanation.rivals[].winAllProb`, `gap` en `maxPoints` zijn verklarende UI-data. Ze bepalen de `totalChampionshipProbability` niet.

## Best case

Voor ieder team wordt afzonderlijk een deterministische best-case doorgerekend:

- het doelteam wint iedere resterende fixture en krijgt steeds `+3`;
- alle fixtures zonder het doelteam krijgen in deze analyse `0` punten voor beide betrokken teams;
- voor alle betrokken teams loopt `played` wel op, waardoor hun resterende maximum daalt;
- na iedere kalenderdatum wordt opnieuw de kampioenscheck uitgevoerd.

Dit is een analytisch scenario, geen geldige wedstrijdverdeling: een niet-doelteamwedstrijd kan in deze berekening beide teams op nul punten houden.

## Bekende implementatievalkuilen

1. De best-case-berekening is analytisch: fixtures zonder het doelteam leveren geen punten op, maar verhogen wel `played`.
2. `dateProbabilities` gebruikt de feitelijke kalenderdatum waarop na de volledige datumgroep de clinch vaststaat. `round` blijft een administratief rapportagelabel.
3. Gebruik voor nieuwe uitleg de actuele bronnen `football-data.org`, ClubElo en de opgeslagen kalibratie. Verwijder verwijzingen naar BZZOIRO/API-Football als actuele predictionbron.
4. De production pipeline gebruikt geen hardcoded fallback wanneer een ClubElo-mapping, kalibratie of snapshot ontbreekt; de run faalt expliciet vóór simulatie.

## Wijzigingsprocedure

Bij een wijziging aan dit domein:

1. Traceer eerst de gewijzigde invoer van bron naar `Fixture`, simulatie en UI-output; de stap is klaar als ieder gewijzigd veld een bron en consument heeft.
2. Werk de relevante tests in `__tests__/simulation.test.ts` bij voor de nieuwe logische paden; de stap is klaar als best case, zekerheid-winst, zekerheid-verlies, score-tiebreakers, head-to-head, uitgestelde/same-date fixtures en nul/boundary-gevallen zijn afgedekt waar relevant.
3. Werk deze referentie en eventuele gebruikersuitleg bij op basis van de code; de stap is klaar als er geen documentatieclaim over bronnen, scoreverwerking of datumpresentatie achterblijft die de code tegenspreekt.
4. Voer voor codewijzigingen `npm run lint`, `npm run test:run` en waar vereist `npm run build` uit. Documentatie-only wijzigingen hebben volgens `AGENTS.md` alleen inhouds-, opmaak- en linkcontrole nodig.
