import { POINTS, LOCKIN_SHARE, ANSWER_SECONDS } from "./config.js";

export function pointsFor(question) {
  return question.points ?? POINTS[question.type];
}

export function lockInPoints(question) {
  return Math.round(pointsFor(question) * LOCKIN_SHARE);
}

export function answerSeconds(question) {
  return question.seconds ?? ANSWER_SECONDS[question.type];
}

const normalize = (text) => String(text).trim().toLowerCase();

// Is a locked-in answer right? true or false for mc and tf. For free response, an
// exact match with the answer or one of its "accept" spellings (ignoring case and
// outer spaces) counts as true; anything else is null, meaning "the host decides".
export function autoCheck(question, answer) {
  if (question.type === "free") {
    const accepted = [question.answer, ...(question.accept ?? [])].map(normalize);
    return accepted.includes(normalize(answer)) ? true : null;
  }
  return answer === question.answer;
}
