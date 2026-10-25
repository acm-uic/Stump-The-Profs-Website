import express from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  createGame, registerTeam, rejoinTeam, showQuestion, openBuzzers, buzz, judge, reveal,
  lockIn, markLockIn,
} from "./game.js";
import { loadQuestions } from "./store.js";
import { joinCrowd, rejoinCrowd, predict, pick, meView, createMeter, cheer, decayCheer } from "./crowd.js";
import { CHEER_TICK_MS, CHEER_MIN_GAP_MS } from "./config.js";
import { publicView, teamView, adminView } from "./views.js";

const PORT = Number(process.env.PORT ?? 3000);

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address);
}

// The address shown on the projector. On the cluster, PUBLIC_URL is the https address;
// on a laptop it falls back to this laptop's Wi-Fi address.
const joinUrl = process.env.PUBLIC_URL ?? `http://${lanAddresses()[0] ?? "localhost"}:${PORT}`;

// Real questions live in data/, which git ignores, so the answers never reach GitHub.
// Without that file, the harmless sample questions are used for development.
const realQuestions = path.join(import.meta.dirname, "data", "questions.json");
const sampleQuestions = path.join(import.meta.dirname, "questions.sample.json");
const questionsPath = fs.existsSync(realQuestions) ? realQuestions : sampleQuestions;
const questions = loadQuestions(questionsPath); // stops the server with a clear message if broken
console.log(`Loaded ${questions.length} questions from ${path.relative(import.meta.dirname, questionsPath)}`);

const app = express();
app.use(express.static(path.join(import.meta.dirname, "public")));

const httpServer = createServer(app);
const io = new Server(httpServer);

const state = createGame(questions);

// Send each audience its own view: the projector and spectators get the public
// view, each team gets its own team view, and the admin gets everything.
function broadcast() {
  const now = Date.now();
  io.to("display").emit("state", displayView(now));
  io.to("admin").emit("state", adminView(state, now));
  for (const teamId of Object.keys(state.teams)) {
    io.to(`team:${teamId}`).emit("state", teamView(state, teamId, now));
  }
  // Each spectator's phone also gets its own score, rank and choices.
  for (const id of Object.keys(state.crowd.spectators)) {
    io.to(`spectator:${id}`).emit("crowd:me", meView(state.crowd, id, state.phase));
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

// Each admin action names a game function. `now` is the server's clock.
const adminActions = {
  show: (action) => showQuestion(state, action.index),
  open: (_action, now) => openBuzzers(state, now),
  judge: (action, now) => judge(state, action.correct, now),
  reveal: () => reveal(state),
  markLockIn: (action) => markLockIn(state, action.teamId, action.correct),
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

  // Chunk 9 adds the admin key check here. Until then, anyone can open the admin page.
  socket.on("admin:auth", (_details, callback) => {
    socket.join("admin");
    socket.data.isAdmin = true;
    reply(callback, { ok: true });
    socket.emit("state", adminView(state, Date.now()));
  });

  socket.on("admin:action", (action, callback) => {
    if (!socket.data.isAdmin) return reply(callback, { ok: false, error: "Not an admin" });
    if (typeof action !== "object" || action === null || !Object.hasOwn(adminActions, action.type)) {
      return reply(callback, { ok: false, error: "Unknown action" });
    }
    const result = adminActions[action.type](action, Date.now());
    reply(callback, result.ok ? { ok: true } : { ok: false, error: result.error });
    if (result.ok) broadcast();
  });

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

  socket.on("team:buzz", () => {
    if (!socket.data.teamId) return;
    const result = buzz(state, socket.data.teamId, Date.now());
    if (result.ok) broadcast();
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Listening on http://localhost:${PORT}`);
  console.log(`Join address shown on the projector: ${joinUrl}`);
});
