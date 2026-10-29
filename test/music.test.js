import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYouTube, parseSeconds } from "../music.js";
import { validateQuestions } from "../store.js";

const ID = "dQw4w9WgXcQ";

test("times: plain seconds, 1m30s style and 1:30 style", () => {
  assert.equal(parseSeconds("90"), 90);
  assert.equal(parseSeconds("90s"), 90);
  assert.equal(parseSeconds("1m30s"), 90);
  assert.equal(parseSeconds("1h2m3s"), 3723);
  assert.equal(parseSeconds("1:30"), 90);
  assert.equal(parseSeconds("1:02:03"), 3723);
  assert.equal(parseSeconds("soon"), null);
});

test("every common YouTube link shape gives the video and its start and end", () => {
  const expect = (link, start = 0, end = null) => assert.deepEqual(parseYouTube(link), { videoId: ID, playlistId: null, start, end });
  expect(`https://www.youtube.com/watch?v=${ID}`);
  expect(`https://youtu.be/${ID}?t=83`, 83);
  expect(`https://youtu.be/${ID}?si=abc123&t=1m23s`, 83);
  expect(`https://www.youtube.com/watch?v=${ID}&t=90s&end=150`, 90, 150);
  expect(`https://www.youtube.com/embed/${ID}?start=10&end=20`, 10, 20);
  expect(`https://music.youtube.com/watch?v=${ID}`);
  expect(`https://www.youtube.com/shorts/${ID}`);
});

test("playlists, with or without a starting video", () => {
  assert.deepEqual(parseYouTube("https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG"),
    { videoId: null, playlistId: "PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG", start: 0, end: null });
  assert.equal(parseYouTube(`https://www.youtube.com/watch?v=${ID}&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG`).videoId, ID);
});

test("anything that is not a playable YouTube link is refused", () => {
  for (const bad of [
    "", "not a url", "https://vimeo.com/123", `https://youtube.com.evil.example/watch?v=${ID}`,
    "https://www.youtube.com/watch?v=short", `javascript:alert(1)//youtu.be/${ID}`,
    `https://youtu.be/${ID}?t=90&end=30`, `https://youtu.be/${ID}?t=later`,
  ]) assert.equal(parseYouTube(bad), null, bad);
});

test("questions may carry seconds, accept and music, each checked", () => {
  const base = { id: "q", type: "free", prompt: "?", answer: "yes" };
  assert.doesNotThrow(() => validateQuestions([{ ...base, seconds: 45, accept: ["yep"], music: `https://youtu.be/${ID}?t=5` }]));
  assert.throws(() => validateQuestions([{ ...base, seconds: 2 }]), /seconds/);
  assert.throws(() => validateQuestions([{ ...base, accept: "yep" }]), /accept/);
  assert.throws(() => validateQuestions([{ ...base, type: "tf", answer: true, accept: ["x"] }]), /accept is only/);
  assert.throws(() => validateQuestions([{ ...base, music: "https://example.com/a.mp3" }]), /music must be a YouTube link/);
});
