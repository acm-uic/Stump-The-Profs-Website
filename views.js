// Builds the slice of state each kind of page is allowed to see.
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
      .map(({ id, name, side, score }) => ({ id, name, side, score })),
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
    me: { id: team.id, name: team.name, side: team.side, score: team.score, code: team.code },
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
