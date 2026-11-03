import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCrowd, joinCrowd, rejoinCrowd, predict, pick, startQuestion, settleQuestion, crowdView, meView,
  createMeter, cheer, decayCheer, cheerShare,
} from "../crowd.js";

const MC = { type: "mc", choices: ["A", "B", "C", "D"], answer: 1 };
const FREE = { type: "free", answer: "x" };

function crowdOf(...names) {
  const crowd = createCrowd();
  const ids = names.map((n) => joinCrowd(crowd, n).spectator.id);
  return { crowd, ids };
}

test("nicknames: trimmed, unique ignoring case, and length-limited; rejoin by id", () => {
  const crowd = createCrowd();
  const { spectator } = joinCrowd(crowd, "  Ana ");
  assert.equal(spectator.name, "Ana");
  assert.equal(joinCrowd(crowd, "ANA").ok, false);
  assert.equal(joinCrowd(crowd, "   ").ok, false);
  assert.equal(joinCrowd(crowd, "x".repeat(21)).ok, false);
  assert.equal(rejoinCrowd(crowd, spectator.id).spectator, spectator);
  assert.equal(rejoinCrowd(crowd, "s99").ok, false);
});

test("predictions: only in preview, only valid sides, and you can change your mind", () => {
  const { crowd, ids: [ana] } = crowdOf("Ana");
  assert.equal(predict(crowd, ana, "prof", "open").ok, false);
  assert.equal(predict(crowd, ana, "aliens", "preview").ok, false);
  assert.equal(predict(crowd, ana, "student", "preview").ok, true);
  assert.equal(predict(crowd, ana, "prof", "preview").ok, true);
  assert.equal(crowd.predictions[ana], "prof");
  assert.equal(predict(crowd, "s99", "prof", "preview").ok, false);
});

test("picks: mc/tf only, while answers are open, valid choices, once", () => {
  const { crowd, ids: [ana, ben] } = crowdOf("Ana", "Ben");
  assert.equal(pick(crowd, ana, 1, "open", FREE).ok, false);
  assert.equal(pick(crowd, ana, 1, "judging", MC).ok, false); // closed before answers are read out
  assert.equal(pick(crowd, ana, 9, "open", MC).ok, false);
  assert.equal(pick(crowd, ana, "1", "open", MC).ok, false);
  assert.equal(pick(crowd, ana, 1, "open", MC).ok, true);
  assert.equal(pick(crowd, ana, 2, "open", MC).ok, false);
  assert.equal(pick(crowd, ben, true, "open", { type: "tf", answer: false }).ok, true);
});

test("settling: each phone learns whether its prediction and pick were right; nothing is scored", () => {
  const { crowd, ids: [ana, ben, cy] } = crowdOf("Ana", "Ben", "Cy");
  predict(crowd, ana, "student", "preview");
  predict(crowd, ben, "prof", "preview");
  predict(crowd, cy, "none", "preview");
  pick(crowd, ana, 1, "open", MC);
  pick(crowd, ben, 0, "open", MC);
  settleQuestion(crowd, { winnerSide: "prof", question: MC });
  assert.deepEqual(meView(crowd, ana, "revealed"), { id: ana, name: "Ana", prediction: "student", pick: 1, predictionRight: false, pickRight: true });
  assert.deepEqual(meView(crowd, ben, "revealed"), { id: ben, name: "Ben", prediction: "prof", pick: 0, predictionRight: true, pickRight: false });
  assert.equal(meView(crowd, cy, "revealed").pickRight, null); // did not pick
  assert.equal("score" in crowd.spectators[ana], false);
});

test("'nobody' is right when no team wins", () => {
  const { crowd, ids: [ana] } = crowdOf("Ana");
  predict(crowd, ana, "none", "preview");
  settleQuestion(crowd, { winnerSide: null, question: FREE });
  assert.equal(meView(crowd, ana, "revealed").predictionRight, true);
});

test("the pick split stays hidden until the reveal, then shows percentages", () => {
  const { crowd, ids } = crowdOf("A", "B", "C", "D");
  pick(crowd, ids[0], 1, "open", MC);
  pick(crowd, ids[1], 1, "open", MC);
  pick(crowd, ids[2], 1, "open", MC);
  pick(crowd, ids[3], 3, "open", MC);
  const before = crowdView(crowd, "answering");
  assert.equal(before.pickSplit, null);
  assert.equal(before.pickCount, 4);
  settleQuestion(crowd, { winnerSide: "student", question: MC });
  assert.deepEqual(crowdView(crowd, "revealed").pickSplit.map((x) => x.percent), [0, 75, 0, 25]);
});

test("a new question clears predictions and picks; there is no crowd leaderboard", () => {
  const { crowd, ids } = crowdOf("A", "B");
  predict(crowd, ids[0], "prof", "preview");
  startQuestion(crowd);
  assert.deepEqual(crowd.predictions, {});
  assert.equal("top" in crowdView(crowd, "preview"), false);
});

test("cheer meter: taps add up, decay reaches exactly 0, and the share is 0.5 when quiet", () => {
  const meter = createMeter();
  assert.equal(cheerShare(meter), 0.5);
  cheer(meter, "student"); cheer(meter, "student"); cheer(meter, "student"); cheer(meter, "prof");
  assert.equal(cheerShare(meter), 0.75);
  assert.equal(cheer(meter, "dean").ok, false);
  for (let i = 0; i < 40; i++) decayCheer(meter);
  assert.deepEqual(meter, { student: 0, prof: 0 });
});
