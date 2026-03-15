import { describe, it, expect } from "vitest";
import { runSimulation } from "../lib/simulation";
import type { Team, Fixture } from "../lib/data";

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
    // After round 26: PSV 68, Fey 48 (lost), remaining 8 → max 48+24=72 ≥ 68  ❌
    // After round 27: PSV 71, Fey 48 (lost), remaining 7 → max 48+21=69 < 71  ✓ CLINCH
    //
    // With the old "draw" algorithm Feyenoord would gain 1 pt/round:
    //   After R27: Fey 50, max 50+21=71 = 71  ❌  (tie still possible — no clinch)
    //   After R28: Fey 51, max 51+18=69 < 74  ✓  (clinch one round later)
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

    expect(psv.bestCaseRound).toBe(27);
    expect(psv.bestCaseDate).toBe("2025-03-15");
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
  it("totalChampionshipProbability ≈ 1 when PSV wins every match with certainty", () => {
    // PSV always wins (homeWinProb=1), rivals always draw → PSV clinches each time.
    const teams = [team("psv", 80, 28), team("ajax", 60, 28)];
    const fixtures = [fixture("f1", 29, "2025-04-05", "psv", "ajax", 1, 0)];

    const result = runSimulation(500, teams, fixtures, 34);

    expect(result.clubResults["psv"].totalChampionshipProbability).toBeCloseTo(1, 1);
    expect(result.clubResults["psv"].neverChampionProbability).toBeCloseTo(0, 1);
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
