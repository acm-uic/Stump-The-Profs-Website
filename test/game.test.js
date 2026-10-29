import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame, registerTeam, rejoinTeam, showQuestion, openBuzzers, buzz, closeAnswers, nextAnswer, judge, reveal,
  upNext, markAnswer, adjustScore, kickTeam, toggleRegistration, replaceQuestions, setMusic, upgradeState,
} from "../game.js";
import { joinCrowd, predict, pick } from "../crowd.js";

const QUESTIONS = [
  { id: "q1", type: "free", prompt: "Free?", answer: "yes", accept: ["yep"] },
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

test("buzzing only works while answers are open", () => {
  const { state, a } = gameWithTeams();
  assert.equal(buzz(state, a.id, "yes", 500).ok, false); // lobby
  showQuestion(state);
  assert.equal(buzz(state, a.id, "yes", 900).ok, false); // preview
  assert.deepEqual(state.current.buzzes, []);
});

test("a buzz seals the team's answer and its time; repeats, bad answers and strangers are refused", () => {
  const { state, a, b } = gameWithTeams();
  showQuestion(state, 1); // mc, 2 choices
  openBuzzers(state, 1000);
  assert.equal(buzz(state, a.id, 5, 1100).ok, false);
  assert.equal(buzz(state, a.id, "1", 1100).ok, false);
  assert.equal(buzz(state, a.id, 1, 1250).ok, true);
  assert.equal(buzz(state, a.id, 0, 1300).ok, false);
  assert.equal(buzz(state, "t99", 1, 1300).ok, false);
  assert.equal(state.phase, "open"); // nothing is read out while answers are open
  assert.deepEqual(state.current.answers[a.id], { answer: 1, correct: true, awarded: false });
  assert.deepEqual(a.stats.reactionTimes, [250]);
  assert.equal(a.stats.buzzesWon, 1);
  assert.equal(a.score, 0);
  buzz(state, b.id, 0, 1400);
  assert.equal(b.stats.buzzesWon, 0);
});

test("a buzz after the clock (plus a little grace for Wi-Fi) is refused", () => {
  const { state, a, b } = gameWithTeams();
  showQuestion(state, 2); // tf: 15 seconds
  openBuzzers(state, 0);
  assert.equal(buzz(state, a.id, true, 15_500).ok, true); // inside the grace
  const late = buzz(state, b.id, true, 16_000);
  assert.equal(late.ok, false);
  assert.match(late.error, /Time is up/);
});

test("when every team has locked in, answers close by themselves", () => {
  const { state, a, b } = gameWithTeams();
  showQuestion(state, 2);
  openBuzzers(state, 1000);
  buzz(state, a.id, true, 1100);
  assert.equal(state.phase, "open");
  buzz(state, b.id, false, 1200);
  assert.equal(state.phase, "judging");
});

test("closing with no answers goes straight to the reveal with no winner", () => {
  const { state } = gameWithTeams();
  showQuestion(state);
  openBuzzers(state, 1000);
  assert.equal(closeAnswers(state).ok, true);
  assert.equal(state.phase, "revealed");
  assert.equal(state.current.winnerTeamId, null);
});

test("answers are read fastest first; a right mc answer wins and judges itself", () => {
  const { state, a, b } = gameWithTeams();
  showQuestion(state, 1); // mc, 200 points, answer 1
  openBuzzers(state, 1000);
  buzz(state, b.id, 1, 1100); // B is faster
  assert.equal(nextAnswer(state).ok, true); // closes answers and reads B
  assert.equal(state.phase, "revealed");
  assert.equal(state.current.winnerTeamId, b.id);
  assert.equal(b.score, 200);
  assert.equal(b.stats.correct, 1);
  assert.equal(b.stats.steals, 0);
  assert.equal(a.score, 0); // never answered
});

test("a correct answer scores 300, 200 and 100 for free, mc and tf", () => {
  const { state, a } = gameWithTeams();
  let now = 1000;
  for (const [answer, expected] of [["Yes", 300], [1, 500], [true, 600]]) {
    assert.equal(showQuestion(state).ok, true);
    openBuzzers(state, now);
    buzz(state, a.id, answer, now + 100);
    nextAnswer(state);
    assert.equal(state.phase, "revealed");
    assert.equal(a.score, expected);
    now += 100_000;
  }
  assert.equal(a.stats.correct, 3);
});

test("wrong, wrong, right: the third team wins, it counts as a steal, and nobody heard anything first", () => {
  const state = createGame(structuredClone(QUESTIONS));
  const s1 = registerTeam(state, { name: "S1", side: "student" }).team;
  const s2 = registerTeam(state, { name: "S2", side: "student" }).team;
  const p1 = registerTeam(state, { name: "P1", side: "prof" }).team;
  showQuestion(state, 2); // tf, answer true
  openBuzzers(state, 1000);
  buzz(state, s1.id, false, 1100);
  buzz(state, s2.id, true, 1200);
  buzz(state, p1.id, false, 1300); // all in: judging
  nextAnswer(state); // S1 wrong
  assert.equal(state.phase, "judging");
  assert.deepEqual(upNext(state), [p1.id, s2.id]); // alternate sides
  nextAnswer(state); // P1 wrong
  nextAnswer(state); // S2 right
  assert.equal(state.current.winnerTeamId, s2.id);
  assert.equal(s2.score, 100);
  assert.equal(s2.stats.steals, 1);
  assert.equal(s1.stats.wrong, 1);
  assert.equal(p1.stats.wrong, 1);
  assert.deepEqual(state.current.attempted, [s1.id, p1.id, s2.id]);
});

test("with 3 and 3 teams the reading order is fastest first, then alternating sides", () => {
  const state = createGame(structuredClone(QUESTIONS));
  const ids = ["S1", "S2", "S3", "P1", "P2", "P3"].map(
    (name) => registerTeam(state, { name, side: name[0] === "S" ? "student" : "prof" }).team.id,
  );
  showQuestion(state, 2);
  openBuzzers(state, 1000);
  // P3 fastest, then S2, S1, P1, S3, P2. Everyone is wrong.
  [5, 1, 0, 3, 2, 4].forEach((i, n) => buzz(state, ids[i], false, 1100 + n));
  const names = upNext(state).map((id) => state.teams[id].name);
  assert.deepEqual(names, ["P3", "S2", "P1", "S1", "P2", "S3"]);
  for (let i = 0; i < 6; i++) nextAnswer(state);
  assert.equal(state.phase, "revealed");
  assert.equal(state.current.winnerTeamId, null);
});

test("a free answer that is not an exact match waits for the host", () => {
  const { state, a, b } = gameWithTeams();
  showQuestion(state, 0); // free, answer "yes", also accepts "yep"
  openBuzzers(state, 1000);
  buzz(state, a.id, "  yeah ", 1100);
  buzz(state, b.id, "YEP", 1200);
  nextAnswer(state); // reads A: "yeah" needs the host
  assert.equal(state.current.activeTeamId, a.id);
  assert.equal(nextAnswer(state).ok, false); // must judge first
  assert.equal(judge(state, "yes").ok, false);
  assert.equal(judge(state, false).ok, true);
  nextAnswer(state); // B: "YEP" is an accepted spelling, judged automatically
  assert.equal(state.current.winnerTeamId, b.id);
  assert.equal(b.score, 300);
});

test("judge is refused when no answer is waiting", () => {
  const { state, a } = gameWithTeams();
  assert.equal(judge(state, true).ok, false);
  showQuestion(state, 1);
  openBuzzers(state, 1000);
  buzz(state, a.id, 1, 1100);
  assert.equal(judge(state, true).ok, false); // still open
});

test("every other correct answer gets 25%, even ones never read out; wrong pays nothing", () => {
  const state = createGame(structuredClone(QUESTIONS));
  const a = registerTeam(state, { name: "A", side: "student" }).team;
  const b = registerTeam(state, { name: "B", side: "prof" }).team;
  const c = registerTeam(state, { name: "C", side: "student" }).team;
  showQuestion(state, 1); // mc, 200, answer 1
  openBuzzers(state, 1000);
  buzz(state, a.id, 1, 1100);
  buzz(state, b.id, 1, 1200);
  buzz(state, c.id, 0, 1300);
  nextAnswer(state); // A right, wins
  assert.equal(a.score, 200);
  assert.equal(b.score, 50);
  assert.equal(b.stats.lockInHits, 1);
  assert.equal(c.score, 0);
  assert.deepEqual(state.history.at(-1).lockInsAwarded, [b.id]);
});

test("free answers can be marked after the reveal; marking is idempotent and reversible", () => {
  const { state, a, b } = gameWithTeams();
  showQuestion(state, 0);
  openBuzzers(state, 1000);
  buzz(state, a.id, "yes", 1100);
  buzz(state, b.id, "yess", 1200);
  assert.equal(markAnswer(state, b.id, true).ok, false); // not revealed yet
  nextAnswer(state); // A exact, wins
  assert.equal(markAnswer(state, a.id, false).ok, false); // the winner is not re-marked here
  markAnswer(state, b.id, true);
  markAnswer(state, b.id, true);
  assert.equal(b.score, 75);
  markAnswer(state, b.id, false);
  assert.equal(b.score, 0);
  assert.equal(b.stats.lockInHits, 0);
});

test("reveal ends the question at any point, settling what is known", () => {
  const { state, a, b } = gameWithTeams();
  showQuestion(state, 2);
  openBuzzers(state, 1000);
  buzz(state, a.id, true, 1100);
  assert.equal(reveal(state).ok, true);
  assert.equal(state.phase, "revealed");
  assert.equal(state.current.winnerTeamId, null);
  assert.equal(a.score, 25); // right but never read out
  assert.equal(b.score, 0);
});

test("actions in the wrong phase are refused", () => {
  const { state } = gameWithTeams();
  assert.equal(openBuzzers(state, 1000).ok, false); // nothing shown yet
  assert.equal(nextAnswer(state).ok, false);
  assert.equal(reveal(state).ok, false);
  showQuestion(state);
  assert.equal(showQuestion(state).ok, false); // mid-question
  assert.equal(closeAnswers(state).ok, false);
  openBuzzers(state, 1000);
  assert.equal(openBuzzers(state, 1001).ok, false); // double click
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

test("ending a question settles the crowd, and showing the next one clears it", () => {
  const { state, a, b } = gameWithTeams();
  const crowd = state.crowd;
  const ana = joinCrowd(crowd, "Ana").spectator.id;
  const ben = joinCrowd(crowd, "Ben").spectator.id;
  showQuestion(state, 1); // mc, answer 1
  predict(crowd, ana, "prof", state.phase);
  predict(crowd, ben, "student", state.phase);
  openBuzzers(state, 1000);
  pick(crowd, ana, 1, state.phase, state.questions[1]);
  buzz(state, a.id, 0, 1100); // student wrong
  buzz(state, b.id, 1, 1200); // prof right
  nextAnswer(state);
  nextAnswer(state);
  assert.equal(b.score, 200);
  assert.equal(crowd.spectators[ana].score, 20); // right prediction and right pick
  assert.equal(crowd.spectators[ben].score, 0);
  showQuestion(state);
  assert.deepEqual(crowd.predictions, {});
});

// ---- Music ----------------------------------------------------------------------

test("setMusic takes a YouTube link, play and volume, and refuses anything else whole", () => {
  const state = createGame();
  assert.equal(setMusic(state, { background: "https://youtu.be/dQw4w9WgXcQ?t=30", playing: true, volume: 40 }).ok, true);
  assert.deepEqual(state.music, { background: "https://youtu.be/dQw4w9WgXcQ?t=30", playing: true, volume: 40 });
  assert.equal(setMusic(state, { background: "https://example.com/song.mp3" }).ok, false);
  assert.equal(setMusic(state, { playing: false, volume: 101 }).ok, false);
  assert.equal(state.music.playing, true); // a refused change changes nothing
  setMusic(state, { background: "" });
  assert.equal(state.music.background, null);
});

// ---- Older saves ------------------------------------------------------------------

test("upgradeState brings a save from the lock-in version up to date", () => {
  const old = createGame(structuredClone(QUESTIONS));
  delete old.music;
  old.phase = "answering";
  old.questionIndex = 1;
  old.current = { buzzes: [{ teamId: "t1", at: 5 }], attempted: [], activeTeamId: "t1", lockIns: {}, lockInsOpen: true, answeringSince: 5 };
  old.history = [{ questionNumber: 1, attempted: [], lockInsAwarded: [] }];
  upgradeState(old);
  assert.equal(old.phase, "preview");
  assert.deepEqual(old.current.answers, {});
  assert.deepEqual(old.history[0].answered, []);
  assert.equal(old.music.playing, false);
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
