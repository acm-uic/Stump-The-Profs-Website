// All game rules live here. Nothing in this file knows about sockets or browsers:
// every function takes the state object, changes it, and gives back a result
// object, either { ok: true, ... } or { ok: false, error }.
//
// A question moves through phases:
//   lobby -> preview (question shown) -> open (buzzers live) -> answering (a team has the floor)
//         -> revealed (answer shown) -> preview (next question) ...
// Every action first checks it is allowed in the current phase.

import { pointsFor } from "./scoring.js";

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

  // The first buzz wins the floor. Later buzzes still count: Chunk 4's steal order uses them.
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
  current.attempted.push(team.id);

  if (correct) {
    const points = pointsFor(currentQuestion(state));
    team.score += points;
    team.stats.correct += 1;
    current.winnerTeamId = team.id;
    current.pointsAwarded = points;
  } else {
    team.stats.wrong += 1;
    // Chunk 4: pass the floor to the next team in the steal order instead of ending.
  }
  current.activeTeamId = null;
  current.answeringSince = null;
  state.phase = "revealed";
  return { ok: true };
}

export function reveal(state) {
  if (state.phase !== "open" && state.phase !== "answering") {
    return { ok: false, error: "Nothing to reveal right now" };
  }
  state.current.activeTeamId = null;
  state.current.answeringSince = null;
  state.phase = "revealed";
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
