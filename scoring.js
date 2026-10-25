import { POINTS, LOCKIN_SHARE } from "./config.js";

export function pointsFor(question) {
  return question.points ?? POINTS[question.type];
}

export function lockInPoints(question) {
  return Math.round(pointsFor(question) * LOCKIN_SHARE);
}

const normalize = (text) => String(text).trim().toLowerCase();

// Is a lock-in right? true or false for mc and tf. For free response, an exact
// match (ignoring case and outer spaces) counts as true; anything else is null,
// meaning "the host decides".
export function autoCheck(question, answer) {
  if (question.type === "free") {
    return normalize(answer) === normalize(question.answer) ? true : null;
  }
  return answer === question.answer;
}
