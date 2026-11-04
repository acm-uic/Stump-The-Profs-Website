import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCrowd, joinCrowd, rejoinCrowd, predict, crowdView, meView, predictionTally,
  createMeter, cheer, decayCheer, cheerShare,
} from "../crowd.js";

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

test("one prediction for the game: students or profs, changeable only while predictions are open", () => {
  const { crowd, ids: [ana] } = crowdOf("Ana");
  assert.equal(predict(crowd, ana, "none", true).ok, false);
  assert.equal(predict(crowd, ana, "student", true).ok, true);
  assert.equal(predict(crowd, ana, "prof", true).ok, true);
  assert.equal(predict(crowd, ana, "student", false).ok, false); // closed: the first question started
  assert.equal(crowd.predictions[ana], "prof");
  assert.equal(predict(crowd, "s99", "prof", true).ok, false);
});

test("the crowd view counts predictions by side, and nothing else about anyone", () => {
  const { crowd, ids: [ana, ben, cy] } = crowdOf("Ana", "Ben", "Cy");
  predict(crowd, ana, "student", true);
  predict(crowd, ben, "prof", true);
  predict(crowd, cy, "prof", true);
  assert.deepEqual(crowdView(crowd), { count: 3, predictionCounts: { student: 1, prof: 2 } });
});

test("a phone learns whether it called the game only once the winner is known", () => {
  const { crowd, ids: [ana, ben, cy] } = crowdOf("Ana", "Ben", "Cy");
  predict(crowd, ana, "student", true);
  predict(crowd, ben, "prof", true);
  assert.equal(meView(crowd, ana, undefined).predictionRight, null); // game still going
  assert.deepEqual(meView(crowd, ana, "student"), { id: ana, name: "Ana", prediction: "student", predictionRight: true });
  assert.equal(meView(crowd, ben, "student").predictionRight, false);
  assert.equal(meView(crowd, cy, "student").predictionRight, null); // never predicted
  assert.equal(meView(crowd, ana, null).predictionRight, false); // a tie: nobody called it
  assert.deepEqual(predictionTally(crowd, "student"), { called: 1, predicted: 2 });
  assert.deepEqual(predictionTally(crowd, null), { called: 0, predicted: 2 });
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
