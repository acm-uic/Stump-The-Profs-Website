// Every tunable number lives here, so changing a rule never means hunting through code.

// Points for a correct answer, by question type. A question can override with its own "points".
export const POINTS = { free: 300, mc: 200, tf: 100 };

// How long every team has to pick or type an answer and lock it in, counted from the
// moment the host opens answers. A question can override with its own "seconds".
export const ANSWER_SECONDS = { free: 30, mc: 20, tf: 15 };

// A lock-in that arrives this soon after the clock hits zero still counts, so a team
// that pressed BUZZ at 0.1 s left is not beaten by Wi-Fi lag.
export const LATE_GRACE_MS = 750;

// Share of a question's points for a correct answer that was not the first correct one
// in the reading order. 0.25 means 75 / 50 / 25 for free / mc / tf.
export const LOCKIN_SHARE = 0.25;

// Longest free-response answer, so the admin screen can show them all.
export const LOCKIN_MAX_LENGTH = 80;

// Longest answer window a question may set for itself.
export const MAX_ANSWER_SECONDS = 300;

// Crowd points for spectators: a right prediction (which side wins the question)
// and a right answer-along pick on multiple choice and true/false.
export const CROWD_POINTS = { prediction: 10, pick: 10 };

// Cheer meter: each tick (CHEER_TICK_MS) both totals shrink by CHEER_DECAY, so the
// meter shows the room's energy right now, not all night. A phone may cheer at most
// once every CHEER_MIN_GAP_MS.
export const CHEER_TICK_MS = 250;
export const CHEER_DECAY = 0.85;
export const CHEER_MIN_GAP_MS = 150;

// ---- Settings that change between machines. They come from the environment
// (a .env file locally, a Kubernetes Secret on the cluster), never from the code.

export const PORT = Number(process.env.PORT ?? 3000);

// The admin password. server.js refuses to start without it.
export const ADMIN_KEY = process.env.ADMIN_KEY;

// Where the game is saved after every change.
export const SAVE_PATH = process.env.SAVE_PATH ?? "data/state.json";

// Where uploaded questions are kept. data/ is ignored by git and never goes into the
// container image, so the answers stay off the public repo.
export const QUESTIONS_PATH = process.env.QUESTIONS_PATH ?? "data/questions.json";

// The address shown on the projector. Falls back to this laptop's Wi-Fi address.
export const PUBLIC_URL = process.env.PUBLIC_URL;

// How many admin actions Undo can step back through.
export const UNDO_LIMIT = 30;

// Biggest single score adjustment the admin can make, to catch typos like 2000 for 200.
export const MAX_ADJUST = 1000;
