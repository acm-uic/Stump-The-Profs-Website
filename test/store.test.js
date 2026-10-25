import { test } from "node:test";
import assert from "node:assert/strict";
import { validateQuestions } from "../store.js";

const good = () => [
  { id: "q1", type: "free", prompt: "What does CPU stand for?", answer: "Central processing unit" },
  { id: "q2", type: "mc", prompt: "Pick one", choices: ["A", "B", "C", "D"], answer: 3 },
  { id: "q3", type: "tf", prompt: "True?", answer: true, points: 150, category: "Logic" },
];

test("a good list passes and is given back", () => {
  const list = good();
  assert.equal(validateQuestions(list), list);
});

test("the list itself must be an array", () => {
  assert.throws(() => validateQuestions({ id: "q1" }), /must be a list/);
});

test("duplicate ids are refused, naming the question", () => {
  const list = good();
  list[2].id = "q1";
  assert.throws(() => validateQuestions(list), /Question 3 \(id "q1"\).*same id/);
});

test("an unknown type is refused", () => {
  const list = good();
  list[0].type = "essay";
  assert.throws(() => validateQuestions(list), /Question 1.*type/);
});

test("an mc answer outside the choices is refused", () => {
  const list = good();
  list[1].answer = 7;
  assert.throws(() => validateQuestions(list), /Question 2 \(id "q2"\): mc answer must be a choice number from 0 to 3/);
});

test("a tf answer written as text is refused", () => {
  const list = good();
  list[2].answer = "false";
  assert.throws(() => validateQuestions(list), /tf answer must be true or false/);
});

test("mc needs 2 to 6 non-empty choices", () => {
  const list = good();
  list[1].choices = ["Only one"];
  list[1].answer = 0;
  assert.throws(() => validateQuestions(list), /2 to 6/);
});

test("points must be a positive whole number", () => {
  const list = good();
  list[0].points = "300";
  assert.throws(() => validateQuestions(list), /points/);
});

// ---- Saving and loading ------------------------------------------------------

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveState, loadState } from "../store.js";
import { createGame, registerTeam } from "../game.js";

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "stp-"));

test("save then load gives back the same game", () => {
  const file = path.join(tempDir(), "nested", "state.json");
  const state = createGame(good());
  registerTeam(state, { name: "Byte Me", side: "student" });
  registerTeam(state, { name: "Dr. Null", side: "prof" });
  saveState(state, file);
  assert.deepEqual(loadState(file), state);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test("loading a missing file gives null", () => {
  assert.equal(loadState(path.join(tempDir(), "nope.json")), null);
});

test("a broken save is moved aside, not deleted, and gives null", () => {
  const dir = tempDir();
  const file = path.join(dir, "state.json");
  fs.writeFileSync(file, "{ half a fi");
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(loadState(file), null);
  } finally {
    console.error = originalError;
  }
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.readdirSync(dir).some((f) => f.startsWith("state.json.broken-")), true);
});
