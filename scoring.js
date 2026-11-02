import { POINTS, LOCKIN_SHARE, ANSWER_SECONDS } from "./config.js";

export function pointsFor(question) {
  return question.points ?? POINTS[question.type];
}

export function lockInPoints(question) {
  return Math.round(pointsFor(question) * LOCKIN_SHARE);
}

// A multiple choice question whose answer is a list: teams pick all the choices they think are right.
export function isMultiAnswer(question) {
  return question.type === "mc" && Array.isArray(question.answer);
}

// For a multiple-answer question: the share of the right choices a pick found (1 is all
// of them), or 0 if the pick includes any wrong choice.
export function rightShare(question, picks) {
  if (picks.some((choice) => !question.answer.includes(choice))) return 0;
  return picks.length / question.answer.length;
}

// Points for a partly right pick: that share of what an "also right" answer earns, so
// a complete answer always earns more than a partial one.
export function partialPoints(question, share) {
  return Math.round(lockInPoints(question) * share);
}

// Is one choice among the right ones? Used for the crowd, who always pick one choice.
export function isRightChoice(question, choice) {
  return isMultiAnswer(question) ? question.answer.includes(choice) : choice === question.answer;
}

export function answerSeconds(question) {
  return question.seconds ?? ANSWER_SECONDS[question.type];
}

const normalize = (text) => String(text).trim().toLowerCase();

// Is a locked-in answer right? true or false for mc and tf; a multiple-answer pick is
// true only with every right choice and nothing else. For free response, an exact match with the answer or one of its "accept" spellings (ignoring case and
// outer spaces) counts as true; anything else is null, meaning "the host decides".
export function autoCheck(question, answer) {
  if (question.type === "free") {
    const accepted = [question.answer, ...(question.accept ?? [])].map(normalize);
    return accepted.includes(normalize(answer)) ? true : null;
  }
  if (isMultiAnswer(question)) return rightShare(question, answer) === 1;
  return answer === question.answer;
}
