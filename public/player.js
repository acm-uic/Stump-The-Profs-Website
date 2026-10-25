// Start on a WebSocket. Socket.IO's default starts on HTTP polling and upgrades
// later, and a buzz sent during that upgrade can arrive after a later buzz.
const socket = io({ transports: ["websocket", "polling"] });

const nameInput = document.querySelector("#name");
const buzzButton = document.querySelector("#buzz");
const status = document.querySelector("#status");

socket.on("connect", () => { status.textContent = "Connected"; });
socket.on("disconnect", () => { status.textContent = "Reconnecting…"; });

buzzButton.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (name === "") {
    status.textContent = "Type a name first";
    return;
  }
  socket.emit("team:buzz", { name });
});

// Show this player's own place, using only the state the server sends.
socket.on("state", ({ buzzes }) => {
  const place = buzzes.findIndex((b) => b.name === nameInput.value.trim());
  if (place === 0) status.textContent = "You were FIRST!";
  else if (place > 0) status.textContent = `You were #${place + 1}`;
  else if (socket.connected) status.textContent = "Connected";
});
