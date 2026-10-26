import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame, registerTeam, rejoinTeam, showQuestion, openBuzzers, buzz, judge, reveal, upNext,
  lockIn, markLockIn, adjustScore, kickTeam, toggleRegistration, replaceQuestions,
} from "../game.js";
import { joinCrowd, predict, pick } from "../crowd.js";

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

test("a wrong answer passes the floor to the other side and restarts the clock", () => {
  const { state, a, b } = gameWithTeams();
  showQuestion(state);
  openBuzzers(state, 1000);
  buzz(state, a.id, 1100);
  judge(state, false, 5000);
  assert.equal(a.score, 0);
  assert.equal(a.stats.wrong, 1);
  assert.equal(state.phase, "answering");
  assert.equal(state.current.activeTeamId, b.id);
  assert.equal(state.current.answeringSince, 5000);
});

test("wrong, wrong, right: the third team scores and it counts as a steal", () => {
  const state = createGame(structuredClone(QUESTIONS));
  const s1 = registerTeam(state, { name: "S1", side: "student" }).team;
  const s2 = registerTeam(state, { name: "S2", side: "student" }).team;
  const p1 = registerTeam(state, { name: "P1", side: "prof" }).team;
  showQuestion(state);
  openBuzzers(state, 1000);
  buzz(state, s1.id, 1100);
  judge(state, false, 2000); // S1 wrong -> P1
  assert.equal(state.current.activeTeamId, p1.id);
  judge(state, false, 3000); // P1 wrong -> S2 (profs have nobody left)
  assert.equal(state.current.activeTeamId, s2.id);
  judge(state, true, 4000);
  assert.equal(s2.score, 300);
  assert.equal(s2.stats.steals, 1);
  assert.equal(s1.stats.wrong, 1);
  assert.equal(p1.stats.wrong, 1);
  assert.equal(state.phase, "revealed");
  assert.equal(state.current.winnerTeamId, s2.id);
});

test("with 3 and 3 teams, five wrongs visit all six teams alternating sides; the sixth reveals", () => {
  const state = createGame(structuredClone(QUESTIONS));
  const ids = ["S1", "S2", "S3", "P1", "P2", "P3"].map(
    (name) => registerTeam(state, { name, side: name[0] === "S" ? "student" : "prof" }).team.id,
  );
  showQuestion(state);
  openBuzzers(state, 1000);
  buzz(state, ids[1], 1100); // S2 first
  buzz(state, ids[5], 1200); // P3 second
  const visited = [state.current.activeTeamId];
  for (let i = 0; i < 5; i++) {
    judge(state, false, 2000 + i);
    visited.push(state.current.activeTeamId);
  }
  const names = visited.map((id) => state.teams[id].name);
  assert.deepEqual(names, ["S2", "P3", "S1", "P1", "S3", "P2"]);
  judge(state, false, 3000);
  assert.equal(state.phase, "revealed");
  assert.equal(state.current.winnerTeamId, null);
  assert.equal(state.current.attempted.length, 6);
});

test("upNext lists who is waiting, and updates when a late team buzzes", () => {
  const state = createGame(structuredClone(QUESTIONS));
  const s1 = registerTeam(state, { name: "S1", side: "student" }).team;
  const p1 = registerTeam(state, { name: "P1", side: "prof" }).team;
  const p2 = registerTeam(state, { name: "P2", side: "prof" }).team;
  showQuestion(state);
  openBuzzers(state, 1000);
  buzz(state, s1.id, 1100);
  assert.deepEqual(upNext(state), [p1.id, p2.id]);
  buzz(state, p2.id, 1500); // P2 buzzes late and jumps ahead of P1
  assert.deepEqual(upNext(state), [p2.id, p1.id]);
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

// ---- Lock-ins ---------------------------------------------------------------

function threeTeamsOnQuestion(index) {
  const state = createGame(structuredClone(QUESTIONS));
  const a = registerTeam(state, { name: "A", side: "student" }).team;
  const b = registerTeam(state, { name: "B", side: "prof" }).team;
  const c = registerTeam(state, { name: "C", side: "student" }).team;
  showQuestion(state, index);
  openBuzzers(state, 1000);
  return { state, a, b, c };
}

test("lock-ins: right pays 25%, wrong pays nothing, the winner gets no bonus", () => {
  const { state, a, b, c } = threeTeamsOnQuestion(1); // mc, 200 points, answer 1
  assert.equal(lockIn(state, b.id, 1).ok, true);
  assert.equal(lockIn(state, c.id, 0).ok, true);
  assert.equal(lockIn(state, a.id, 1).ok, true);
  buzz(state, a.id, 1100);
  judge(state, true, 1200);
  assert.equal(a.score, 200);
  assert.equal(b.score, 50);
  assert.equal(b.stats.lockInHits, 1);
  assert.equal(c.score, 0);
});

test("lock-ins close at the first judgement, and the team with the floor cannot lock in", () => {
  const { state, a, b, c } = threeTeamsOnQuestion(2); // tf
  buzz(state, a.id, 1100);
  assert.equal(lockIn(state, a.id, true).ok, false);
  judge(state, false, 1200); // floor passes to B
  const late = lockIn(state, c.id, true);
  assert.equal(late.ok, false);
  assert.match(late.error, /closed/);
  assert.equal(lockIn(state, b.id, true).ok, false);
});

test("lock-ins are once only and must fit the question type", () => {
  const { state, b, c } = threeTeamsOnQuestion(1); // mc with 2 choices
  assert.equal(lockIn(state, b.id, 5).ok, false);
  assert.equal(lockIn(state, b.id, "1").ok, false);
  assert.equal(lockIn(state, b.id, 1).ok, true);
  assert.equal(lockIn(state, b.id, 0).ok, false);
  assert.equal(lockIn(state, c.id, true).ok, false);
  assert.equal(lockIn(state, "t99", 1).ok, false);
});

test("free response lock-ins wait for the host; marking is idempotent and reversible", () => {
  const { state, a, b } = threeTeamsOnQuestion(0); // free, 300 points, answer "yes"
  lockIn(state, b.id, "  yeah ");
  buzz(state, a.id, 1100);
  assert.equal(markLockIn(state, b.id, true).ok, false); // not revealed yet
  judge(state, false, 1200);
  judge(state, false, 1300);
  judge(state, false, 1400); // everyone tried, revealed
  assert.equal(state.phase, "revealed");
  assert.equal(b.score, 0);
  assert.equal(state.current.lockIns[b.id].answer, "yeah");
  markLockIn(state, b.id, true);
  markLockIn(state, b.id, true);
  assert.equal(b.score, 75);
  assert.equal(b.stats.lockInHits, 1);
  markLockIn(state, b.id, false);
  assert.equal(b.score, 0);
  assert.equal(b.stats.lockInHits, 0);
  assert.equal(markLockIn(state, a.id, true).ok, false); // A never locked in
});

test("an exact free response lock-in is paid automatically at the reveal", () => {
  const { state, b } = threeTeamsOnQuestion(0);
  lockIn(state, b.id, "YES");
  reveal(state);
  assert.equal(b.score, 75);
});

test("ending a question settles the crowd, and showing the next one clears it", () => {
  const { state, a, b } = gameWithTeams();
  const crowd = state.crowd;
  const ana = joinCrowd(crowd, "Ana").spectator.id;
  const ben = joinCrowd(crowd, "Ben").spectator.id;
  showQuestion(state, 1); // mc, answer 1
  predict(crowd, ana, "prof", state.phase);
  predict(crowd, ben, "student", state.phase);
  openBuzzers(state, 1000);
  pick(crowd, ana, 1, state.phase, state.questions[1], state.current.lockInsOpen);
  buzz(state, a.id, 1100);
  judge(state, false, 1200); // student wrong -> prof
  judge(state, true, 1300);  // prof right
  assert.equal(b.score, 200);
  assert.equal(crowd.spectators[ana].score, 20); // right prediction and right pick
  assert.equal(crowd.spectators[ben].score, 0);
  showQuestion(state);
  assert.deepEqual(crowd.predictions, {});
});

// ---- Host fixes ---------------------------------------------------------------

test("adjustScore adds or removes whole points, refusing typos and unknown teams", () => {
  const { state, a } = gameWithTeams();
  assert.equal(adjustScore(state, a.id, 200).ok, true);
  assert.equal(adjustScore(state, a.id, -50).ok, true);
  assert.equal(a.score, 150);
  assert.equal(adjustScore(state, a.id, 2.5).ok, false);
  assert.equal(adjustScore(state, a.id, "100").ok, false);
  assert.equal(adjustScore(state, a.id, 0).ok, false);
  assert.equal(adjustScore(state, a.id, 5000).ok, false);
  assert.equal(adjustScore(state, "t99", 100).ok, false);
  assert.equal(a.score, 150);
});

test("kickTeam removes a team between questions, but not mid-question", () => {
  const { state, a, b } = gameWithTeams();
  showQuestion(state);
  openBuzzers(state, 1000);
  assert.equal(kickTeam(state, b.id).ok, false);
  reveal(state);
  assert.equal(kickTeam(state, b.id).ok, true);
  assert.equal(state.teams[b.id], undefined);
  assert.ok(state.teams[a.id]);
});

test("toggleRegistration closes and reopens sign-ups", () => {
  const { state } = gameWithTeams();
  assert.equal(toggleRegistration(state).open, false);
  assert.equal(registerTeam(state, { name: "Late", side: "prof" }).ok, false);
  toggleRegistration(state);
  assert.equal(registerTeam(state, { name: "Late", side: "prof" }).ok, true);
});

// ---- Uploading questions ------------------------------------------------------

test("replaceQuestions swaps in a valid list, only before the first question", () => {
  const { state } = gameWithTeams();
  const fresh = [{ id: "n1", type: "tf", prompt: "New?", answer: true }];
  assert.deepEqual(replaceQuestions(state, fresh), { ok: true, count: 1 });
  assert.equal(state.questions, fresh);
  showQuestion(state);
  assert.equal(replaceQuestions(state, structuredClone(QUESTIONS)).ok, false);
  assert.equal(state.questions, fresh);
});

test("a broken upload is refused with the validation message and changes nothing", () => {
  const { state } = gameWithTeams();
  const before = state.questions;
  const result = replaceQuestions(state, [{ id: "b1", type: "mc", prompt: "?", choices: ["x", "y"], answer: 5 }]);
  assert.equal(result.ok, false);
  assert.match(result.error, /Question 1 \(id "b1"\): mc answer/);
  assert.equal(state.questions, before);
  assert.equal(replaceQuestions(state, "not a list").ok, false);
});
