import express from "express";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createGame, registerTeam, rejoinTeam, buzz, clearBuzzes } from "./game.js";

const PORT = Number(process.env.PORT ?? 3000);

const app = express();
const publicDir = path.join(import.meta.dirname, "public");
app.use(express.static(publicDir));

const httpServer = createServer(app);
const io = new Server(httpServer);

const state = createGame();

// What every page may see. Rejoin codes are left out, so no one can read another
// team's code in their browser. Chunk 3 replaces this with views.js.
function publicState() {
  const teams = Object.values(state.teams).map(({ id, name, side, score }) => ({ id, name, side, score }));
  const buzzes = state.current.buzzes.map(({ teamId, at }) => ({ teamId, name: state.teams[teamId].name, at }));
  return { teams, buzzes };
}

function broadcast() {
  io.emit("state", publicState());
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
}

io.on("connection", (socket) => {
  socket.emit("state", publicState());

  socket.on("team:register", (details, reply) => {
    const result = registerTeam(state, details ?? {});
    if (result.ok) {
      joinTeamRoom(socket, result.team);
      console.log(`Team registered: ${result.team.name} (${result.team.side}) code ${result.team.code}`);
    }
    if (typeof reply === "function") reply(teamReply(result));
    if (result.ok) broadcast();
  });

  socket.on("team:rejoin", (details, reply) => {
    const result = rejoinTeam(state, details?.code);
    if (result.ok) joinTeamRoom(socket, result.team);
    if (typeof reply === "function") reply(teamReply(result));
  });

  socket.on("team:buzz", () => {
    if (!socket.data.teamId) return;
    const result = buzz(state, socket.data.teamId, Date.now());
    if (result.ok) broadcast();
  });

  // Temporary: anyone can clear the buzzes. The admin page takes this over in Chunk 3.
  socket.on("reset", () => {
    clearBuzzes(state);
    broadcast();
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
