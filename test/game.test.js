import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame, registerTeam, rejoinTeam, showQuestion, openBuzzers, buzz, judge, reveal,
} from "../game.js";

const QUESTIONS = [
  { id: "q1", type: "free", prompt: "Free?", answer: "yes" },
  { id: "q2", type: "mc", prompt: "MC?", choices: ["A", "B"], answer: 1 },
  { id: "q3", type: "tf", prompt: "TF?", answer: true },
];

// A game with two teams, ready to show a question.
function gameWithTeams() {
  const state = createGame(structuredClone(QUESTIONS));
  const a = registerTeam(state, { name: "Byte Me", side: "student" }).team;
  const b = registerTeam(state, { name: "Dr. Null", side: "prof" }).team;
  return { state, a, b };
}

test("a new game has no teams and starts in the lobby", () => {
  const state = createGame();
  assert.deepEqual(state.teams, {});
  assert.equal(state.phase, "lobby");
});

test("registering gives back the team with its side and a 4-character code", () => {
  const state = createGame();
  const result = registerTeam(state, { name: "  Byte Me ", side: "student" });
  assert.equal(result.ok, true);
  assert.equal(result.team.name, "Byte Me");
  assert.equal(result.team.side, "student");
  assert.match(result.team.code, /^[A-Z2-9]{4}$/);
  assert.equal(state.teams[result.team.id], result.team);
});

test("duplicate names are refused, ignoring case and spaces, and nothing changes", () => {
  const state = createGame();
  registerTeam(state, { name: "Byte Me", side: "student" });
  const before = structuredClone(state);
  const result = registerTeam(state, { name: "  BYTE ME  ", side: "prof" });
  assert.equal(result.ok, false);
  assert.match(result.error, /name/i);
  assert.deepEqual(state, before);
});

test("an empty name or a bad side is refused", () => {
  const state = createGame();
  assert.equal(registerTeam(state, { name: "   ", side: "prof" }).ok, false);
  assert.equal(registerTeam(state, { name: "Dr. Null", side: "dean" }).ok, false);
  assert.equal(registerTeam(state, {}).ok, false);
  assert.equal(Object.keys(state.teams).length, 0);
  assert.equal(state.nextJoinOrder, 1);
});

test("registration can be closed", () => {
  const state = createGame();
  state.registrationOpen = false;
  assert.equal(registerTeam(state, { name: "Late", side: "prof" }).ok, false);
});

test("every team gets a different code", () => {
  const state = createGame();
  const codes = ["A", "B", "C", "D", "E", "F"].map(
    (name, i) => registerTeam(state, { name, side: i % 2 ? "prof" : "student" }).team.code,
  );
  assert.equal(new Set(codes).size, codes.length);
});

test("rejoin finds the team by code, in any case, and refuses a wrong code", () => {
  const state = createGame();
  const { team } = registerTeam(state, { name: "Byte Me", side: "student" });
  assert.equal(rejoinTeam(state, team.code.toLowerCase()).team, team);
  assert.equal(rejoinTeam(state, "ZZZZ").ok, false);
  assert.equal(rejoinTeam(state, undefined).ok, false);
});

test("buzzing only works while buzzers are open", () => {
  const { state, a } = gameWithTeams();
  assert.equal(buzz(state, a.id, 500).ok, false); // lobby
  showQuestion(state);
  assert.equal(buzz(state, a.id, 900).ok, false); // preview
  assert.deepEqual(state.current.buzzes, []);
});

test("the first buzz gets the floor; later buzzes are still recorded; repeats are refused", () => {
  const { state, a, b } = gameWithTeams();
  showQuestion(state);
  openBuzzers(state, 1000);
  assert.equal(buzz(state, a.id, 1250).ok, true);
  assert.equal(state.phase, "answering");
  assert.equal(state.current.activeTeamId, a.id);
  assert.equal(buzz(state, b.id, 1400).ok, true);
  assert.equal(state.current.activeTeamId, a.id);
  assert.equal(buzz(state, a.id, 1500).ok, false);
  assert.equal(buzz(state, "t99", 1600).ok, false);
  assert.deepEqual(state.current.buzzes.map((x) => x.teamId), [a.id, b.id]);
  assert.deepEqual(a.stats.reactionTimes, [250]);
  assert.equal(a.stats.buzzesWon, 1);
});

test("a correct answer scores 300, 200 and 100 for free, mc and tf", () => {
  const { state, a } = gameWithTeams();
  let now = 1000;
  for (const expected of [300, 500, 600]) {
    assert.equal(showQuestion(state).ok, true);
    openBuzzers(state, now);
    buzz(state, a.id, now + 100);
    assert.equal(judge(state, true, now + 200).ok, true);
    assert.equal(state.phase, "revealed");
    assert.equal(a.score, expected);
    now += 1000;
  }
  assert.equal(state.current.winnerTeamId, a.id);
  assert.equal(a.stats.correct, 3);
});

test("a wrong answer scores nothing and (until Chunk 4) ends the question", () => {
  const { state, a } = gameWithTeams();
  showQuestion(state);
  openBuzzers(state, 1000);
  buzz(state, a.id, 1100);
  judge(state, false, 1200);
  assert.equal(a.score, 0);
  assert.equal(a.stats.wrong, 1);
  assert.equal(state.phase, "revealed");
  assert.equal(state.current.winnerTeamId, null);
});

test("actions in the wrong phase are refused", () => {
  const { state } = gameWithTeams();
  assert.equal(openBuzzers(state, 1000).ok, false); // nothing shown yet
  assert.equal(judge(state, true, 1000).ok, false);
  assert.equal(reveal(state).ok, false);
  showQuestion(state);
  assert.equal(showQuestion(state).ok, false); // mid-question
  assert.equal(judge(state, true, 1000).ok, false); // nobody has the floor
  openBuzzers(state, 1000);
  assert.equal(openBuzzers(state, 1001).ok, false); // double click
});

test("judge needs a real true or false", () => {
  const { state, a } = gameWithTeams();
  showQuestion(state);
  openBuzzers(state, 1000);
  buzz(state, a.id, 1100);
  assert.equal(judge(state, "yes", 1200).ok, false);
  assert.equal(state.phase, "answering");
});

test("reveal with no buzzes ends the question with no winner", () => {
  const { state } = gameWithTeams();
  showQuestion(state);
  openBuzzers(state, 1000);
  assert.equal(reveal(state).ok, true);
  assert.equal(state.phase, "revealed");
});

test("show can jump to a question, but not past the end", () => {
  const { state } = gameWithTeams();
  assert.equal(showQuestion(state, 2).ok, true);
  assert.equal(state.questionIndex, 2);
  reveal(state); // not allowed in preview, so still preview
  openBuzzers(state, 1000);
  reveal(state);
  assert.equal(showQuestion(state).ok, false); // there is no 4th question
  assert.equal(showQuestion(state, 99).ok, false);
});
