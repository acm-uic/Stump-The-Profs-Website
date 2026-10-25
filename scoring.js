import { POINTS } from "./config.js";

export function pointsFor(question) {
  return question.points ?? POINTS[question.type];
}
