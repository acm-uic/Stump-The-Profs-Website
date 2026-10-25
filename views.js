// Builds the slice of state each kind of page is allowed to see.
//
// The team view is the contract between the server and player.js. Its shape:
//   phase, questionNumber, questionTotal, question { type, prompt, choices?, category?, points, answer? }
//   teams [{ id, name, side, score, rank }], sides { student, prof }, buzzes, floorTeam, upNext, attempted
//   answerRemainingMs, answerTotalMs, lockInCount, lockInPoints, result
//   me { id, name, side, score, code, rank, rankOf }
//   buzzer: "locked" | "ready" | "buzzed" | "floor" | "tried" | "over", place (number or null)
//   myLockIn, canLockIn
//   stats { buzzesWon, correct, wrong, steals, accuracy, avgReactionMs, fastestReactionMs, lockInHits }
//   history [{ questionNumber, type, result, points }]
// player.js may only read these fields.
// The server never sends the raw state: it holds the answers and every team's
// rejoin code, and anything sent to a browser can be read in its developer tools.
// Views only copy; they never change the state.

import { ANSWER_SECONDS } from "./config.js";
import { currentQuestion, upNext } from "./game.js";
import { pointsFor, lockInPoints } from "./scoring.js";

function questionFor(state, includeAnswer) {
  const q = currentQuestion(state);
  if (!q) return null;
  const { answer, points, id, ...rest } = q;
  const shown = { ...rest, points: pointsFor(q) };
  if (includeAnswer) shown.answer = answer;
  return shown;
}

// Competition ranking: tied teams share a rank, and the next rank is skipped (1, 1, 3).
export function rankOf(teams, teamId) {
  const me = teams.find((t) => t.id === teamId);
  return 1 + teams.filter((t) => t.score > me.score).length;
}

// What the team's buzzer should show. Most specific checks first.
export function buzzerState(state, teamId) {
  const current = state.current;
  if (state.phase === "lobby" || state.phase === "preview") return { buzzer: "locked", place: null };
  if (state.phase === "revealed") return { buzzer: "over", place: null };
  if (current.activeTeamId === teamId) return { buzzer: "floor", place: null };
  if (current.attempted.includes(teamId)) return { buzzer: "tried", place: null };
  if (state.phase === "open") return { buzzer: "ready", place: null };
  // Someone else is answering. This team is waiting in the steal order.
  const index = upNext(state).indexOf(teamId);
  const buzzed = current.buzzes.some((b) => b.teamId === teamId);
  return { buzzer: buzzed ? "buzzed" : "ready", place: index >= 0 ? index + 1 : null };
}

export function teamStats(team) {
  const { buzzesWon, correct, wrong, steals, reactionTimes, lockInHits } = team.stats;
  const attempts = correct + wrong;
  return {
    buzzesWon, correct, wrong, steals, lockInHits,
    accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : null,
    avgReactionMs: reactionTimes.length > 0
      ? Math.round(reactionTimes.reduce((sum, ms) => sum + ms, 0) / reactionTimes.length)
      : null,
    fastestReactionMs: reactionTimes.length > 0 ? Math.min(...reactionTimes) : null,
  };
}

// One line per finished question, from this team's point of view.
export function teamHistory(state, teamId) {
  return state.history.map((record) => {
    let result = "—";
    let points = 0;
    if (record.winnerTeamId === teamId) {
      result = record.attempted[0] === teamId ? "Correct" : "Steal";
      points = record.points;
    } else if (record.lockInsAwarded.includes(teamId)) {
      result = "Lock-in";
      points = record.lockInPoints;
    } else if (record.attempted.includes(teamId)) {
      result = "Wrong";
    }
    return { questionNumber: record.questionNumber, type: record.type, result, points };
  });
}

function teamSummary(team) {
  if (!team) return null;
  return { id: team.id, name: team.name, side: team.side };
}

export function publicView(state, now) {
  const current = state.current;
  const answering = state.phase === "answering";
  return {
    phase: state.phase,
    questionNumber: state.questionIndex + 1,
    questionTotal: state.questions.length,
    question: questionFor(state, state.phase === "revealed"),
    teams: Object.values(state.teams)
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map(({ id, name, side, score }) => ({
        id, name, side, score, rank: rankOf(Object.values(state.teams), id),
      })),
    sides: {
      student: Object.values(state.teams).filter((t) => t.side === "student").reduce((sum, t) => sum + t.score, 0),
      prof: Object.values(state.teams).filter((t) => t.side === "prof").reduce((sum, t) => sum + t.score, 0),
    },
    buzzes: current.buzzes.map(({ teamId, at }) => ({
      teamId,
      name: state.teams[teamId]?.name ?? "?",
      ms: at - current.openedAt,
    })),
    floorTeam: answering ? teamSummary(state.teams[current.activeTeamId]) : null,
    upNext: answering ? upNext(state).map((id) => teamSummary(state.teams[id])) : [],
    attempted: current.attempted.map((id) => teamSummary(state.teams[id])),
    answerTotalMs: ANSWER_SECONDS * 1000,
    answerRemainingMs: answering
      ? Math.max(0, current.answeringSince + ANSWER_SECONDS * 1000 - now)
      : null,
    lockInCount: Object.keys(current.lockIns).length,
    lockInPoints: currentQuestion(state) ? lockInPoints(currentQuestion(state)) : 0,
    result:
      state.phase === "revealed"
        ? {
            winner: teamSummary(state.teams[current.winnerTeamId]),
            points: current.pointsAwarded,
            lockInWinners: Object.entries(current.lockIns)
              .filter(([, entry]) => entry.awarded)
              .map(([id]) => teamSummary(state.teams[id])),
          }
        : null,
  };
}

export function teamView(state, teamId, now) {
  const team = state.teams[teamId];
  const current = state.current;
  const entry = current.lockIns[teamId];
  const lockInsAllowed = ["preview", "open", "answering"].includes(state.phase) && current.lockInsOpen;
  return {
    ...publicView(state, now),
    me: {
      id: team.id, name: team.name, side: team.side, score: team.score, code: team.code,
      rank: rankOf(Object.values(state.teams), teamId), rankOf: Object.keys(state.teams).length,
    },
    ...buzzerState(state, teamId),
    stats: teamStats(team),
    history: teamHistory(state, teamId),
    // Only this team's own lock-in, and whether it was right only once the answer is out.
    myLockIn: entry
      ? { answer: entry.answer, correct: state.phase === "revealed" ? entry.correct : undefined, awarded: entry.awarded }
      : null,
    canLockIn: lockInsAllowed && !entry && current.activeTeamId !== teamId && !current.attempted.includes(teamId),
  };
}

export function adminView(state, now) {
  const view = publicView(state, now);
  return {
    ...view,
    question: questionFor(state, true),
    teams: view.teams.map((t) => ({ ...t, code: state.teams[t.id].code })),
    registrationOpen: state.registrationOpen,
    lockIns: Object.entries(state.current.lockIns).map(([id, entry]) => ({
      teamId: id,
      name: state.teams[id]?.name ?? "?",
      ...entry,
    })),
    questionList: state.questions.map((q, i) => ({
      number: i + 1,
      type: q.type,
      prompt: q.prompt,
      played: i <= state.questionIndex,
    })),
  };
}
