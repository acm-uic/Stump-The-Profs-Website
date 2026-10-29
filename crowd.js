// Spectator play: nicknames, predictions, answer-along picks, and the cheer meter.
// Like game.js, it knows nothing about sockets. It also does not read the game:
// whatever it needs to know (the phase, the question) is passed in.

import { CROWD_POINTS, CHEER_DECAY } from "./config.js";

const PREDICTIONS = ["student", "prof", "none"];
const MAX_NICKNAME = 20;

export function createCrowd() {
  return {
    spectators: {}, // id -> { id, name, score, joinOrder }
    nextId: 1,
    predictions: {}, // spectator id -> "student" | "prof" | "none"
    picks: {},       // spectator id -> choice index (mc) or true/false (tf)
    lastResult: null, // filled when a question ends: counts, split, who was right
  };
}

export function joinCrowd(crowd, name) {
  const clean = typeof name === "string" ? name.trim() : "";
  if (clean === "") return { ok: false, error: "Pick a nickname" };
  if (clean.length > MAX_NICKNAME) return { ok: false, error: `Nicknames can be at most ${MAX_NICKNAME} characters` };
  const taken = Object.values(crowd.spectators).some((s) => s.name.toLowerCase() === clean.toLowerCase());
  if (taken) return { ok: false, error: "That nickname is taken" };

  const joinOrder = crowd.nextId++;
  const spectator = { id: `s${joinOrder}`, name: clean, score: 0, joinOrder };
  crowd.spectators[spectator.id] = spectator;
  return { ok: true, spectator };
}

export function rejoinCrowd(crowd, id) {
  const spectator = crowd.spectators[id];
  return spectator ? { ok: true, spectator } : { ok: false, error: "Unknown spectator" };
}

// Predict which side wins this question. Only while the question is being read
// (preview); once buzzers open, the answer starts to become obvious.
export function predict(crowd, id, side, phase) {
  if (!crowd.spectators[id]) return { ok: false, error: "Join the crowd first" };
  if (phase !== "preview") return { ok: false, error: "Predictions close when the buzzers open" };
  if (!PREDICTIONS.includes(side)) return { ok: false, error: "Predict students, profs or nobody" };
  crowd.predictions[id] = side; // can change your mind until the buzzers open
  return { ok: true };
}

// Answer along on mc and tf. Open while the teams are answering, closed before the
// first sealed answer is read out, and once only.
export function pick(crowd, id, choice, phase, question) {
  if (!crowd.spectators[id]) return { ok: false, error: "Join the crowd first" };
  if (!question || (question.type !== "mc" && question.type !== "tf")) {
    return { ok: false, error: "Answer-along is for multiple choice and true/false" };
  }
  if (!["preview", "open"].includes(phase)) {
    return { ok: false, error: "Answers are closed" };
  }
  const valid = question.type === "mc"
    ? Number.isInteger(choice) && choice >= 0 && choice < question.choices.length
    : typeof choice === "boolean";
  if (!valid) return { ok: false, error: "Pick one of the answers" };
  if (id in crowd.picks) return { ok: false, error: "You already answered" };
  crowd.picks[id] = choice;
  return { ok: true };
}

// A new question: clear the previous question's predictions and picks.
export function startQuestion(crowd) {
  crowd.predictions = {};
  crowd.picks = {};
  crowd.lastResult = null;
}

// The question ended. outcome = { winnerSide: "student" | "prof" | null, question }.
export function settleQuestion(crowd, { winnerSide, question }) {
  const actual = winnerSide ?? "none";
  const rightPredictors = [];
  for (const [id, side] of Object.entries(crowd.predictions)) {
    if (side === actual && crowd.spectators[id]) {
      crowd.spectators[id].score += CROWD_POINTS.prediction;
      rightPredictors.push(id);
    }
  }
  const rightPickers = [];
  for (const [id, choice] of Object.entries(crowd.picks)) {
    if (choice === question.answer && crowd.spectators[id]) {
      crowd.spectators[id].score += CROWD_POINTS.pick;
      rightPickers.push(id);
    }
  }
  crowd.lastResult = {
    actual,
    predictionCounts: countPredictions(crowd),
    pickSplit: pickSplit(crowd, question),
    rightPredictors,
    rightPickers,
  };
}

function countPredictions(crowd) {
  const counts = { student: 0, prof: 0, none: 0 };
  for (const side of Object.values(crowd.predictions)) counts[side] += 1;
  return counts;
}

// Percent of pickers per option, in option order. null when nobody could pick.
function pickSplit(crowd, question) {
  if (!question || (question.type !== "mc" && question.type !== "tf")) return null;
  const options = question.type === "mc" ? question.choices.map((_, i) => i) : [true, false];
  const picks = Object.values(crowd.picks);
  return options.map((option) => ({
    option,
    percent: picks.length === 0 ? 0 : Math.round((picks.filter((p) => p === option).length / picks.length) * 100),
  }));
}

function ranked(crowd) {
  return Object.values(crowd.spectators).sort((a, b) => b.score - a.score || a.joinOrder - b.joinOrder);
}

// What the projector and every phone may see about the crowd. Picks stay hidden
// until the reveal, so teams cannot read the room's answer off the projector.
export function crowdView(crowd, phase) {
  const revealed = phase === "revealed" && crowd.lastResult;
  return {
    count: Object.keys(crowd.spectators).length,
    predictionCounts: revealed ? crowd.lastResult.predictionCounts : countPredictions(crowd),
    pickCount: Object.keys(crowd.picks).length,
    pickSplit: revealed ? crowd.lastResult.pickSplit : null,
    top: ranked(crowd).filter((s) => s.score > 0).slice(0, 5).map(({ name, score }) => ({ name, score })),
  };
}

// What one spectator's phone needs about itself.
export function meView(crowd, id, phase) {
  const me = crowd.spectators[id];
  if (!me) return null;
  const all = Object.values(crowd.spectators);
  const result = phase === "revealed" ? crowd.lastResult : null;
  return {
    id,
    name: me.name,
    score: me.score,
    rank: 1 + all.filter((s) => s.score > me.score).length,
    rankOf: all.length,
    prediction: crowd.predictions[id] ?? null,
    pick: id in crowd.picks ? crowd.picks[id] : null,
    predictionRight: result ? result.rightPredictors.includes(id) : null,
    pickRight: result && id in crowd.picks ? result.rightPickers.includes(id) : null,
  };
}

// ---- Cheer meter (kept outside the saved game: it is only live noise) ----

export function createMeter() {
  return { student: 0, prof: 0 };
}

export function cheer(meter, side) {
  if (side !== "student" && side !== "prof") return { ok: false };
  meter[side] += 1;
  return { ok: true };
}

export function decayCheer(meter) {
  for (const side of ["student", "prof"]) {
    meter[side] *= CHEER_DECAY;
    if (meter[side] < 0.5) meter[side] = 0; // stop shrinking forever
  }
}

// The students' share of the noise, from 0 to 1. 0.5 when it is quiet.
export function cheerShare(meter) {
  const total = meter.student + meter.prof;
  return total === 0 ? 0.5 : meter.student / total;
}
