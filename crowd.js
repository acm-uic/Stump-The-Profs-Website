// Spectator play: nicknames, one prediction for the whole game, and the cheer meter.
// It is just for fun: nothing is scored, because the players themselves compete.
// Like game.js, it knows nothing about sockets. It also does not read the game:
// whatever it needs to know is passed in.

import { CHEER_DECAY } from "./config.js";

const SIDES = ["student", "prof"];
const MAX_NICKNAME = 20;

export function createCrowd() {
  return {
    spectators: {}, // id -> { id, name, joinOrder }
    nextId: 1,
    predictions: {}, // spectator id -> "student" | "prof": which side wins the game
  };
}

export function joinCrowd(crowd, name) {
  const clean = typeof name === "string" ? name.trim() : "";
  if (clean === "") return { ok: false, error: "Pick a nickname" };
  if (clean.length > MAX_NICKNAME) return { ok: false, error: `Nicknames can be at most ${MAX_NICKNAME} characters` };
  const taken = Object.values(crowd.spectators).some((s) => s.name.toLowerCase() === clean.toLowerCase());
  if (taken) return { ok: false, error: "That nickname is taken" };

  const joinOrder = crowd.nextId++;
  const spectator = { id: `s${joinOrder}`, name: clean, joinOrder };
  crowd.spectators[spectator.id] = spectator;
  return { ok: true, spectator };
}

export function rejoinCrowd(crowd, id) {
  const spectator = crowd.spectators[id];
  return spectator ? { ok: true, spectator } : { ok: false, error: "Unknown spectator" };
}

// Predict which side wins the whole game. Open until the first question's answers
// open (game.js decides that); until then a spectator can change their mind.
export function predict(crowd, id, side, predictionsOpen) {
  if (!crowd.spectators[id]) return { ok: false, error: "Join the crowd first" };
  if (!predictionsOpen) return { ok: false, error: "Predictions closed when the first question started" };
  if (!SIDES.includes(side)) return { ok: false, error: "Predict students or profs" };
  crowd.predictions[id] = side;
  return { ok: true };
}

function countPredictions(crowd) {
  const counts = { student: 0, prof: 0 };
  for (const side of Object.values(crowd.predictions)) counts[side] += 1;
  return counts;
}

// What the projector and every phone may see about the crowd.
export function crowdView(crowd) {
  return {
    count: Object.keys(crowd.spectators).length,
    predictionCounts: countPredictions(crowd),
  };
}

// How many spectators called the winning side, for the final results.
// winnerSide is null for a tie, which nobody predicted.
export function predictionTally(crowd, winnerSide) {
  const all = Object.values(crowd.predictions);
  return { called: all.filter((side) => side === winnerSide).length, predicted: all.length };
}

// What one spectator's phone needs about itself. winnerSide is only passed once the
// final results are showing (null for a tie); before that, nobody is right or wrong yet.
export function meView(crowd, id, winnerSide) {
  const me = crowd.spectators[id];
  if (!me) return null;
  const prediction = crowd.predictions[id] ?? null;
  return {
    id,
    name: me.name,
    prediction,
    predictionRight: winnerSide === undefined || prediction === null ? null : prediction === winnerSide,
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
