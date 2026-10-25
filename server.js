import express from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  createGame, registerTeam, rejoinTeam, showQuestion, openBuzzers, buzz, judge, reveal,
} from "./game.js";
import { loadQuestions } from "./store.js";
import { publicView, teamView, adminView } from "./views.js";

const PORT = Number(process.env.PORT ?? 3000);

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
  io.to("display").emit("state", publicView(state, now));
  io.to("admin").emit("state", adminView(state, now));
  for (const teamId of Object.keys(state.teams)) {
    io.to(`team:${teamId}`).emit("state", teamView(state, teamId, now));
  }
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
};

const reply = (callback, result) => {
  if (typeof callback === "function") callback(result);
};

io.on("connection", (socket) => {
  socket.on("display:join", () => {
    socket.join("display");
    socket.emit("state", publicView(state, Date.now()));
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

  socket.on("team:buzz", () => {
    if (!socket.data.teamId) return;
    const result = buzz(state, socket.data.teamId, Date.now());
    if (result.ok) broadcast();
  });
});

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address);
}

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Listening on http://localhost:${PORT}`);
  for (const address of lanAddresses()) {
    console.log(`Other devices: http://${address}:${PORT}/display.html`);
  }
});
