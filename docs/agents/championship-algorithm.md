# Kampioensalgoritme

## Wanneer lezen

Lees dit document vóór je de kampioensberekening, wedstrijdkansen, simulatie-output, gegenereerde data of de uitleg daarover analyseert of wijzigt. De code is de autoriteit; dit document legt de huidige code vast en benoemt bekende afwijkingen en valkuilen.

## Bronvolgorde

Volg de gegevens door deze pipeline:

1. `scripts/fetch-data.ts` haalt actuele stand en resterende wedstrijden op.
2. `lib/transform.ts` maakt daar `Team[]` en `Fixture[]` van en kiest per wedstrijd een kansmodel.
3. `scripts/simulate.ts` leest `data/{league}/standings.json` en schrijft `data/{league}/simulation-results.json`.
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

Voor iedere fixture wordt precies één kansmodel gebruikt:

- Als een bij de thuis-uitcombinatie passende BZZOIRO-prediction bestaat, worden de BZZOIRO-percentages gebruikt.
- Anders worden de kansen berekend met het Poisson-model in `lib/poisson.ts`.

De interne `Fixture.source`-waarde `"api"` betekent in de huidige pipeline dat de percentages uit BZZOIRO kwamen. De naam is historisch en betekent niet dat de actuele fetch uit API-Football kwam. `lib/api-football.ts` levert hier alleen compatibele types; de actieve fetchroute gebruikt `lib/football-data-org.ts` en `lib/bzzoiro.ts`.

De Monte Carlo-sampling gebruikt `homeWinProb` en `drawProb`; de resterende kans wordt uitwinst. `awayWinProb` wordt opgeslagen en gebruikt in de verklarende `winAllProb`, maar niet als afzonderlijke drempel in `simulateMatch`.

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

Na iedere kalenderdatum worden de resterende wedstrijden van die datum verwerkt. Daarna wordt voor ieder team dat nog geen kampioen is gecontroleerd:

```text
concurrentMax = concurrentPoints + (totalRounds - concurrentPlayed) × 3
```

Het team is kampioen als voor iedere andere ploeg geldt:

```text
concurrentMax < teamPoints
```

Een gelijke stand betekent dus dat het team nog niet mathematisch kampioen is. Doelsaldo, onderlinge resultaten en andere tiebreakers worden in deze check niet gebruikt.

De standaardrun gebruikt 50.000 iteraties met een expliciete seed. De simulator gebruikt een lokale seeded pseudo-random generator; `Math.random()` wordt niet aangeroepen. De vaste fixturevolgorde is chronologisch met fixture-id als tie-breaker, zodat dezelfde snapshots, configuratie en seed dezelfde resultaten opleveren.

De prediction-run ontvangt een genormaliseerde competitiesnapshot en een geïnjecteerd `MatchProbabilityModel`. De kern importeert geen provider-DTO's. De huidige BZZOIRO/Poisson-kansen worden via een adapter aan dit model aangeboden. Iedere run legt `competitionId`, seizoen, modelversie, standings- en fixturesnapshot-id, seed en iteratie-aantal vast in `metadata`.

## Uitkomsten

Per team worden deze waarden berekend:

- `totalChampionshipProbability`: kampioenscenario’s gedeeld door het aantal iteraties;
- `neverChampionProbability` en `neverChampionCount`: scenario’s zonder clinch;
- `dateProbabilities`: kans dat de clinch in een ronde valt;
- `cumulativeProbability`: cumulatieve som van de ronde-kansen;
- `bestCaseDate` en `bestCaseRound`: vroegste datum waarop de best-case-staat kampioen is;
- `expectedDate`: de datum met de hoogste `dateProbabilities`-waarde;
- `positionProbabilities`: eindposities op basis van gesimuleerde punten.

De eindrangschikking sorteert eerst op gesimuleerde punten en gebruikt bij gelijkstand het oorspronkelijke doelsaldo (`goalsFor - goalsAgainst`). Er worden geen doelpunten per gesimuleerde wedstrijd gegenereerd.

`explanation.rivals[].winAllProb`, `gap` en `maxPoints` zijn verklarende UI-data. Ze bepalen de `totalChampionshipProbability` niet.

## Best case

Voor ieder team wordt afzonderlijk een deterministische best-case doorgerekend:

- het doelteam wint iedere resterende fixture en krijgt steeds `+3`;
- alle fixtures zonder het doelteam krijgen in deze analyse `0` punten voor beide betrokken teams;
- voor alle betrokken teams loopt `played` wel op, waardoor hun resterende maximum daalt;
- na iedere kalenderdatum wordt opnieuw de kampioenscheck uitgevoerd.

Dit is een analytisch scenario, geen geldige wedstrijdverdeling: een niet-doelteamwedstrijd kan in deze berekening beide teams op nul punten houden.

## Bekende implementatievalkuilen

1. De huidige code controleert de beginsituatie niet. `isChampion` wordt pas na de eerste resterende kalenderdatum aangeroepen. Een team dat vóór het resterende programma al mathematisch kampioen is, krijgt daardoor toch een toekomstige clinchdatum.
2. `dateProbabilities` telt clinches op alle datums binnen een ronde, maar labelt de rij met de datum van de wedstrijd van het doelteam. Bij gespreide speelrondes kan de weergegeven datum dus verschillen van de feitelijke clinchdatum.
3. Gebruik voor nieuwe uitleg de actuele bronnen `football-data.org`, BZZOIRO en Poisson. Verwijder verwijzingen naar API-Football als actuele predictionbron, tenzij de fetchpipeline eerst wordt gewijzigd.
4. Als `data/{league}/standings.json` ontbreekt, gebruikt `scripts/simulate.ts` voor de Eredivisie de hardcoded fallback in `config/fallback/eredivisie.ts`. Die fallback bevat slechts zes teams en handmatige Poisson-kansen.

## Wijzigingsprocedure

Bij een wijziging aan dit domein:

1. Traceer eerst de gewijzigde invoer van bron naar `Fixture`, simulatie en UI-output; de stap is klaar als ieder gewijzigd veld een bron en consument heeft.
2. Werk de relevante tests in `__tests__/simulation.test.ts` bij voor de nieuwe logische paden; de stap is klaar als best case, zekerheid-winst, zekerheid-verlies en nul/boundary-gevallen zijn afgedekt waar relevant.
3. Werk deze referentie en eventuele gebruikersuitleg bij op basis van de code; de stap is klaar als er geen documentatieclaim over bronnen, scoreverwerking of datumpresentatie achterblijft die de code tegenspreekt.
4. Voer voor codewijzigingen `npm run lint`, `npm run test:run` en waar vereist `npm run build` uit. Documentatie-only wijzigingen hebben volgens `AGENTS.md` alleen inhouds-, opmaak- en linkcontrole nodig.
