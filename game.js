// All game rules live here. Nothing in this file knows about sockets or browsers:
// every function takes the state object, changes it, and gives back a result
// object, either { ok: true, ... } or { ok: false, error }.

const SIDES = ["student", "prof"];
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0, I/1 look-alikes
const MAX_NAME_LENGTH = 30;

export function createGame() {
  return {
    phase: "lobby",
    teams: {},
    nextJoinOrder: 1,
    registrationOpen: true,
    current: { buzzes: [] },
  };
}

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

export function buzz(state, teamId, now) {
  if (!state.teams[teamId]) return { ok: false, error: "Unknown team" };
  if (state.current.buzzes.some((b) => b.teamId === teamId)) {
    return { ok: false, error: "Already buzzed" };
  }
  state.current.buzzes.push({ teamId, at: now });
  return { ok: true };
}

// Temporary, for the display's Reset button. Chunk 3 replaces it with real question phases.
export function clearBuzzes(state) {
  state.current.buzzes = [];
  return { ok: true };
}

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
