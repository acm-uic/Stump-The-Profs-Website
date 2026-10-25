import { test } from "node:test";
import assert from "node:assert/strict";
import { pointsFor, lockInPoints, autoCheck } from "../scoring.js";

test("each type has its default points: free 300, mc 200, tf 100", () => {
  assert.equal(pointsFor({ type: "free" }), 300);
  assert.equal(pointsFor({ type: "mc" }), 200);
  assert.equal(pointsFor({ type: "tf" }), 100);
});

test("a question's own points override the default", () => {
  assert.equal(pointsFor({ type: "tf", points: 150 }), 150);
});

test("lock-ins are worth a quarter, rounded to a whole number", () => {
  assert.equal(lockInPoints({ type: "free" }), 75);
  assert.equal(lockInPoints({ type: "mc" }), 50);
  assert.equal(lockInPoints({ type: "tf" }), 25);
  assert.equal(lockInPoints({ type: "tf", points: 150 }), 38);
});

test("mc and tf lock-ins are checked exactly", () => {
  const mc = { type: "mc", choices: ["A", "B"], answer: 1 };
  assert.equal(autoCheck(mc, 1), true);
  assert.equal(autoCheck(mc, 0), false);
  const tf = { type: "tf", answer: false };
  assert.equal(autoCheck(tf, false), true);
  assert.equal(autoCheck(tf, true), false);
});

test("free response: an exact match is right, anything else waits for the host", () => {
  const free = { type: "free", answer: "Linked list" };
  assert.equal(autoCheck(free, "  linked LIST "), true);
  assert.equal(autoCheck(free, "linked lists"), null);
});
