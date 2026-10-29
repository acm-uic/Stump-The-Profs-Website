// Builds the slice of state each kind of page is allowed to see.
//
// The team view is the contract between the server and player.js. Its shape:
//   phase, questionNumber, questionTotal, question { type, prompt, choices?, category?, points, answer? }
//   teams [{ id, name, side, score, rank }], sides { student, prof }, buzzes, floorTeam, upNext
//   readOut [{ team, answer, correct }], answerRemainingMs, answerTotalMs, answerCount
//   lockInPoints, result, crowd, answersOpen, music
//   me { id, name, side, score, code, rank, rankOf }
//   buzzer: "locked" | "ready" | "buzzed" | "floor" | "tried" | "missed" | "over", place (number or null)
//   myAnswer, canAnswer
//   stats { buzzesWon, correct, wrong, steals, accuracy, avgReactionMs, fastestReactionMs, lockInHits }
//   history [{ questionNumber, type, result, points }]
// player.js may only read these fields.
// The server never sends the raw state: it holds the answers, every team's sealed
// answer and every rejoin code, and anything sent to a browser can be read in its
// developer tools. A sealed answer reaches other pages only once it has been read out.
// Views only copy; they never change the state.

import { currentQuestion, upNext, answerDeadline } from "./game.js";
import { pointsFor, lockInPoints, answerSeconds } from "./scoring.js";
import { crowdView } from "./crowd.js";
import { parseYouTube } from "./music.js";

function questionFor(state, includeAnswer) {
  const q = currentQuestion(state);
  if (!q) return null;
  // Copy only the fields a page may see: never the answer (until the reveal), its other
  // accepted spellings, or the raw music link.
  const { type, prompt, choices, category } = q;
  const shown = { type, prompt, points: pointsFor(q), seconds: answerSeconds(q) };
  if (choices) shown.choices = choices;
  if (category) shown.category = category;
  if (includeAnswer) shown.answer = q.answer;
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
  const mine = current.answers[teamId];
  if (state.phase === "lobby" || state.phase === "preview") return { buzzer: "locked", place: null };
  if (state.phase === "revealed") return { buzzer: "over", place: null };
  if (state.phase === "open") {
    const position = current.buzzes.findIndex((b) => b.teamId === teamId);
    return mine ? { buzzer: "buzzed", place: position + 1 } : { buzzer: "ready", place: null };
  }
  // Judging: the sealed answers are being read out.
  if (!mine) return { buzzer: "missed", place: null };
  if (current.activeTeamId === teamId) return { buzzer: "floor", place: null };
  if (current.attempted.includes(teamId)) return { buzzer: "tried", place: null };
  const index = upNext(state).indexOf(teamId);
  return { buzzer: "buzzed", place: index >= 0 ? index + 1 : null };
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
    let result = "No answer";
    let points = 0;
    if (record.winnerTeamId === teamId) {
      result = record.attempted[0] === teamId ? "Correct" : "Steal";
      points = record.points;
    } else if (record.lockInsAwarded.includes(teamId)) {
      result = "Also right";
      points = record.lockInPoints;
    } else if (record.attempted.includes(teamId)) {
      result = "Wrong";
    } else if (record.answered.includes(teamId)) {
      result = "No points";
    }
    return { questionNumber: record.questionNumber, type: record.type, result, points };
  });
}

function teamSummary(team) {
  if (!team) return null;
  return { id: team.id, name: team.name, side: team.side };
}

// What the projector should play: the question's own theme while a question with
// one is on screen, otherwise the background link.
export function musicView(state) {
  const music = state.music ?? { background: null, playing: false, volume: 60 };
  const question = state.phase === "lobby" ? null : currentQuestion(state);
  return {
    playing: music.playing,
    volume: music.volume,
    background: parseYouTube(music.background),
    theme: question?.music ? { questionNumber: state.questionIndex + 1, ...parseYouTube(question.music) } : null,
  };
}

export function publicView(state, now) {
  const current = state.current;
  const judging = state.phase === "judging";
  const question = currentQuestion(state);
  const deadline = answerDeadline(state);
  const readIds = current.activeTeamId ? [...current.attempted, current.activeTeamId] : current.attempted;
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
    // The order teams locked in, and how fast. Who answered, never what.
    buzzes: current.buzzes.map(({ teamId, at }) => ({
      teamId,
      name: state.teams[teamId]?.name ?? "?",
      ms: at - current.openedAt,
    })),
    // Answers already read out, in reading order, each with its ruling (null: the host is deciding).
    readOut: readIds.filter((id) => state.teams[id]).map((id) => ({
      team: teamSummary(state.teams[id]),
      answer: current.answers[id].answer,
      correct: id === current.activeTeamId ? null : current.answers[id].correct,
    })),
    floorTeam: judging ? teamSummary(state.teams[current.activeTeamId]) : null,
    upNext: judging ? upNext(state).map((id) => teamSummary(state.teams[id])) : [],
    answerTotalMs: question ? answerSeconds(question) * 1000 : 0,
    answerRemainingMs: state.phase === "open" ? Math.max(0, deadline - now) : null,
    answerCount: current.buzzes.length,
    crowd: crowdView(state.crowd, state.phase),
    // Crowd answer-along closes with the teams' answers, before anything is read out.
    answersOpen: state.phase === "preview" || state.phase === "open",
    lockInPoints: question ? lockInPoints(question) : 0,
    music: musicView(state),
    result:
      state.phase === "revealed"
        ? {
            winner: teamSummary(state.teams[current.winnerTeamId]),
            points: current.pointsAwarded,
            lockInWinners: Object.entries(current.answers)
              .filter(([, entry]) => entry.awarded)
              .map(([id]) => teamSummary(state.teams[id])),
          }
        : null,
  };
}

export function teamView(state, teamId, now) {
  const team = state.teams[teamId];
  const current = state.current;
  const entry = current.answers[teamId];
  const ruled = state.phase === "revealed" || current.attempted.includes(teamId);
  const deadline = answerDeadline(state);
  return {
    ...publicView(state, now),
    me: {
      id: team.id, name: team.name, side: team.side, score: team.score, code: team.code,
      rank: rankOf(Object.values(state.teams), teamId), rankOf: Object.keys(state.teams).length,
    },
    ...buzzerState(state, teamId),
    stats: teamStats(team),
    history: teamHistory(state, teamId),
    // Only this team's own answer, and whether it was right only once it has been ruled on.
    myAnswer: entry
      ? { answer: entry.answer, correct: ruled ? entry.correct : undefined, awarded: entry.awarded }
      : null,
    canAnswer: state.phase === "open" && !entry && deadline !== null && now <= deadline,
  };
}

export function adminView(state, now) {
  const view = publicView(state, now);
  const current = state.current;
  return {
    ...view,
    question: questionFor(state, true),
    teams: view.teams.map((t) => ({ ...t, code: state.teams[t.id].code })),
    registrationOpen: state.registrationOpen,
    // Every sealed answer, in lock-in order. Only the host sees these before they are read.
    answers: current.buzzes.filter((b) => state.teams[b.teamId]).map(({ teamId }) => ({
      teamId,
      name: state.teams[teamId].name,
      read: current.attempted.includes(teamId) || current.activeTeamId === teamId,
      winner: current.winnerTeamId === teamId,
      ...current.answers[teamId],
    })),
    waitingOn: current.activeTeamId ? teamSummary(state.teams[current.activeTeamId]) : null,
    musicLink: state.music?.background ?? "",
    questionList: state.questions.map((q, i) => ({
      number: i + 1,
      type: q.type,
      prompt: q.prompt,
      music: Boolean(q.music),
      played: i <= state.questionIndex,
    })),
  };
}
