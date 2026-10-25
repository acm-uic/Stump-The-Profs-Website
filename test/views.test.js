import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, registerTeam, showQuestion, openBuzzers, buzz, judge, lockIn } from "../game.js";
import { publicView, teamView, adminView, rankOf, buzzerState, teamStats } from "../views.js";

function playing() {
  const state = createGame([{ id: "q1", type: "mc", prompt: "Pick", choices: ["A", "B"], answer: 1 }]);
  const a = registerTeam(state, { name: "Byte Me", side: "student" }).team;
  showQuestion(state);
  return { state, a };
}

test("before the reveal, the public view has no answer and no team codes", () => {
  const { state } = playing();
  const view = publicView(state, 1000);
  assert.equal("answer" in view.question, false);
  assert.ok(view.teams.every((t) => !("code" in t)));
  assert.equal(JSON.stringify(view).includes(state.teams.t1.code), false);
});

test("a team view adds only that team's own code", () => {
  const { state, a } = playing();
  const view = teamView(state, a.id, 1000);
  assert.equal(view.me.code, a.code);
  assert.equal("answer" in view.question, false);
});

test("the admin view always has the answer and every code", () => {
  const { state, a } = playing();
  const view = adminView(state, 1000);
  assert.equal(view.question.answer, 1);
  assert.equal(view.teams[0].code, a.code);
});

test("after the reveal, everyone sees the answer and the winner", () => {
  const { state, a } = playing();
  openBuzzers(state, 1000);
  buzz(state, a.id, 1300);
  judge(state, true, 1500);
  const view = publicView(state, 1600);
  assert.equal(view.question.answer, 1);
  assert.equal(view.result.winner.name, "Byte Me");
  assert.equal(view.result.points, 200);
});

test("answer time counts down from 20 s while a team has the floor, and never goes negative", () => {
  const { state, a } = playing();
  openBuzzers(state, 1000);
  buzz(state, a.id, 2000);
  assert.equal(publicView(state, 7000).answerRemainingMs, 15000);
  assert.equal(publicView(state, 99000).answerRemainingMs, 0);
  assert.equal(publicView(state, 2000).buzzes[0].ms, 1000);
});

test("building views never changes the state", () => {
  const { state, a } = playing();
  const before = structuredClone(state);
  publicView(state, 1);
  teamView(state, a.id, 1);
  adminView(state, 1);
  assert.deepEqual(state, before);
});

// ---- Team dashboard -----------------------------------------------------------

test("ranks: tied teams share a rank and the next is skipped", () => {
  const teams = [400, 400, 300, 100].map((score, i) => ({ id: `t${i}`, score }));
  assert.deepEqual(teams.map((t) => rankOf(teams, t.id)), [1, 1, 3, 4]);
});

test("a team with no attempts has null stats, not NaN or 0", () => {
  const stats = teamStats({ stats: { buzzesWon: 0, correct: 0, wrong: 0, steals: 0, reactionTimes: [], lockInHits: 0 } });
  assert.equal(stats.accuracy, null);
  assert.equal(stats.avgReactionMs, null);
  assert.equal(stats.fastestReactionMs, null);
});

test("stats: accuracy, average and fastest reaction", () => {
  const stats = teamStats({ stats: { buzzesWon: 3, correct: 2, wrong: 1, steals: 1, reactionTimes: [400, 200, 300], lockInHits: 1 } });
  assert.equal(stats.accuracy, 67);
  assert.equal(stats.avgReactionMs, 300);
  assert.equal(stats.fastestReactionMs, 200);
});

test("buzzer state for each situation", () => {
  const state = createGame([{ id: "q1", type: "tf", prompt: "?", answer: true }]);
  const [a, b, c, d] = ["A", "B", "C", "D"].map(
    (name, i) => registerTeam(state, { name, side: i % 2 ? "prof" : "student" }).team,
  );
  assert.equal(buzzerState(state, a.id).buzzer, "locked"); // lobby
  showQuestion(state);
  assert.equal(buzzerState(state, a.id).buzzer, "locked"); // preview
  openBuzzers(state, 1000);
  assert.equal(buzzerState(state, a.id).buzzer, "ready");
  buzz(state, a.id, 1100); // A has the floor
  buzz(state, c.id, 1200); // C buzzed late
  assert.equal(buzzerState(state, a.id).buzzer, "floor");
  // Up next after student A: profs first (B, D), with student C (buzzed) in between.
  assert.deepEqual(buzzerState(state, b.id), { buzzer: "ready", place: 1 });
  assert.deepEqual(buzzerState(state, c.id), { buzzer: "buzzed", place: 2 });
  judge(state, false, 1300);
  assert.equal(buzzerState(state, a.id).buzzer, "tried");
  judge(state, true, 1400);
  assert.equal(buzzerState(state, d.id).buzzer, "over");
});

test("the team view has exactly the agreed fields, and a history line per finished question", () => {
  const state = createGame([
    { id: "q1", type: "mc", prompt: "?", choices: ["x", "y"], answer: 0 },
    { id: "q2", type: "tf", prompt: "?", answer: true },
  ]);
  const a = registerTeam(state, { name: "A", side: "student" }).team;
  const b = registerTeam(state, { name: "B", side: "prof" }).team;
  showQuestion(state);
  openBuzzers(state, 1000);
  lockIn(state, b.id, 0);
  buzz(state, a.id, 1250);
  judge(state, true, 1300); // A correct 200, B lock-in 50
  showQuestion(state);
  openBuzzers(state, 2000);
  buzz(state, a.id, 2100);
  judge(state, false, 2200);
  judge(state, true, 2300); // B steals 100

  const view = teamView(state, b.id, 3000);
  assert.deepEqual(Object.keys(view).sort(), [
    "answerRemainingMs", "answerTotalMs", "answersOpen", "attempted", "buzzer", "buzzes", "canLockIn", "crowd", "floorTeam",
    "history", "lockInCount", "lockInPoints", "me", "myLockIn", "phase", "place", "question",
    "questionNumber", "questionTotal", "result", "sides", "stats", "teams", "upNext",
  ]);
  assert.deepEqual(view.history, [
    { questionNumber: 1, type: "mc", result: "Lock-in", points: 50 },
    { questionNumber: 2, type: "tf", result: "Steal", points: 100 },
  ]);
  assert.equal(view.me.score, 150);
  assert.equal(view.me.rank, 2);
  assert.equal(view.me.rankOf, 2);
  assert.deepEqual(view.sides, { student: 200, prof: 150 });
  assert.equal(teamView(state, a.id, 3000).history[1].result, "Wrong");
});
