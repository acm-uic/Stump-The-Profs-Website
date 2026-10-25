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
