import { test } from "node:test";
import assert from "node:assert/strict";
import { pointsFor } from "../scoring.js";

test("each type has its default points: free 300, mc 200, tf 100", () => {
  assert.equal(pointsFor({ type: "free" }), 300);
  assert.equal(pointsFor({ type: "mc" }), 200);
  assert.equal(pointsFor({ type: "tf" }), 100);
});

test("a question's own points override the default", () => {
  assert.equal(pointsFor({ type: "tf", points: 150 }), 150);
});
