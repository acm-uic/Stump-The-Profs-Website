import fs from "node:fs";

const TYPES = ["free", "mc", "tf"];

const isText = (value) => typeof value === "string" && value.trim() !== "";

// Checks a list of questions and stops with a message naming the first broken one.
// Kept separate from file reading so tests can pass in arrays directly.
export function validateQuestions(list) {
  if (!Array.isArray(list)) throw new Error("Questions must be a list (a JSON array)");

  const seenIds = new Set();
  list.forEach((q, i) => {
    const label = `Question ${i + 1}${q && isText(q.id) ? ` (id "${q.id}")` : ""}`;
    const fail = (problem) => { throw new Error(`${label}: ${problem}`); };

    if (typeof q !== "object" || q === null || Array.isArray(q)) fail("must be an object");
    if (!isText(q.id)) fail("needs an id");
    if (seenIds.has(q.id)) fail("has the same id as an earlier question");
    seenIds.add(q.id);
    if (!TYPES.includes(q.type)) fail(`type must be one of ${TYPES.join(", ")}`);
    if (!isText(q.prompt)) fail("needs a prompt");

    if (q.type === "mc") {
      if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 6) {
        fail("mc choices must be a list of 2 to 6 answers");
      }
      if (!q.choices.every(isText)) fail("every mc choice must be non-empty text");
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length) {
        fail(`mc answer must be a choice number from 0 to ${q.choices.length - 1}`);
      }
    } else if (q.type === "tf") {
      if (typeof q.answer !== "boolean") fail("tf answer must be true or false (without quotes)");
    } else if (!isText(q.answer)) {
      fail("free answer must be non-empty text");
    }

    if (q.points !== undefined && (!Number.isInteger(q.points) || q.points <= 0)) {
      fail("points must be a positive whole number");
    }
    if (q.category !== undefined && !isText(q.category)) fail("category must be text");
  });
  return list;
}

export function loadQuestions(path) {
  let list;
  try {
    list = JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${path}: ${error.message}`);
  }
  return validateQuestions(list);
}
