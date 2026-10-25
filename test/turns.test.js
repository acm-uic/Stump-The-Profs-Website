import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { stealOrder } from "../turns.js";

// Students S1-S3 joined first, second and third; profs P1-P3 joined fourth to sixth.
const team = (id, side, joinOrder) => ({ id, side, joinOrder });
const SIX = [
  team("S1", "student", 1), team("S2", "student", 2), team("S3", "student", 3),
  team("P1", "prof", 4), team("P2", "prof", 5), team("P3", "prof", 6),
];
const buzzes = (...ids) => ids.map((teamId, i) => ({ teamId, at: 1000 + i * 100 }));

describe("stealOrder", () => {
  test("A: only the first team buzzed, so the rest go by side, then join order", () => {
    assert.deepEqual(stealOrder(SIX, buzzes("S1"), ["S1"]), ["P1", "S2", "P2", "S3", "P3"]);
  });

  test("B: within a side, teams that buzzed go before teams that did not", () => {
    assert.deepEqual(
      stealOrder(SIX, buzzes("S2", "P3", "S1", "P1"), ["S2"]),
      ["P3", "S1", "P1", "S3", "P2"],
    );
  });

  test("C: when one side runs out, the other side keeps going", () => {
    const uneven = [SIX[0], SIX[1], SIX[2], SIX[3]]; // 3 students, 1 prof
    assert.deepEqual(stealOrder(uneven, buzzes("S1"), ["S1"]), ["P1", "S2", "S3"]);
  });

  test("D: midway, the next pick is the side opposite the last team that tried", () => {
    assert.deepEqual(stealOrder(SIX, buzzes("S1"), ["S1", "P1"]), ["S2", "P2", "S3", "P3"]);
  });

  test("E: when everyone has tried, nobody is left", () => {
    assert.deepEqual(stealOrder(SIX, buzzes("S1"), ["S1", "P1", "S2", "P2", "S3", "P3"]), []);
  });

  test("2 students and 3 profs, only P2 buzzed and tried", () => {
    const five = [SIX[0], SIX[1], SIX[3], SIX[4], SIX[5]];
    assert.deepEqual(stealOrder(five, buzzes("P2"), ["P2"]), ["S1", "P1", "S2", "P3"]);
  });

  test("with nobody attempted yet it does not crash and includes everyone", () => {
    // Not used by the game (the first buzzer always answers first), but must not crash.
    assert.deepEqual(stealOrder(SIX, [], []).length, 6);
  });

  test("never changes its inputs, and gives the same answer twice", () => {
    const teams = structuredClone(SIX);
    const b = buzzes("S2", "P3");
    const before = structuredClone({ teams, b });
    const first = stealOrder(teams, b, ["S2"]);
    assert.deepEqual(stealOrder(teams, b, ["S2"]), first);
    assert.deepEqual({ teams, b }, before);
  });
});
