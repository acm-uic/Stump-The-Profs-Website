import express from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  createGame, registerTeam, rejoinTeam, showQuestion, openBuzzers, buzz, judge, reveal,
  lockIn, markLockIn, adjustScore, kickTeam, toggleRegistration,
} from "./game.js";
import { loadQuestions, saveState, loadState } from "./store.js";
import { joinCrowd, rejoinCrowd, predict, pick, meView, createMeter, cheer, decayCheer } from "./crowd.js";
import {
  CHEER_TICK_MS, CHEER_MIN_GAP_MS, PORT, ADMIN_KEY, SAVE_PATH, PUBLIC_URL, UNDO_LIMIT,
} from "./config.js";
import { publicView, teamView, adminView } from "./views.js";

// ---- Startup checks: fail fast, with instructions ----

if (!ADMIN_KEY) {
  console.error("ADMIN_KEY is not set. Copy .env.example to .env and put a long phrase after ADMIN_KEY=,");
  console.error("or start with:  ADMIN_KEY=your-phrase npm start");
  process.exit(1);
}

const savePath = path.resolve(import.meta.dirname, SAVE_PATH);

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address);
}

// The address shown on the projector. On the cluster, PUBLIC_URL is the https address;
// on a laptop it falls back to this laptop's Wi-Fi address.
const joinUrl = PUBLIC_URL ?? `http://${lanAddresses()[0] ?? "localhost"}:${PORT}`;

// ---- The game: restored from the last save, or new ----

// Real questions live in data/, which git ignores, so the answers never reach GitHub.
// Without that file, the harmless sample questions are used for development.
function loadQuestionFile() {
  const realQuestions = path.join(import.meta.dirname, "data", "questions.json");
  const sampleQuestions = path.join(import.meta.dirname, "questions.sample.json");
  const questionsPath = fs.existsSync(realQuestions) ? realQuestions : sampleQuestions;
  const questions = loadQuestions(questionsPath); // stops the server with a clear message if broken
  console.log(`Loaded ${questions.length} questions from ${path.relative(import.meta.dirname, questionsPath)}`);
  return questions;
}

let state = loadState(savePath);
if (state) {
  console.log(`Restored the saved game from ${path.relative(import.meta.dirname, savePath)}: ` +
    `${Object.keys(state.teams).length} teams, question ${state.questionIndex + 1} of ${state.questions.length}, phase ${state.phase}`);
} else {
  state = createGame(loadQuestionFile());
}

// Undo: a deep copy of the game is taken before each admin action. Kept in memory
// only: it is for mis-clicks, not for restarts.
const undoStack = [];

// ---- Web server and sockets ----

const app = express();
app.use(express.static(path.join(import.meta.dirname, "public")));

const httpServer = createServer(app);
const io = new Server(httpServer);

// Send each audience its own view, and save. Every change ends here, so saving
// here means a change can never be forgotten.
function broadcast() {
  const now = Date.now();
  io.to("display").emit("state", displayView(now));
  io.to("admin").emit("state", { ...adminView(state, now), undoCount: undoStack.length });
  for (const teamId of Object.keys(state.teams)) {
    io.to(`team:${teamId}`).emit("state", teamView(state, teamId, now));
  }
  // Each spectator's phone also gets its own score, rank and choices.
  for (const id of Object.keys(state.crowd.spectators)) {
    io.to(`spectator:${id}`).emit("crowd:me", meView(state.crowd, id, state.phase));
  }
  try {
    saveState(state, savePath);
  } catch (error) {
    console.error(`WARNING: could not save the game: ${error.message}`);
  }
}

// Predictions and picks can arrive from a hundred phones at once. Rather than one full
// broadcast per tap, gather them and broadcast at most every 200 ms.
let broadcastTimer = null;
function broadcastSoon() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    broadcast();
  }, 200);
}

// The cheer meter changes many times a second and nobody needs it saved, so it lives
// outside the game state and goes to displays only, in its own small "cheer" event.
const meter = createMeter();
let lastSentMeter = "";
setInterval(() => {
  decayCheer(meter);
  const payload = { student: Math.round(meter.student), prof: Math.round(meter.prof) };
  const key = `${payload.student}:${payload.prof}`;
  if (key !== lastSentMeter) {
    lastSentMeter = key;
    io.to("display").emit("cheer", payload);
  }
}, CHEER_TICK_MS);

// The projector and spectators get the public view plus the address to join.
function displayView(now) {
  return { ...publicView(state, now), joinUrl };
}

// Reply only with what the page needs, never the whole team object.
function teamReply(result) {
  if (!result.ok) return { ok: false, error: result.error };
  const { id, name, side, code } = result.team;
  return { ok: true, teamId: id, name, side, code };
}

function joinTeamRoom(socket, team) {
  socket.join(`team:${team.id}`);
  socket.data.teamId = team.id;
  socket.emit("state", teamView(state, team.id, Date.now()));
}

// Compares the typed key with ADMIN_KEY without leaking, through timing, how many
// characters matched.
function isAdminKey(key) {
  if (typeof key !== "string") return false;
  const digest = (text) => crypto.createHash("sha256").update(text).digest();
  return crypto.timingSafeEqual(digest(key), digest(ADMIN_KEY));
}

// Each admin action names a game function. `now` is the server's clock.
const adminActions = {
  show: (action) => showQuestion(state, action.index),
  open: (_action, now) => openBuzzers(state, now),
  judge: (action, now) => judge(state, action.correct, now),
  reveal: () => reveal(state),
  markLockIn: (action) => markLockIn(state, action.teamId, action.correct),
  adjust: (action) => adjustScore(state, action.teamId, action.delta),
  kick: (action) => {
    const result = kickTeam(state, action.teamId);
    if (result.ok) {
      io.to(`team:${action.teamId}`).emit("team:kicked");
      io.in(`team:${action.teamId}`).socketsLeave(`team:${action.teamId}`);
    }
    return result;
  },
  toggleRegistration: () => toggleRegistration(state),
  reset: () => {
    state = createGame(state.questions);
    io.emit("game:reset"); // every page forgets its saved team code or spectator id
    return { ok: true };
  },
};

const reply = (callback, result) => {
  if (typeof callback === "function") callback(result);
};

io.on("connection", (socket) => {
  socket.on("display:join", () => {
    socket.join("display");
    socket.emit("state", displayView(Date.now()));
    socket.emit("cheer", { student: Math.round(meter.student), prof: Math.round(meter.prof) });
  });

  // ---- Admin ----

  socket.on("admin:auth", (details, callback) => {
    if (!isAdminKey(details?.key)) return reply(callback, { ok: false, error: "Wrong key" });
    socket.join("admin");
    socket.data.isAdmin = true;
    reply(callback, { ok: true });
    socket.emit("state", { ...adminView(state, Date.now()), undoCount: undoStack.length });
  });

  socket.on("admin:action", (action, callback) => {
    if (!socket.data.isAdmin) return reply(callback, { ok: false, error: "Not an admin" });
    if (typeof action !== "object" || action === null) return reply(callback, { ok: false, error: "Unknown action" });

    if (action.type === "undo") {
      const previous = undoStack.pop();
      if (!previous) return reply(callback, { ok: false, error: "Nothing to undo" });
      state = previous;
      reply(callback, { ok: true });
      return broadcast();
    }

    if (!Object.hasOwn(adminActions, action.type)) return reply(callback, { ok: false, error: "Unknown action" });
    undoStack.push(structuredClone(state)); // a frozen copy of the game before this action
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();

    const result = adminActions[action.type](action, Date.now());
    if (!result.ok) undoStack.pop(); // nothing changed, so nothing to undo
    reply(callback, result.ok ? { ok: true } : { ok: false, error: result.error });
    if (result.ok) broadcast();
  });

  // ---- Teams ----

  socket.on("team:register", (details, callback) => {
    const result = registerTeam(state, details ?? {});
    if (result.ok) {
      joinTeamRoom(socket, result.team);
      console.log(`Team registered: ${result.team.name} (${result.team.side}) code ${result.team.code}`);
    }
    reply(callback, teamReply(result));
    if (result.ok) broadcast();
  });

  socket.on("team:rejoin", (details, callback) => {
    const result = rejoinTeam(state, details?.code);
    if (result.ok) joinTeamRoom(socket, result.team);
    reply(callback, teamReply(result));
  });

  socket.on("team:lockin", (details, callback) => {
    if (!socket.data.teamId) return reply(callback, { ok: false, error: "Join a team first" });
    const result = lockIn(state, socket.data.teamId, details?.answer);
    reply(callback, result.ok ? { ok: true } : { ok: false, error: result.error });
    if (result.ok) broadcast();
  });

  socket.on("team:buzz", () => {
    if (!socket.data.teamId) return;
    const result = buzz(state, socket.data.teamId, Date.now());
    if (result.ok) broadcast();
  });

  // ---- Spectators ----

  socket.on("crowd:join", (details, callback) => {
    const result = typeof details?.id === "string"
      ? rejoinCrowd(state.crowd, details.id)
      : joinCrowd(state.crowd, details?.name);
    if (!result.ok) return reply(callback, { ok: false, error: result.error });
    const { id, name } = result.spectator;
    socket.join(`spectator:${id}`);
    socket.data.spectatorId = id;
    reply(callback, { ok: true, id, name });
    socket.emit("crowd:me", meView(state.crowd, id, state.phase));
    broadcastSoon(); // the crowd count changed
  });

  socket.on("crowd:predict", (details, callback) => {
    const result = predict(state.crowd, socket.data.spectatorId, details?.side, state.phase);
    reply(callback, result.ok ? { ok: true } : { ok: false, error: result.error });
    if (result.ok) broadcastSoon();
  });

  socket.on("crowd:pick", (details, callback) => {
    const question = state.questions[state.questionIndex];
    const result = pick(state.crowd, socket.data.spectatorId, details?.choice, state.phase, question, state.current.lockInsOpen);
    reply(callback, result.ok ? { ok: true } : { ok: false, error: result.error });
    if (result.ok) broadcastSoon();
  });

  socket.on("crowd:cheer", (details) => {
    // Rate limit: a script hammering this event moves the meter no faster than a person.
    const now = Date.now();
    if (now - (socket.data.lastCheerAt ?? 0) < CHEER_MIN_GAP_MS) return;
    socket.data.lastCheerAt = now;
    cheer(meter, details?.side);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Listening on http://localhost:${PORT}`);
  console.log(`Join address shown on the projector: ${joinUrl}`);
  console.log(`Saving the game to ${path.relative(import.meta.dirname, savePath)}`);
});
