import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, registerTeam, showQuestion, openBuzzers, buzz, judge } from "../game.js";
import { publicView, teamView, adminView } from "../views.js";

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
