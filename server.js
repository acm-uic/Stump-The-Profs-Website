import express from "express";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import { Server } from "socket.io";

const PORT = 3000;

const app = express();
const publicDir = path.join(import.meta.dirname, "public");
app.use(express.static(publicDir));

const httpServer = createServer(app);
const io = new Server(httpServer);

// Temporary state for the walking skeleton. Chunk 2 moves this into game.js.
// Each buzz is { name, at }, where `at` is the server's clock in milliseconds.
let buzzes = [];

io.on("connection", (socket) => {
  console.log("Page connected:", socket.id);

  // A page that joins late still gets the current list straight away.
  socket.emit("state", { buzzes });

  socket.on("team:buzz", (data) => {
    const name = String(data?.name ?? "").trim();
    if (name === "") return;
    if (buzzes.some((b) => b.name === name)) return;

    buzzes.push({ name, at: Date.now() });
    console.log("Buzz:", name);
    io.emit("state", { buzzes });
  });

  // Temporary: anyone can reset. The admin page takes this over later.
  socket.on("reset", () => {
    buzzes = [];
    io.emit("state", { buzzes });
  });

  socket.on("disconnect", (reason) => {
    console.log("Page disconnected:", socket.id, reason);
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
