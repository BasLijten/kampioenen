# Voorspelmodel kampioenschap

## Wanneer lezen

Lees dit document bij ontwerp, review of migratie van het voorspelmodel: ClubElo, wedstrijdkansen, providers, simulatieparameters, kampioens- of positie-uitkomsten, modelversies en backtesting. Het beschrijft het voorgestelde doelmodel; het beschrijft niet wat de huidige productiecode al doet.

De huidige implementatie blijft vastgelegd in [`championship-algorithm.md`](championship-algorithm.md). Bij een verschil is dat document de autoriteit voor bestaand gedrag en is dit document de autoriteit voor de voorgestelde doelarchitectuur. De vergelijking hieronder gebruikt de huidige documentatie zoals toegevoegd in commit `12f1e19`.

## Besluit in één zin

Voorspel de kampioen niet rechtstreeks: combineer een snapshot van de competitiestand en het resterende programma met ClubElo-teamsterkte, vertaal iedere wedstrijd naar gekalibreerde thuis-/gelijkspel-/uitkansen en simuleer vervolgens de rest van het seizoen.

```text
competition snapshot + ClubElo snapshot
                    ↓
          calibrated match probabilities
                    ↓
             seeded Monte Carlo
                    ↓
 champion · final positions · clinch timing · qualification/relegation
```

## Status en grenzen

- Dit is de voorgestelde baseline `elo-monte-carlo-v1`; de huidige code implementeert deze nog niet.
- V1 gebruikt ClubElo als sterktebron, maar geen xG, spelersbeschikbaarheid, opstellingen, handmatig vormgewicht, machine learning of marktdata.
- De simulator kent alleen interne domeinmodellen. DTO’s, identifiers, HTML/CSV-vormen en licentie-details van externe providers blijven in importers.
- Iedere extra voorspellende input wordt pas productie-input na historische backtesting die aantoonbare verbetering laat zien.

## Domeinbegrippen

Gebruik deze scheiding consequent:

- **Competitiesnapshot**: stand, teams, afgeronde wedstrijden en resterende fixtures op één peilmoment.
- **Sterktesnapshot**: ClubElo-rating per team, bron en meetmoment.
- **Wedstrijdmodel**: functie die één fixture omzet in drie kansen die samen 1 vormen.
- **Simulatierun**: één berekening met beide snapshots, modelversie, iteratie-aantal en random seed.
- **Clinch**: het eerste moment waarop de uiteindelijke kampioen volgens de competitieregels niet meer kan worden ingehaald.
- **Kampioenschapskans**: de fractie simulaties waarin een team na toepassing van de volledige rangschikkingsregels eindigt als kampioen. Dit is niet hetzelfde als de kans om vóór de laatste speeldag te clinchen.

## Gegevensbronnen en providergrenzen

### ClubElo: teamsterkte

Gebruik [ClubElo](https://clubelo.com/) als primaire bron voor teamsterkte. Importeer periodiek een lokale snapshot, bij voorkeur dagelijks of na een afgeronde competitieronde. Gebruik de lokale snapshot tijdens voorspellingen; een webrequest mag geen directe afhankelijkheid van ClubElo hebben.

Bewaar ten minste:

```typescript
interface TeamStrength {
  teamId: string;
  elo: number;
  source: "clubelo";
  measuredAt: Date;
}

interface TeamStrengthProvider {
  getTeamStrengths(): Promise<TeamStrength[]>;
}
```

Vermeld op de website: `Team strength data based on ClubElo.com.` Controleer de actuele gebruiksvoorwaarden vóór publicatie of commercieel gebruik.

### Competitieprovider: toestand van de competitie

Gebruik aanvankelijk `football-data.org` voor standings, afgeronde wedstrijden, resterende fixtures, scores en datums. Behandel deze provider uitsluitend als bron van competitiestaat. De prediction engine kent geen football-data.org-model.

De providergrens is:

```typescript
interface CompetitionDataProvider {
  getStandings(): Promise<Standing[]>;
  getCompletedMatches(): Promise<Match[]>;
  getRemainingMatches(): Promise<Match[]>;
}
```

Vertaal providerdata vóór gebruik naar interne `Team`, `Match` en `Standing`-modellen. Daardoor kan de fixtureprovider worden vervangen zonder wijzigingen aan wedstrijdmodel, simulator of competitieregels.

### Bewuste bronkeuzes

- FotMob is geen backendbron zolang geautomatiseerde retrieval en herdistributie niet expliciet is toegestaan.
- Bookmakerdata is een toekomstige, optionele `MarketProbabilityProvider`, geen V1-afhankelijkheid.
- xG is een toekomstige provider of model achter een eigen abstractie, geen V1-afhankelijkheid.
- Elke externe bron moet een toegestane API, expliciete hergebruiklicentie of schriftelijke toestemming hebben. Publieke zichtbaarheid is geen hergebruiklicentie.

## Interne modellen

De kern kent geen externe DTO’s:

```typescript
type TeamId = string;

interface Team {
  id: TeamId;
  name: string;
}

interface Match {
  id: string;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  date: Date;
  homeGoals?: number;
  awayGoals?: number;
  status: "scheduled" | "finished" | "postponed";
}

interface Standing {
  teamId: TeamId;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

interface MatchProbability {
  home: number;
  draw: number;
  away: number;
}

interface MatchProbabilityModel {
  predict(match: Match, strengths: TeamStrength[]): MatchProbability;
}
```

De engine valideert dat alle teams in standings, fixtures en ratings naar elkaar verwijzen en dat `home + draw + away = 1` binnen de gekozen afronding. Een fixture met ontbrekende sterkte of ongeldige kansen wordt niet stilzwijgend gesimuleerd; de run meldt de ontbrekende invoer.

## Wedstrijdmodel V1

### Elo-differentie

Bereken per fixture:

```text
effectiveHomeRating = homeElo + homeAdvantage
ratingDifference    = effectiveHomeRating - awayElo
```

Een conventionele Elo-formule kan de binaire verwachte score leveren:

```text
expectedHome = 1 / (1 + 10 ^ (-ratingDifference / 400))
```

Gebruik deze waarde niet rechtstreeks als drie-weg-uitkomst. Voetbal vereist een afzonderlijke draw-kans.

### Gekalibreerde drie-wegkansen

V1 gebruikt een transparante historische kalibratie van `ratingDifference` naar `home`, `draw` en `away`. De eerste implementatie mag buckets gebruiken, bijvoorbeeld intervallen van 50 Elo-punten; latere implementaties mogen logistic regression, multinomial regression, splines of isotonic calibration gebruiken als backtesting dat rechtvaardigt.

De kalibratiedataset bevat per historische wedstrijd de Elo-rating vóór de wedstrijd, thuisvoordeel en werkelijke uitkomst. Huidige ClubElo-ratings achteraf op historische wedstrijden toepassen is geen geldige pre-match kalibratie.

De voorbeeldpercentages uit het voorstel zijn illustratief en vormen geen productieconfiguratie. De gekozen mapping is pas geldig wanneer:

1. iedere bucket of fit een herleidbare historische dataset heeft;
2. de drie kansen niet-negatief zijn en optellen tot 1;
3. Brier score, log loss en calibration op een afgescheiden evaluatieset zijn vastgelegd.

Gebruik in V1 één expliciet gekozen model voor alle fixtures. Een ClubElo-afgeleide mapping en een marktmodel worden niet ongemerkt gemengd.

## Monte Carlo-simulatie

Gebruik 100.000 iteraties als eerste productiebenchmark, configureerbaar voor tests en backtests. Gebruik een seeded pseudo-random generator en bewaar de seed in de run; `Math.random()` voldoet niet aan de reproduceerbaarheidseis.

Per iteratie:

1. kopieer de beginsnapshot van de stand;
2. loop door alle resterende fixtures in stabiele chronologische volgorde;
3. sample precies één uitkomst uit `home`, `draw`, `away`;
4. pas 3/1/0-punten en gespeelde wedstrijden toe;
5. rangschik de eindstand via `CompetitionRules`;
6. registreer kampioen, eindpositie en eventuele kwalificatie-/degradatiestatus;
7. registreer voor iedere ploeg het eerste clinchmoment zodra dat volgens de regels vaststaat.

De run is klaar wanneer het aantal geregistreerde eindstanden gelijk is aan `simulationCount`, iedere simulatie exact één eindrangschikking heeft en de som van elke positie- en kampioenschapsverdeling 1 is. Een onvoldoende gemodelleerde tiebreak is een invoerfout die vóór publicatie wordt opgelost, geen stilzwijgend onbeslist resultaat.

## Competitieregels en clinch

Houd punten, rangschikking, tiebreakers en doelstellingen achter een competitiecontract:

```typescript
interface CompetitionRules {
  pointsForWin: number;
  pointsForDraw: number;
  compareTeams(a: SimulatedStanding, b: SimulatedStanding): number;
  isChampionClinched(
    leader: SimulatedStanding,
    competitors: SimulatedStanding[],
    remainingFixtures: Match[]
  ): boolean;
}
```

Voor de Eredivisie worden de officiële tiebreak- en eindrangschikkingsregels expliciet in dit contract vastgelegd. Een generieke `points`-vergelijking is onvoldoende wanneer gelijke punten nog mogelijk zijn.

Behandel uitgestelde wedstrijden als fixtures, niet als rondevolgorde:

- sorteer simulatie-events op werkelijke datum en gebruik fixture-id als stabiele tie-breaker;
- controleer een clinch na alle wedstrijden van dezelfde kalenderdatum;
- gebruik `round` als label voor rapportage, niet als aanname over chronologische volgorde;
- bereken voor iedere concurrent het maximum uit diens daadwerkelijk resterende fixtures;
- geef zowel de feitelijke `clinchDate` als het administratieve `clinchMatchday` door.

De eenvoudige noodzakelijke puntencheck is:

```text
competitorMax = competitorPoints + 3 × competitorRemainingFixtures
```

Als `leader.points > competitorMax` staat clinchen vast. Bij gelijke punten beslist `CompetitionRules`; de simulator neemt geen generieke aanname over doelsaldo, onderlinge resultaten of andere tiebreakers.

## Uitkomsten

De engine levert per team minimaal:

- kans om de competitie te winnen;
- kans op iedere eindpositie (`positionProbability[teamId][position]`);
- meest waarschijnlijke eindpositie en verwachte positie;
- kans op relevante kwalificatie-, play-off- en degradatie-uitkomsten;
- kans om op iedere resterende speeldag te clinchen;
- meest waarschijnlijke clinch-speeldag en datum;
- vroegst mogelijke clinch in een afzonderlijk deterministisch best-case-scenario;
- kans op geen clinch vóór het einde, apart van de uiteindelijke kampioenschapskans.

Een clinchverdeling telt alleen het eerste clinchmoment per simulatie. De som van alle clinchmomenten plus `noClinch` is 1. De UI-term “verwachte datum” wordt vermeden als de implementatie feitelijk de modus (meest waarschijnlijke datum) rapporteert.

## Reproduceerbaarheid en modelversies

Sla voor iedere gepubliceerde run op:

```typescript
interface PredictionRun {
  id: string;
  competitionId: string;
  season: string;
  createdAt: Date;
  simulationCount: number;
  modelVersion: string;
  standingsSnapshotId: string;
  fixturesSnapshotId: string;
  eloSnapshotId: string;
  randomSeed: number;
}
```

Voorbeeld: `elo-monte-carlo-v1`. Een prediction is reproduceerbaar wanneer dezelfde snapshots, modelversie, competitieconfiguratie, iteratievolgorde en seed opnieuw dezelfde uitkomst opleveren.

## Vergelijking met het huidige model

| Onderwerp | Huidige baseline (`12f1e19`) | Voorgesteld `elo-monte-carlo-v1` | Gevolg |
|---|---|---|---|
| Teamsterkte | Standings-doelpunten via Poisson-fallback | ClubElo-snapshot | Nieuwe importer en lokale rating-snapshots |
| Wedstrijdkansen | Per fixture BZZOIRO, anders Poisson | Eén historisch gekalibreerde Elo-naar-W/D/A-mapping | Geen BZZOIRO-hard dependency in V1 |
| Competitiedata | `football-data.org` | Providerabstractie, aanvankelijk dezelfde bron | Provider vervangbaar zonder engine-wijziging |
| Simulaties | 50.000, seeded PRNG met legacy probability source | 100.000 benchmark, seeded PRNG | Hogere stabiliteit en reproduceerbare runs |
| Eindkampioen | Afgeleid uit een succesvolle strikte clinch-check | Eindrangschikking volgens volledige `CompetitionRules` | Kampioenskans en clinchkans worden gescheiden |
| Eindstand | Punten, daarna oorspronkelijk doelsaldo; geen gesimuleerde goals | Expliciete competitie-tiebreakers | Vereist besluit over ontbrekende gesimuleerde doelpunten |
| Clinchvolgorde | Kalenderdatum, met `totalRounds - played` | Werkelijke resterende fixtures en expliciete tie-breakregels | Uitgestelde wedstrijden worden correct behandeld |
| Posities | Aanwezig als `positionProbabilities` | Behouden en uitgebreid met competitie-uitkomsten | Geen regressie van bestaande output |
| Bronnenbeleid | BZZOIRO + Poisson-fallback en hardcoded fallback | ClubElo + competitieprovider met licentiecontrole | Nieuwe attribution- en snapshotverplichtingen |
| Historische evaluatie | Niet onderdeel van de huidige pipeline | Brier, log loss, calibration en champion calibration | Productiewissel pas na meetbare evaluatie |
| Historie | Timestamped gegenereerde bestanden, geen volledige run-identiteit | Snapshots, modelversie en seed | Uitlegbaar waarom een voorspelling verandert |

De belangrijkste migratie is dus niet het verhogen van 50.000 naar 100.000 iteraties. Het is de overgang van provider- en fallbackkansen naar een reproduceerbaar, gekalibreerd sterkte- en kansmodel met formele competitieregels.

## Implementatievolgorde

1. **Regels en contracten**: definieer interne modellen, `CompetitionDataProvider`, `TeamStrengthProvider`, wedstrijdmodel en `CompetitionRules`; deze stap is klaar wanneer de prediction engine geen externe DTO’s importeert en de Eredivisie-tiebreakregels als expliciete beslisregels zijn vastgelegd.
2. **Snapshots**: bouw importers voor football-data.org en ClubElo met lokale, herleidbare snapshots en attribution; deze stap is klaar wanneer één run beide snapshot-id’s kan laden zonder netwerkcall tijdens de simulatie.
3. **Kalibratie**: verzamel pre-match Elo plus werkelijke historische uitslagen en fit de transparante drie-wegmapping; deze stap is klaar wanneer de dataset, bucketgrenzen of fitparameters, evaluatieset en Brier/log-loss/calibration-resultaten opgeslagen zijn.
4. **Simulator**: implementeer seeded Monte Carlo, eindrangschikking, clinchdetectie en positionele uitkomsten; deze stap is klaar wanneer deterministische extreme-probabilitytests en boundarytests alle outputvelden controleren.
5. **Schaduwbacktest**: draai het nieuwe model naast de huidige BZZOIRO/Poisson-baseline op historische seizoenssnapshots; deze stap is klaar wanneer de metrics, verschillen en bekende beperkingen per model zijn gerapporteerd.
6. **Productiemigratie**: activeer het nieuwe model pas na een expliciete keuze van modelversie en bronbeleid; deze stap is klaar wanneer de productie-output, publieke uitleg, attribution en prediction history naar dezelfde run-snapshot verwijzen.

## Publieke uitleg

Gebruik als basisuitleg:

> We schatten de sterkte van iedere club met ClubElo-ratings. Voor iedere resterende wedstrijd berekenen we de kans op thuiswinst, gelijkspel en uitwinst. Daarna simuleren we het resterende programma 100.000 keer. Als PSV in 63.214 simulaties kampioen wordt, tonen we een kampioenschapskans van 63,2%.

Voor de clinchdatum:

> In iedere simulatie bepalen we het eerste moment waarop de uiteindelijke kampioen volgens de officiële competitieregels niet meer kan worden ingehaald. Zo ontstaat voor iedere speeldag een kans op clinchen. Dat is een andere uitkomst dan de kans om uiteindelijk kampioen te worden.
