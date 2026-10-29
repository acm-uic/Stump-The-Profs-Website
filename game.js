// All game rules live here. Nothing in this file knows about sockets or browsers:
// every function takes the state object, changes it, and gives back a result
// object, either { ok: true, ... } or { ok: false, error }.
//
// A question moves through phases:
//   lobby -> preview (question shown) -> open (teams pick an answer and press BUZZ to lock it in)
//         -> judging (sealed answers read out one by one) -> revealed (answer shown) -> preview ...
// Nobody says an answer out loud until every answer is sealed, so nobody can copy one.
// Every action first checks it is allowed in the current phase.

import { pointsFor, lockInPoints, autoCheck, answerSeconds } from "./scoring.js";
import { validateQuestions } from "./store.js";
import { LOCKIN_MAX_LENGTH, MAX_ADJUST, LATE_GRACE_MS } from "./config.js";
import { stealOrder } from "./turns.js";
import { createCrowd, startQuestion, settleQuestion } from "./crowd.js";
import { parseYouTube } from "./music.js";

const SIDES = ["student", "prof"];
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0, I/1 look-alikes
const MAX_NAME_LENGTH = 30;

function freshCurrent() {
  return {
    openedAt: null,       // server time the answers opened
    buzzes: [],           // { teamId, at }: the order teams locked in their answers
    answers: {},          // teamId -> { answer, correct: true | false | null, awarded }
    attempted: [],        // team ids whose answers have been read out and judged, in order
    activeTeamId: null,   // team whose answer is being read out, waiting for the host
    winnerTeamId: null,
    pointsAwarded: 0,
  };
}

export function createGame(questions = []) {
  return {
    phase: "lobby",
    questions,
    questionIndex: -1,
    teams: {},
    nextJoinOrder: 1,
    registrationOpen: true,
    current: freshCurrent(),
    history: [], // one record per finished question, used for each team's history and stats
    crowd: createCrowd(), // spectators and their predictions, picks and scores
    music: { background: null, playing: false, volume: 60 }, // played by the projector
  };
}

// A game saved by an older version (lock-ins, an "answering" phase, no music) is
// brought up to date on load. A question that was mid-play goes back to its preview,
// so the host simply opens answers again.
export function upgradeState(state) {
  state.music ??= { background: null, playing: false, volume: 60 };
  for (const record of state.history) record.answered ??= [];
  const current = state.current;
  if (!current.answers) {
    current.answers = current.lockIns ?? {};
    delete current.lockIns;
    delete current.lockInsOpen;
    delete current.answeringSince;
  }
  if (!["lobby", "preview", "open", "judging", "revealed"].includes(state.phase)) {
    state.current = freshCurrent();
    state.phase = state.questionIndex >= 0 ? "preview" : "lobby";
  }
  return state;
}

export function currentQuestion(state) {
  return state.questions[state.questionIndex] ?? null;
}

// ---- Teams --------------------------------------------------------------

export function registerTeam(state, { name, side } = {}) {
  const cleanName = typeof name === "string" ? name.trim() : "";

  if (!state.registrationOpen) return { ok: false, error: "Registration is closed" };
  if (cleanName === "") return { ok: false, error: "Enter a team name" };
  if (cleanName.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Team names can be at most ${MAX_NAME_LENGTH} characters` };
  }
  if (!SIDES.includes(side)) return { ok: false, error: "Pick a side: student or prof" };
  const taken = Object.values(state.teams).some(
    (t) => t.name.toLowerCase() === cleanName.toLowerCase(),
  );
  if (taken) return { ok: false, error: "That name is taken" };

  // Every check passed. Only now do we change the state.
  const joinOrder = state.nextJoinOrder++;
  const team = {
    id: `t${joinOrder}`,
    name: cleanName,
    side,
    code: makeCode(state),
    score: 0,
    joinOrder,
    stats: { buzzesWon: 0, correct: 0, wrong: 0, steals: 0, reactionTimes: [], lockInHits: 0 },
  };
  state.teams[team.id] = team;
  return { ok: true, team };
}

export function rejoinTeam(state, code) {
  const wanted = typeof code === "string" ? code.trim().toUpperCase() : "";
  const team = Object.values(state.teams).find((t) => t.code === wanted);
  if (!team) return { ok: false, error: "No team has that code" };
  return { ok: true, team };
}

// ---- Host fixes ------------------------------------------------------------

// Add or remove points by hand, e.g. after a disputed ruling.
export function adjustScore(state, teamId, delta) {
  const team = state.teams[teamId];
  if (!team) return { ok: false, error: "Unknown team" };
  if (!Number.isInteger(delta) || delta === 0) return { ok: false, error: "Enter a whole number of points" };
  if (Math.abs(delta) > MAX_ADJUST) return { ok: false, error: `Adjust by at most ${MAX_ADJUST} at a time` };
  team.score += delta;
  return { ok: true };
}

// Remove a team. Only between questions, so nobody's reading order or answers change mid-question.
export function kickTeam(state, teamId) {
  if (!state.teams[teamId]) return { ok: false, error: "Unknown team" };
  if (state.phase === "open" || state.phase === "judging") {
    return { ok: false, error: "Remove teams between questions" };
  }
  delete state.teams[teamId];
  return { ok: true };
}

// Replace the question list with an uploaded one. Only before the first question, so
// a half-played game never switches questions under people. (Reset first to reuse.)
export function replaceQuestions(state, list) {
  if (state.phase !== "lobby") return { ok: false, error: "Upload questions before the first question (Reset first if needed)" };
  try {
    validateQuestions(list);
  } catch (error) {
    return { ok: false, error: error.message };
  }
  state.questions = list;
  state.questionIndex = -1;
  return { ok: true, count: list.length };
}

export function toggleRegistration(state) {
  state.registrationOpen = !state.registrationOpen;
  return { ok: true, open: state.registrationOpen };
}

// ---- Question phases ------------------------------------------------------

export function showQuestion(state, index) {
  if (state.phase !== "lobby" && state.phase !== "revealed") {
    return { ok: false, error: "Finish the current question first" };
  }
  if (state.questions.length === 0) return { ok: false, error: "There are no questions loaded" };
  const target = index ?? state.questionIndex + 1;
  if (!Number.isInteger(target) || target < 0 || target >= state.questions.length) {
    return { ok: false, error: "There is no question at that position" };
  }
  state.questionIndex = target;
  state.current = freshCurrent();
  startQuestion(state.crowd);
  state.phase = "preview";
  return { ok: true };
}

export function openBuzzers(state, now) {
  if (state.phase !== "preview") return { ok: false, error: "Show a question first" };
  state.current.openedAt = now;
  state.phase = "open";
  return { ok: true };
}

// When the answer window closes, in server time.
export function answerDeadline(state) {
  const question = currentQuestion(state);
  if (!question || state.current.openedAt === null) return null;
  return state.current.openedAt + answerSeconds(question) * 1000;
}

// What is wrong with an answer for this question, or null when it is a valid answer.
function answerProblem(question, answer) {
  if (question.type === "mc" && !(Number.isInteger(answer) && answer >= 0 && answer < question.choices.length)) {
    return "Pick one of the choices";
  }
  if (question.type === "tf" && typeof answer !== "boolean") return "Pick true or false";
  if (question.type === "free") {
    if (typeof answer !== "string" || answer.trim() === "") return "Type an answer";
    if (answer.length > LOCKIN_MAX_LENGTH) return `Answers can be at most ${LOCKIN_MAX_LENGTH} characters`;
  }
  return null;
}

// BUZZ: a team locks in its answer, sealed. Only the host sees it until it is read out.
// The buzz order decides who is read first, so it still pays to be fast.
export function buzz(state, teamId, answer, now) {
  if (state.phase !== "open") return { ok: false, error: "Answers are not open" };
  const team = state.teams[teamId];
  if (!team) return { ok: false, error: "Unknown team" };
  const current = state.current;
  if (current.answers[teamId]) return { ok: false, error: "You already locked in" };
  if (now > answerDeadline(state) + LATE_GRACE_MS) return { ok: false, error: "Time is up" };

  const question = currentQuestion(state);
  const problem = answerProblem(question, answer);
  if (problem) return { ok: false, error: problem };

  const cleanAnswer = typeof answer === "string" ? answer.trim() : answer;
  current.buzzes.push({ teamId, at: now });
  current.answers[teamId] = { answer: cleanAnswer, correct: autoCheck(question, cleanAnswer), awarded: false };
  if (current.buzzes.length === 1) team.stats.buzzesWon += 1;
  team.stats.reactionTimes.push(now - current.openedAt);

  // Every team is in: no reason to make the room wait for the clock.
  if (current.buzzes.length === Object.keys(state.teams).length) closeAnswers(state);
  return { ok: true };
}

// Stop taking answers. Nothing has been said aloud yet; reading starts now.
export function closeAnswers(state) {
  if (state.phase !== "open") return { ok: false, error: "Answers are not open" };
  if (state.current.buzzes.length === 0) {
    endQuestion(state); // nobody answered: straight to the reveal
    return { ok: true };
  }
  state.phase = "judging";
  return { ok: true };
}

// Read out the next sealed answer. Multiple choice, true/false and exact free-response
// matches judge themselves; anything else waits for the host's Correct or Wrong.
export function nextAnswer(state) {
  if (state.phase === "open") {
    const closed = closeAnswers(state);
    if (!closed.ok || state.phase !== "judging") return closed;
  }
  if (state.phase !== "judging") return { ok: false, error: "Open the answers first" };
  const current = state.current;
  if (current.activeTeamId) return { ok: false, error: "Mark this answer Correct or Wrong first" };

  const next = upNext(state)[0];
  if (!next) {
    endQuestion(state);
    return { ok: true };
  }
  current.activeTeamId = next;
  const known = current.answers[next].correct;
  return known === null ? { ok: true } : judge(state, known);
}

// The host's ruling on the answer being read out.
export function judge(state, correct) {
  const current = state.current;
  if (state.phase !== "judging" || !current.activeTeamId) {
    return { ok: false, error: "No answer is waiting to be judged" };
  }
  if (typeof correct !== "boolean") return { ok: false, error: "Judge needs correct: true or false" };

  const team = state.teams[current.activeTeamId];
  const isSteal = current.attempted.length > 0;
  current.answers[team.id].correct = correct;
  current.attempted.push(team.id);
  current.activeTeamId = null;

  if (correct) {
    const points = pointsFor(currentQuestion(state));
    team.score += points;
    team.stats.correct += 1;
    if (isSteal) team.stats.steals += 1;
    current.winnerTeamId = team.id;
    current.pointsAwarded = points;
    endQuestion(state);
    return { ok: true };
  }

  team.stats.wrong += 1;
  if (upNext(state).length === 0) endQuestion(state); // every answer has been read
  return { ok: true };
}

// The order the remaining sealed answers will be read in. The fastest lock-in goes
// first; after that, the steal order alternates sides (see turns.js).
export function upNext(state) {
  const current = state.current;
  const tried = current.activeTeamId ? [...current.attempted, current.activeTeamId] : current.attempted;
  const answered = Object.values(state.teams).filter((t) => current.answers[t.id]);
  const fastest = current.buzzes.find((b) => state.teams[b.teamId])?.teamId;
  const order = tried.length === 0 && fastest
    ? [fastest, ...stealOrder(answered, current.buzzes, [fastest])]
    : stealOrder(answered, current.buzzes, tried);
  return order.filter((id) => !tried.includes(id));
}

// Show the answer now, whatever is still unread.
export function reveal(state) {
  if (state.phase !== "open" && state.phase !== "judging") {
    return { ok: false, error: "Nothing to reveal right now" };
  }
  endQuestion(state);
  return { ok: true };
}

// Everything that happens when a question ends, whichever way it ended.
function endQuestion(state) {
  state.current.activeTeamId = null;
  state.phase = "revealed";
  const question = currentQuestion(state);
  state.history.push({
    questionNumber: state.questionIndex + 1,
    type: question.type,
    points: pointsFor(question),
    lockInPoints: lockInPoints(question),
    winnerTeamId: state.current.winnerTeamId,
    attempted: [...state.current.attempted],
    answered: Object.keys(state.current.answers),
    lockInsAwarded: [],
  });
  settleLockIns(state);
  const winner = state.teams[state.current.winnerTeamId];
  settleQuestion(state.crowd, { winnerSide: winner?.side ?? null, question });
}

// ---- Answers after the reveal ------------------------------------------------

// After the reveal, the host marks a free-response answer right or wrong, for
// answers that were never read out or that a typo kept from matching.
export function markAnswer(state, teamId, correct) {
  if (state.phase !== "revealed") return { ok: false, error: "Mark answers after the reveal" };
  const entry = state.current.answers[teamId];
  if (!entry) return { ok: false, error: "That team did not lock in" };
  if (typeof correct !== "boolean") return { ok: false, error: "Mark needs correct: true or false" };
  if (teamId === state.current.winnerTeamId) return { ok: false, error: "That team already won the question" };
  entry.correct = correct;
  settleLockIns(state);
  return { ok: true };
}

// Pays the smaller share to every correct answer except the winner's. Safe to run any
// number of times: it only adds or removes the difference between what should have
// been paid and what has been paid.
function settleLockIns(state) {
  const current = state.current;
  const points = lockInPoints(currentQuestion(state));
  for (const [teamId, entry] of Object.entries(current.answers)) {
    const team = state.teams[teamId];
    if (!team) continue;
    const shouldPay = entry.correct === true && teamId !== current.winnerTeamId;
    if (shouldPay && !entry.awarded) {
      team.score += points;
      team.stats.lockInHits += 1;
      entry.awarded = true;
    } else if (!shouldPay && entry.awarded) {
      team.score -= points;
      team.stats.lockInHits -= 1;
      entry.awarded = false;
    }
  }
  // Keep this question's history record in step (the host may mark answers after the reveal).
  const record = state.history.at(-1);
  if (record && state.phase === "revealed") {
    record.lockInsAwarded = Object.keys(current.answers).filter((id) => current.answers[id].awarded);
  }
}

// ---- Music ------------------------------------------------------------------

// The host sets a background link (or clears it with an empty one), starts or stops
// the music, and sets the volume. The projector does the playing.
export function setMusic(state, { background, playing, volume } = {}) {
  const clearing = background === null || background === "";
  if (background !== undefined && !clearing && !parseYouTube(background)) {
    return { ok: false, error: "That is not a YouTube link this can play" };
  }
  if (playing !== undefined && typeof playing !== "boolean") return { ok: false, error: "playing must be true or false" };
  if (volume !== undefined && !(Number.isInteger(volume) && volume >= 0 && volume <= 100)) {
    return { ok: false, error: "Volume goes from 0 to 100" };
  }

  // Every check passed. Only now do we change the state.
  const music = state.music ?? (state.music = { background: null, playing: false, volume: 60 });
  if (background !== undefined) music.background = clearing ? null : background.trim();
  if (playing !== undefined) music.playing = playing;
  if (volume !== undefined) music.volume = volume;
  return { ok: true };
}

// ---- Helpers --------------------------------------------------------------

function makeCode(state) {
  const used = new Set(Object.values(state.teams).map((t) => t.code));
  let code;
  do {
    code = "";
    for (let i = 0; i < 4; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
  } while (used.has(code));
  return code;
}
