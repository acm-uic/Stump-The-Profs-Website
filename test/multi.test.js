import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, registerTeam, showQuestion, openBuzzers, buzz, nextAnswer, markAnswer } from "../game.js";
import { validateQuestions } from "../store.js";
import { rightShare, partialPoints, autoCheck } from "../scoring.js";
import { publicView, teamView } from "../views.js";
import { createCrowd, joinCrowd, pick, settleQuestion } from "../crowd.js";

// Two right choices out of four: A (0) and C (2). Worth 200, so "also right" is 50.
const STABLE = { id: "q1", type: "mc", prompt: "Which sorts are stable?", choices: ["Merge", "Quick", "Insertion", "Heap"], answer: [0, 2] };

function playing(teamCount = 3) {
  const state = createGame([structuredClone(STABLE)]);
  const teams = ["Byte Me", "Dr. Null", "Seg Fault"].slice(0, teamCount)
    .map((name, i) => registerTeam(state, { name, side: i % 2 ? "prof" : "student" }).team);
  showQuestion(state);
  openBuzzers(state, 1000);
  return { state, teams };
}

test("an mc answer may be a list of choice numbers", () => {
  validateQuestions([STABLE]);
  validateQuestions([{ ...STABLE, answer: [3] }]);
  assert.throws(() => validateQuestions([{ ...STABLE, answer: [] }]), /answer lists/);
  assert.throws(() => validateQuestions([{ ...STABLE, answer: [0, 4] }]), /answer lists/);
  assert.throws(() => validateQuestions([{ ...STABLE, answer: [0, 0] }]), /must not repeat/);
  assert.throws(() => validateQuestions([{ ...STABLE, answer: ["0"] }]), /answer lists/);
});

test("scoring a pick: all right is full, some right is a share, any wrong is nothing", () => {
  assert.equal(rightShare(STABLE, [0, 2]), 1);
  assert.equal(rightShare(STABLE, [2]), 0.5);
  assert.equal(rightShare(STABLE, [0, 1]), 0);
  assert.equal(rightShare(STABLE, [0, 1, 2]), 0);
  assert.equal(autoCheck(STABLE, [0, 2]), true);
  assert.equal(autoCheck(STABLE, [0]), false);
  assert.equal(partialPoints(STABLE, 0.5), 25);
});

test("a team must lock in a list of at least one real choice", () => {
  const { state, teams: [a] } = playing();
  assert.equal(buzz(state, a.id, 0, 1100).ok, false);
  assert.equal(buzz(state, a.id, [], 1100).ok, false);
  assert.equal(buzz(state, a.id, [0, 9], 1100).ok, false);
  assert.equal(buzz(state, a.id, [2, 2], 1100).ok, false);
  assert.equal(buzz(state, a.id, [2, 0], 1100).ok, true);
  assert.deepEqual(state.current.answers[a.id].answer, [0, 2]); // kept in order
});

test("a partly right pick does not end the question; a complete one still wins; each is paid", () => {
  const { state, teams: [a, b, c] } = playing();
  buzz(state, a.id, [0], 1100); // fastest, half right
  buzz(state, b.id, [0, 2], 1200); // complete
  buzz(state, c.id, [0, 1], 1300); // a wrong choice: nothing
  nextAnswer(state); // A: partly right, reading goes on
  assert.equal(state.phase, "judging");
  assert.equal(teamView(state, a.id, 1400).buzzer, "partial");
  assert.deepEqual(publicView(state, 1400).readOut[0].partial, 0.5);
  assert.equal(a.stats.wrong, 0);
  nextAnswer(state); // B: complete, wins
  assert.equal(state.phase, "revealed");
  assert.equal(b.score, 200);
  assert.equal(a.score, 25);
  assert.equal(c.score, 0);
  assert.equal(teamView(state, a.id, 1500).myAnswer.partialPoints, 25);
  assert.deepEqual(teamView(state, a.id, 1500).history[0], { questionNumber: 1, type: "mc", result: "Partly right", points: 25 });
  assert.equal(markAnswer(state, a.id, true).ok, false); // only typed answers are marked by hand
});

test("when nobody has every right choice, partly right picks still score and nobody wins", () => {
  const { state, teams: [a, b] } = playing(2);
  buzz(state, a.id, [2], 1100);
  buzz(state, b.id, [1], 1200);
  nextAnswer(state);
  nextAnswer(state);
  assert.equal(state.phase, "revealed");
  assert.equal(state.current.winnerTeamId, null);
  assert.equal(a.score, 25);
  assert.equal(b.score, 0);
  assert.equal(b.stats.wrong, 1);
});

test("the crowd taps one choice, and any right choice counts", () => {
  const crowd = createCrowd();
  const ana = joinCrowd(crowd, "Ana").spectator.id;
  const ben = joinCrowd(crowd, "Ben").spectator.id;
  pick(crowd, ana, 2, "open", STABLE);
  pick(crowd, ben, 1, "open", STABLE);
  settleQuestion(crowd, { winnerSide: null, question: STABLE });
  assert.deepEqual(crowd.lastResult.rightPickers, [ana]);
});

test("pages are told to allow several picks, but not which ones are right", () => {
  const { state, teams: [a] } = playing();
  const view = teamView(state, a.id, 1100);
  assert.equal(view.question.multiple, true);
  assert.equal("answer" in view.question, false);
});
