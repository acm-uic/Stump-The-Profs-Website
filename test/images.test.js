import { test } from "node:test";
import assert from "node:assert/strict";
import { isImageName, isImageLink, imageProblem } from "../images.js";
import { validateQuestions } from "../store.js";
import { createGame, showQuestion, openBuzzers, reveal } from "../game.js";
import { publicView, adminView } from "../views.js";
import { MAX_IMAGE_BYTES } from "../config.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);

test("picture names: simple names with a picture type only", () => {
  assert.ok(isImageName("binary-tree.png"));
  assert.ok(isImageName("Q3_graph.JPEG"));
  assert.equal(isImageName("my tree.png"), false); // spaces
  assert.equal(isImageName("../state.json"), false);
  assert.equal(isImageName("pics/tree.png"), false); // no folders
  assert.equal(isImageName("logo.svg"), false); // an SVG can hold a script
  assert.equal(isImageName(".png"), false);
});

test("picture links must be https", () => {
  assert.ok(isImageLink("https://example.com/tree.png"));
  assert.equal(isImageLink("http://example.com/tree.png"), false);
  assert.equal(isImageLink("javascript:alert(1)"), false);
  assert.equal(isImageLink("tree.png"), false);
});

test("an upload must really be the type its name says", () => {
  assert.equal(imageProblem("tree.png", PNG), null);
  assert.equal(imageProblem("tree.jpg", JPEG), null);
  assert.equal(imageProblem("tree.jpeg", JPEG), null);
  assert.match(imageProblem("tree.png", JPEG), /not really a \.png/);
  assert.match(imageProblem("tree.gif", Buffer.from("<svg onload=alert(1)>")), /not really a \.gif/);
  assert.match(imageProblem("tree.png", Buffer.alloc(0)), /empty/);
  assert.match(imageProblem("tree.png", undefined), /empty/);
  assert.match(imageProblem("my tree.png", PNG), /no spaces/);
  assert.match(imageProblem("tree.png", Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)])), /at most 5 MB/);
});

const base = { id: "q1", type: "tf", prompt: "Is this a tree?", answer: true };

// Plays out the question on screen and shows the next one.
function nextQuestion(state) {
  openBuzzers(state, 0);
  reveal(state);
  showQuestion(state);
}

test("questions may name an uploaded picture or link one, with an optional description", () => {
  validateQuestions([{ ...base, image: "tree.png" }]);
  validateQuestions([{ ...base, image: "https://example.com/tree.png", imageAlt: "A binary tree with five nodes" }]);
  assert.throws(() => validateQuestions([{ ...base, image: "my tree.png" }]), /image must be/);
  assert.throws(() => validateQuestions([{ ...base, image: "http://example.com/tree.png" }]), /image must be/);
  assert.throws(() => validateQuestions([{ ...base, imageAlt: "A tree" }]), /needs an image/);
  assert.throws(() => validateQuestions([{ ...base, image: "tree.png", imageAlt: "" }]), /imageAlt must be text/);
});

test("only the question on screen sends its picture, and only as a server address", () => {
  const state = createGame([
    { ...base, image: "first.png" },
    { ...base, id: "q2", image: "second.png", imageAlt: "A heap" },
    { ...base, id: "q3", image: "https://example.com/third.png" },
  ]);
  assert.equal(JSON.stringify(publicView(state, 0)).includes("first.png"), false); // lobby: nothing yet

  showQuestion(state);
  const view = publicView(state, 0);
  assert.deepEqual(view.question.image, { src: "/question-image/1/first.png", alt: "Picture for this question" });
  assert.equal(JSON.stringify(view).includes("second.png"), false); // later pictures stay secret

  nextQuestion(state);
  assert.deepEqual(publicView(state, 0).question.image, { src: "/question-image/2/second.png", alt: "A heap" });
  nextQuestion(state);
  assert.equal(publicView(state, 0).question.image.src, "https://example.com/third.png");
});

test("the host's question list names every picture, so missing ones can be flagged", () => {
  const state = createGame([{ ...base, image: "tree.png" }, { ...base, id: "q2" }]);
  assert.deepEqual(adminView(state, 0).questionList.map((q) => q.image), ["tree.png", null]);
});
