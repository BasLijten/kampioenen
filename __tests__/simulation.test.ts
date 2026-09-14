import { describe, it, expect } from "vitest";
import { runPrediction, runSimulation } from "../lib/simulation";
import type { Team, Fixture } from "../lib/data";
import { createCompetitionRules } from "../lib/competition-rules";

// ─── helpers ────────────────────────────────────────────────────────────────

function team(
  id: string,
  points: number,
  played: number,
  goalsFor = 40,
  goalsAgainst = 20
): Team {
  return {
    id,
    name: id,
    shortName: id.toUpperCase().slice(0, 3),
    points,
    played,
    won: Math.floor(played / 2),
    drawn: 2,
    lost: played - Math.floor(played / 2) - 2,
    goalsFor,
    goalsAgainst,
  };
}

/** homeWinProb=1 → home always wins; drawProb=1 → always draw; default = 50/25/25 */
function fixture(
  id: string,
  round: number,
  date: string,
  homeTeam: string,
  awayTeam: string,
  homeWinProb = 0.5,
  drawProb = 0.25
): Fixture {
  return {
    id,
    date,
    round,
    homeTeam,
    awayTeam,
    homeWinProb,
    drawProb,
    awayWinProb: 1 - homeWinProb - drawProb,
    source: "poisson",
  };
}

// ─── Best case scenario ──────────────────────────────────────────────────────
//
// The best case calculation is fully deterministic (no Math.random):
//  - the target team wins every fixture (+3 pts per game)
//  - all other fixtures: 0 pts to both teams (competitors "lose everything")
//    → rivals stay at their current points; only their played count increases,
//      which correctly shrinks the remaining-games window used in the clinch check.
//
// We can therefore assert exact dates/rounds without any iteration noise.

describe("Best case scenario", () => {
  it("clinches in first available round when lead is large enough", () => {
    // PSV 80 pts vs Ajax 60 pts, 6 rounds left (totalRounds=34).
    // Best case round 29: PSV wins (+3 → 83), Ajax loses (no pts, 29 played).
    // Ajax max after round 29 = 60 + 5*3 = 75 < 83 → champion on first matchday.
    const teams = [team("psv", 80, 28), team("ajax", 60, 28)];
    const fixtures = [fixture("f1", 29, "2025-04-05", "psv", "ajax", 1, 0)];

    const result = runSimulation(100, teams, fixtures, 34);
    const psv = result.clubResults["psv"];

    expect(psv.bestCaseRound).toBe(29);
    expect(psv.bestCaseDate).toBe("2025-04-05");
  });

  it("clinches in a later round when PSV has no fixture in round 29", () => {
    // Round 29: only Ajax vs someone (PSV is idle).
    // Round 30: PSV wins. With the right gap, PSV clinches in round 30.
    //
    // Setup (totalRounds=30, so only 2 rounds left):
    //   PSV 72 pts, 28 played  → after round 30 win: 75 pts, 30 played
    //   Ajax 70 pts, 28 played → after round 29 loss: 70 pts, 29 played (0 pts, competitors lose)
    //                          → after round 30 loss: 70 pts, 30 played
    //
    // After round 29 (PSV idle):
    //   Ajax 70 pts, remaining = 30-29 = 1, max = 70+3 = 73 > PSV 72 → NOT champion
    // After round 30:
    //   PSV 75 pts. Ajax 70, remaining = 0, max = 70 < 75 → champion ✓
    const teams = [
      team("psv", 72, 28),
      team("ajax", 70, 28),
      team("rvp", 10, 28), // fodder for Ajax's round-29 match
    ];
    const fixtures = [
      fixture("f1", 29, "2025-04-05", "ajax", "rvp", 0, 1), // draw
      fixture("f2", 30, "2025-04-12", "psv", "rvp", 1, 0), // PSV wins
      fixture("f3", 30, "2025-04-12", "ajax", "rvp", 0, 1), // draw (2nd fixture same date)
    ];

    // Note: rvp plays twice on same date in round 30 — that's fine for the math.
    const result = runSimulation(100, teams, fixtures, 30);
    const psv = result.clubResults["psv"];

    expect(psv.bestCaseRound).toBe(30);
    expect(psv.bestCaseDate).toBe("2025-04-12");
  });

  it("bestCaseDate and bestCaseRound are null when team is mathematically eliminated", () => {
    // Ajax has 90 pts with 6 rounds left; PSV has 50 pts.
    // PSV best case = 50 + 18 = 68. Ajax min = 90 (already there).
    // Ajax max = 90 + 18 = 108 ≥ 68 in every scenario → PSV is never champion.
    const teams = [team("psv", 50, 28), team("ajax", 90, 28)];
    const fixtures = [
      fixture("f1", 29, "2025-04-05", "psv", "ajax", 1, 0),
      fixture("f2", 30, "2025-04-12", "psv", "ajax", 1, 0),
    ];

    const result = runSimulation(100, teams, fixtures, 34);
    const psv = result.clubResults["psv"];

    expect(psv.bestCaseDate).toBeNull();
    expect(psv.bestCaseRound).toBeNull();
  });

  it("uses losses (not draws) for non-target fixtures — clinches one round earlier", () => {
    // Mirrors the real PSV-2026 situation: PSV 65 pts, Feyenoord 48 pts, 9 rounds left.
    //
    // With actual remaining fixtures, after round 26 Feyenoord has only rounds
    // 27 and 28 left: 48 + 2*3 = 54 < PSV's 68 → CLINCH.
    //
    // With the old total-rounds algorithm the same scenario would be delayed,
    // because it counted every unplayed league round instead of actual fixtures.
    const teams = [
      team("psv", 65, 25),
      team("fey", 48, 25),
      team("bot1", 10, 25),
      team("bot2", 10, 25),
    ];
    const fixtures = [
      fixture("psv-r26", 26, "2025-03-08", "psv", "bot1", 1, 0),
      fixture("fey-r26", 26, "2025-03-08", "fey", "bot2", 1, 0),
      fixture("psv-r27", 27, "2025-03-15", "psv", "bot1", 1, 0),
      fixture("fey-r27", 27, "2025-03-15", "fey", "bot2", 1, 0),
      fixture("psv-r28", 28, "2025-03-22", "psv", "bot1", 1, 0), // only needed if R27 fails
      fixture("fey-r28", 28, "2025-03-22", "fey", "bot2", 1, 0),
    ];

    const result = runSimulation(100, teams, fixtures, 34);
    const psv = result.clubResults["psv"];

    expect(psv.bestCaseRound).toBe(26);
    expect(psv.bestCaseDate).toBe("2025-03-08");
  });

  it("every team in a multi-team league gets independent best-case analysis", () => {
    // Three-team league; PSV leads but Ajax is close enough that both have a path.
    const teams = [
      team("psv", 80, 28),
      team("ajax", 60, 28),
      team("fey", 40, 28),
    ];
    const fixtures = [
      fixture("f1", 29, "2025-04-05", "psv", "ajax", 1, 0),
      fixture("f2", 29, "2025-04-05", "fey", "psv", 0, 0), // away PSV wins
    ];

    const result = runSimulation(100, teams, fixtures, 34);

    // PSV should have a best-case path; Feyenoord (40 pts) cannot catch up.
    expect(result.clubResults["psv"].bestCaseRound).not.toBeNull();
    expect(result.clubResults["fey"].bestCaseDate).toBeNull();
  });
});

// ─── Most likely scenario ────────────────────────────────────────────────────
//
// We use extreme probability values (0 or 1) to make the Monte Carlo
// deterministic, so all iterations produce the same outcome.

describe("Most likely scenario", () => {
  it("reproduces an entire prediction run from its seed and records its contract metadata", () => {
    const teams = [team("psv", 80, 28), team("ajax", 60, 28)];
    const fixtures = [
      fixture("z", 30, "2025-04-12", "psv", "ajax"),
      fixture("a", 29, "2025-04-05", "psv", "ajax"),
    ];
    const model = { version: "test-model-v1", predict: (f: Fixture) => f };
    const input = { teams, fixtures, totalRounds: 34, iterations: 250, seed: 42,
      competition: "eredivisie", season: "2025/26", standingsSnapshotId: "standings-1",
      fixturesSnapshotId: "fixtures-1", model };

    const first = runPrediction(input);
    const second = runPrediction({ ...input, fixtures: [...fixtures].reverse() });

    expect(second).toEqual(first);
    expect(first.metadata).toEqual({ modelVersion: "test-model-v1", competition: "eredivisie", season: "2025/26", standingsSnapshotId: "standings-1", fixturesSnapshotId: "fixtures-1", seed: 42, iterations: 250 });
  });

  it("totalChampionshipProbability ≈ 1 when PSV wins every match with certainty", () => {
    // PSV always wins (homeWinProb=1), rivals always draw → PSV clinches each time.
    const teams = [team("psv", 80, 28), team("ajax", 60, 28)];
    const fixtures = [fixture("f1", 29, "2025-04-05", "psv", "ajax", 1, 0)];

    const result = runSimulation(500, teams, fixtures, 34);

    expect(result.clubResults["psv"].totalChampionshipProbability).toBeCloseTo(1, 1);
    expect(result.clubResults["psv"].neverChampionProbability).toBeCloseTo(0, 1);
  });

  it("applies a certain draw to both clubs in the shared simulation", () => {
    const teams = [team("psv", 80, 28), team("ajax", 60, 28)];
    const fixtures = [fixture("f1", 29, "2025-04-05", "psv", "ajax", 0, 1)];

    const result = runSimulation(250, teams, fixtures, 34);

    expect(result.clubResults.psv.positionProbabilities[1]).toBe(1);
    expect(result.clubResults.ajax.positionProbabilities[2]).toBe(1);
    expect(result.clubResults.psv.totalChampionshipProbability).toBe(1);
  });

  it("records a complete joint final ranking for every simulation", () => {
    const teams = [
      team("psv", 80, 28),
      team("ajax", 60, 28),
      team("fey", 40, 28),
    ];
    const fixtures = [
      fixture("psv-ajax", 29, "2025-04-05", "psv", "ajax", 1, 0),
      fixture("fey-psv", 29, "2025-04-05", "fey", "psv", 0, 1),
    ];

    const result = runSimulation(250, teams, fixtures, 34);
    const positionTotals = [1, 2, 3].map((position) =>
      teams.reduce(
        (total, currentTeam) =>
          total + (result.clubResults[currentTeam.id].positionProbabilities[position] ?? 0),
        0
      )
    );

    expect(teams.map((currentTeam) =>
      Object.values(result.clubResults[currentTeam.id].positionProbabilities)
        .reduce((total, probability) => total + probability, 0)
    )).toEqual([1, 1, 1]);
    expect(positionTotals).toEqual([1, 1, 1]);
  });

  it("totalChampionshipProbability ≈ 0 when PSV always loses and rival always wins", () => {
    // PSV always loses (homeWinProb=0, drawProb=0 → away always wins),
    // Ajax is home and wins every match → Ajax gets all points.
    const teams = [team("psv", 50, 28), team("ajax", 90, 28)];
    const fixtures = [
      fixture("f1", 29, "2025-04-05", "ajax", "psv", 1, 0), // Ajax home wins
      fixture("f2", 30, "2025-04-12", "ajax", "psv", 1, 0),
    ];

    const result = runSimulation(500, teams, fixtures, 34);

    expect(result.clubResults["psv"].totalChampionshipProbability).toBeCloseTo(0, 1);
    expect(result.clubResults["psv"].neverChampionProbability).toBeCloseTo(1, 1);
  });

  it("expectedDate is null when championship probability is 0", () => {
    const teams = [team("psv", 50, 28), team("ajax", 90, 28)];
    const fixtures = [fixture("f1", 29, "2025-04-05", "ajax", "psv", 1, 0)];

    const result = runSimulation(200, teams, fixtures, 34);

    expect(result.clubResults["psv"].expectedDate).toBeNull();
  });

  it("expectedDate equals the round with the highest per-round probability", () => {
    // PSV always wins → clinches in round 29 every time → round 29 has prob ≈ 1.
    const teams = [team("psv", 80, 28), team("ajax", 60, 28)];
    const fixtures = [
      fixture("f1", 29, "2025-04-05", "psv", "ajax", 1, 0),
      fixture("f2", 30, "2025-04-12", "psv", "ajax", 1, 0),
    ];

    const result = runSimulation(500, teams, fixtures, 34);
    const psv = result.clubResults["psv"];

    // expectedDate must be round 29 because PSV always clinches there.
    expect(psv.expectedDate).toBe("2025-04-05");
  });

  it("iterations count is preserved in the result", () => {
    const teams = [team("psv", 80, 28), team("ajax", 60, 28)];
    const fixtures = [fixture("f1", 29, "2025-04-05", "psv", "ajax", 1, 0)];

    const result = runSimulation(250, teams, fixtures, 34);

    expect(result.iterations).toBe(250);
  });
});

describe("versioned competition rules and simulated scores", () => {
  it("uses configured points, goal difference, and goals scored in order", () => {
    const rules = createCompetitionRules({
      version: "test-rules-v1",
      pointsForWin: 3,
      pointsForDraw: 1,
      pointsForLoss: 0,
      tiebreakers: ["goalDifference", "goalsFor"],
    });

    const teams = [
      team("alpha", 20, 10, 10, 10),
      team("beta", 20, 10, 9, 10),
      team("gamma", 20, 10, 8, 10),
    ];
    const fixtures = [
      { ...fixture("b", 11, "2025-05-01", "beta", "gamma", 1, 0), homeGoalProbabilities: [0, 1] },
      { ...fixture("a", 11, "2025-05-01", "alpha", "gamma", 1, 0), homeGoalProbabilities: [0, 1] },
    ];

    const result = runSimulation(1, teams, fixtures, 11, { rules, seed: 42 });

    expect(result.clubResults.alpha.simulatedGoalsFor).toBe(11);
    expect(result.clubResults.beta.simulatedGoalsFor).toBe(10);
    expect(result.clubResults.alpha.positionProbabilities[1]).toBe(1);
    expect(result.rulesVersion).toBe("test-rules-v1");
  });

  it("generates a score after sampling and never changes the sampled result", () => {
    const teams = [team("home", 0, 0, 0, 0), team("away", 0, 0, 0, 0)];
    const drawFixture = {
      ...fixture("draw", 1, "2025-01-01", "home", "away", 0, 1),
      homeGoalProbabilities: [0, 1],
      awayGoalProbabilities: [0, 1],
    };

    const result = runSimulation(1, teams, [drawFixture], 1, { seed: 7 });

    expect(result.clubResults.home.simulatedGoalsFor).toBe(1);
    expect(result.clubResults.home.simulatedGoalsAgainst).toBe(1);
    expect(result.clubResults.home.positionProbabilities[1]).toBe(1);
    expect(result.clubResults.away.positionProbabilities[1]).toBe(1);
  });

  it("blocks a ruleset that requires incomplete head-to-head data", () => {
    const rules = createCompetitionRules({
      version: "head-to-head-v1",
      pointsForWin: 3,
      pointsForDraw: 1,
      pointsForLoss: 0,
      tiebreakers: ["headToHead", "goalDifference"],
    });

    expect(() => runSimulation(1, [team("a", 0, 0), team("b", 0, 0)], [], 1, { rules }))
      .toThrow(/head-to-head/i);
  });

  it("uses complete head-to-head data when score tiebreakers are level", () => {
    const rules = createCompetitionRules({
      version: "head-to-head-v1",
      pointsForWin: 3,
      pointsForDraw: 1,
      pointsForLoss: 0,
      tiebreakers: ["headToHead", "goalDifference"],
    });
    const headToHead = {
      a: { b: { played: 1, points: 3, goalsFor: 2, goalsAgainst: 0 } },
      b: { a: { played: 1, points: 0, goalsFor: 0, goalsAgainst: 2 } },
    };
    const result = runSimulation(
      1,
      [team("a", 3, 1, 2, 2), team("b", 3, 1, 2, 2)],
      [],
      1,
      { rules, headToHead }
    );

    expect(result.clubResults.a.positionProbabilities[1]).toBe(1);
    expect(result.clubResults.b.positionProbabilities[2]).toBe(1);
  });

  it("keeps an unresolved final tie explicit unless unique ranking is configured", () => {
    const rules = createCompetitionRules({
      version: "tie-preserving-v1",
      pointsForWin: 3,
      pointsForDraw: 1,
      pointsForLoss: 0,
      tiebreakers: [],
    });
    const result = runSimulation(1, [team("a", 3, 1), team("b", 3, 1)],  [], 1, { rules, seed: 9 });

    expect(result.clubResults.a.tieProbability).toBe(1);
    expect(result.clubResults.a.positionProbabilities[1]).toBe(1);
    expect(result.clubResults.b.positionProbabilities[1]).toBe(1);
    expect(result.clubResults.a.totalChampionshipProbability).toBe(0);
  });

  it("resolves a required tie with the seed and records the tie-break audit count", () => {
    const rules = createCompetitionRules({
      version: "seeded-ranking-v1",
      pointsForWin: 3,
      pointsForDraw: 1,
      pointsForLoss: 0,
      tiebreakers: [],
      requireUniqueRanking: true,
    });
    const teams = [team("a", 3, 1), team("b", 3, 1)];
    const first = runSimulation(20, teams, [], 1, { rules, seed: 99 });
    const second = runSimulation(20, teams, [], 1, { rules, seed: 99 });

    expect(second).toEqual(first);
    expect(first.seededTieBreakCount).toBe(20);
    expect(first.clubResults.a.tieProbability).toBe(0);
    expect(first.clubResults.a.totalChampionshipProbability + first.clubResults.b.totalChampionshipProbability).toBe(1);
  });

  it("is exactly reproducible with a seed and stable fixture ordering", () => {
    const teams = [team("a", 0, 0), team("b", 0, 0), team("c", 0, 0)];
    const fixtures = [
      fixture("z", 1, "2025-01-01", "a", "b", 0.5, 0.25),
      fixture("a", 1, "2025-01-01", "b", "c", 0.5, 0.25),
    ];

    const first = runSimulation(20, teams, fixtures, 1, { seed: 1234 });
    const second = runSimulation(20, teams, [...fixtures].reverse(), 1, { seed: 1234 });

    expect(second).toEqual(first);
    expect(first.fixtureOrder).toEqual(["a", "z"]);
  });

  it("reports the actual clinch date after every fixture on that date", () => {
    const teams = [team("leader", 80, 28), team("rival", 60, 28), team("third", 10, 28)];
    const fixtures = [
      fixture("later-id", 29, "2025-04-05", "rival", "third", 0, 1),
      fixture("first-id", 28, "2025-04-04", "leader", "third", 1, 0),
    ];

    const result = runSimulation(1, teams, fixtures, 34, { seed: 1 });

    expect(result.clubResults.leader.dateProbabilities[0]).toMatchObject({
      date: "2025-04-04",
      round: 28,
      probability: 1,
    });
  });
});
