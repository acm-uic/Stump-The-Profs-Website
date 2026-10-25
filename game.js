// All game rules live here. Nothing in this file knows about sockets or browsers:
// every function takes the state object, changes it, and gives back a result
// object, either { ok: true, ... } or { ok: false, error }.
//
// A question moves through phases:
//   lobby -> preview (question shown) -> open (buzzers live) -> answering (a team has the floor)
//         -> revealed (answer shown) -> preview (next question) ...
// Every action first checks it is allowed in the current phase.

import { pointsFor, lockInPoints, autoCheck } from "./scoring.js";
import { LOCKIN_MAX_LENGTH } from "./config.js";
import { stealOrder } from "./turns.js";

const SIDES = ["student", "prof"];
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0, I/1 look-alikes
const MAX_NAME_LENGTH = 30;

function freshCurrent() {
  return {
    openedAt: null,       // server time the buzzers opened
    buzzes: [],           // { teamId, at } in arrival order
    attempted: [],        // team ids that have answered aloud
    activeTeamId: null,   // team with the floor
    answeringSince: null, // when that team got the floor
    winnerTeamId: null,
    pointsAwarded: 0,
    lockIns: {},          // teamId -> { answer, correct: true | false | null, awarded }
    lockInsOpen: true,    // closes at the first judgement, so nobody copies a spoken answer
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
  };
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
  state.phase = "preview";
  return { ok: true };
}

export function openBuzzers(state, now) {
  if (state.phase !== "preview") return { ok: false, error: "Show a question first" };
  state.current.openedAt = now;
  state.phase = "open";
  return { ok: true };
}

export function buzz(state, teamId, now) {
  if (state.phase !== "open" && state.phase !== "answering") {
    return { ok: false, error: "Buzzers are not open" };
  }
  const team = state.teams[teamId];
  if (!team) return { ok: false, error: "Unknown team" };
  const current = state.current;
  if (current.buzzes.some((b) => b.teamId === teamId)) return { ok: false, error: "Already buzzed" };

  current.buzzes.push({ teamId, at: now });

  // The first buzz wins the floor. Later buzzes still count: the steal order uses them.
  if (current.activeTeamId === null) {
    current.activeTeamId = teamId;
    current.answeringSince = now;
    team.stats.buzzesWon += 1;
    team.stats.reactionTimes.push(now - current.openedAt);
    state.phase = "answering";
  }
  return { ok: true };
}

export function judge(state, correct, now) {
  if (state.phase !== "answering") return { ok: false, error: "No team is answering" };
  if (typeof correct !== "boolean") return { ok: false, error: "Judge needs correct: true or false" };

  const current = state.current;
  const team = state.teams[current.activeTeamId];
  const isSteal = current.attempted.length > 0;
  current.attempted.push(team.id);
  current.lockInsOpen = false;

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
  const next = upNext(state)[0];
  if (next) {
    // Pass the floor to the next team in the steal order, with a fresh answer clock.
    current.activeTeamId = next;
    current.answeringSince = now;
  } else {
    endQuestion(state); // every team has tried
  }
  return { ok: true };
}

// Who would get the floor next, in order, if the current team is wrong.
export function upNext(state) {
  const current = state.current;
  const tried = current.activeTeamId ? [...current.attempted, current.activeTeamId] : current.attempted;
  const order = stealOrder(Object.values(state.teams), current.buzzes, tried);
  return order.filter((id) => !tried.includes(id));
}

export function reveal(state) {
  if (state.phase !== "open" && state.phase !== "answering") {
    return { ok: false, error: "Nothing to reveal right now" };
  }
  endQuestion(state);
  return { ok: true };
}

// Everything that happens when a question ends, whichever way it ended.
function endQuestion(state) {
  state.current.activeTeamId = null;
  state.current.answeringSince = null;
  state.current.lockInsOpen = false;
  state.phase = "revealed";
  const question = currentQuestion(state);
  state.history.push({
    questionNumber: state.questionIndex + 1,
    type: question.type,
    points: pointsFor(question),
    lockInPoints: lockInPoints(question),
    winnerTeamId: state.current.winnerTeamId,
    attempted: [...state.current.attempted],
    lockInsAwarded: [],
  });
  settleLockIns(state);
}

// ---- Lock-ins -------------------------------------------------------------

// A team without the floor secretly commits to an answer, once per question.
export function lockIn(state, teamId, answer) {
  const team = state.teams[teamId];
  if (!team) return { ok: false, error: "Unknown team" };
  if (!["preview", "open", "answering"].includes(state.phase) || !state.current.lockInsOpen) {
    return { ok: false, error: "Lock-ins are closed" };
  }
  const current = state.current;
  if (current.activeTeamId === teamId || current.attempted.includes(teamId)) {
    return { ok: false, error: "You have the floor, so answer out loud" };
  }
  if (current.lockIns[teamId]) return { ok: false, error: "You already locked in" };

  const question = currentQuestion(state);
  if (question.type === "mc" && !(Number.isInteger(answer) && answer >= 0 && answer < question.choices.length)) {
    return { ok: false, error: "Pick one of the choices" };
  }
  if (question.type === "tf" && typeof answer !== "boolean") return { ok: false, error: "Pick true or false" };
  if (question.type === "free") {
    if (typeof answer !== "string" || answer.trim() === "") return { ok: false, error: "Type an answer" };
    if (answer.length > LOCKIN_MAX_LENGTH) {
      return { ok: false, error: `Answers can be at most ${LOCKIN_MAX_LENGTH} characters` };
    }
  }

  const cleanAnswer = typeof answer === "string" ? answer.trim() : answer;
  current.lockIns[teamId] = { answer: cleanAnswer, correct: autoCheck(question, cleanAnswer), awarded: false };
  return { ok: true };
}

// After the reveal, the host marks a free-response lock-in right or wrong.
export function markLockIn(state, teamId, correct) {
  if (state.phase !== "revealed") return { ok: false, error: "Mark lock-ins after the reveal" };
  const entry = state.current.lockIns[teamId];
  if (!entry) return { ok: false, error: "That team did not lock in" };
  if (typeof correct !== "boolean") return { ok: false, error: "Mark needs correct: true or false" };
  entry.correct = correct;
  settleLockIns(state);
  return { ok: true };
}

// Pays out lock-ins. Safe to run any number of times: it only adds or removes the
// difference between what should have been paid and what has been paid.
// The question's winner gets no lock-in bonus on top of the full points.
function settleLockIns(state) {
  const current = state.current;
  const points = lockInPoints(currentQuestion(state));
  for (const [teamId, entry] of Object.entries(current.lockIns)) {
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
  // Keep this question's history record in step (the host may mark lock-ins after the reveal).
  const record = state.history.at(-1);
  if (record && state.phase === "revealed") {
    record.lockInsAwarded = Object.keys(current.lockIns).filter((id) => current.lockIns[id].awarded);
  }
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
