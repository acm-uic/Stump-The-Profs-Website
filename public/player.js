// Start on a WebSocket. Socket.IO's default starts on HTTP polling and upgrades
// later, and a buzz sent during that upgrade can arrive after a later buzz.
const socket = io({ transports: ["websocket", "polling"] });

const CODE_KEY = "teamCode";
const SIDE_NAMES = { student: "Students", prof: "Professors" };

const connection = document.querySelector("#connection");
const registerForm = document.querySelector("#register");
const errorText = document.querySelector("#error");
const playSection = document.querySelector("#play");
const status = document.querySelector("#status");

let myTeamId = null;
let lastState = null; // the newest state from the server, kept so we can redraw after rejoining

function showRegister() {
  myTeamId = null;
  registerForm.hidden = false;
  playSection.hidden = true;
}

function showPlay({ teamId, name, side, code }) {
  myTeamId = teamId;
  document.querySelector("#team-label").textContent = `${name} · ${SIDE_NAMES[side]}`;
  document.querySelector("#code").textContent = code;
  registerForm.hidden = true;
  playSection.hidden = false;
  render();
}

// Runs on the first connection AND after every reconnect (refresh, Wi-Fi blip,
// laptop waking up). A reconnect is a brand new socket, so we must rejoin each time.
socket.on("connect", () => {
  connection.textContent = "Connected";
  const savedCode = localStorage.getItem(CODE_KEY);
  if (!savedCode) return showRegister();

  socket.emit("team:rejoin", { code: savedCode }, (reply) => {
    if (reply.ok) showPlay(reply);
    else {
      localStorage.removeItem(CODE_KEY);
      showRegister();
    }
  });
});

socket.on("disconnect", () => { connection.textContent = "Reconnecting…"; });

registerForm.addEventListener("submit", (event) => {
  event.preventDefault(); // stop the browser reloading the page
  const name = document.querySelector("#team-name").value;
  const side = document.querySelector('input[name="side"]:checked')?.value;

  socket.emit("team:register", { name, side }, (reply) => {
    if (!reply.ok) {
      errorText.textContent = reply.error;
      return;
    }
    errorText.textContent = "";
    localStorage.setItem(CODE_KEY, reply.code);
    showPlay(reply);
  });
});

document.querySelector("#buzz").addEventListener("click", () => {
  socket.emit("team:buzz");
});

// Show this team's own place, using only the state the server sends.
function render() {
  if (!myTeamId || !lastState) return;
  const place = lastState.buzzes.findIndex((b) => b.teamId === myTeamId);
  status.textContent = place === 0 ? "You were FIRST!" : place > 0 ? `You were #${place + 1}` : "";
}

socket.on("state", (state) => {
  lastState = state;
  render();
});
