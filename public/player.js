import { connect, PHASE_LABELS, SIDE_NAMES, renderQuestion, startCountdown } from "/common.js";

const socket = connect();
const $ = (selector) => document.querySelector(selector);
const CODE_KEY = "teamCode";

function showRegister() {
  $("#register").hidden = false;
  $("#play").hidden = true;
}

function showPlay({ name, side, code }) {
  $("#team-label").textContent = `${name} · ${SIDE_NAMES[side]}`;
  $("#code").textContent = code;
  $("#register").hidden = true;
  $("#play").hidden = false;
}

// Runs on the first connection AND after every reconnect (refresh, Wi-Fi blip,
// laptop waking up). A reconnect is a brand new socket, so we must rejoin each time.
socket.on("connect", () => {
  $("#connection").textContent = "Connected";
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
socket.on("disconnect", () => { $("#connection").textContent = "Reconnecting…"; });

$("#register").addEventListener("submit", (event) => {
  event.preventDefault(); // stop the browser reloading the page
  const name = $("#team-name").value;
  const side = document.querySelector('input[name="side"]:checked')?.value;

  socket.emit("team:register", { name, side }, (reply) => {
    if (!reply.ok) {
      $("#error").textContent = reply.error;
      return;
    }
    $("#error").textContent = "";
    localStorage.setItem(CODE_KEY, reply.code);
    showPlay(reply);
  });
});

$("#buzz").addEventListener("click", () => socket.emit("team:buzz"));

// Only registered teams receive "state" (their own team view). Redraw from it.
socket.on("state", (view) => {
  const { me, phase } = view;
  $("#score").textContent = me.score;
  $("#phase").textContent = PHASE_LABELS[phase];
  $("#phase").className = `phase ${phase}`;
  renderQuestion($("#question"), view.question);

  const myPlace = view.buzzes.findIndex((b) => b.teamId === me.id);
  const iHaveFloor = view.floorTeam?.id === me.id;
  $("#buzz").disabled = !(phase === "open" || phase === "answering") || myPlace >= 0;
  startCountdown($("#countdown"), iHaveFloor ? view.answerRemainingMs : null);

  let status = "";
  if (iHaveFloor) status = "You have the floor! Answer out loud.";
  else if (view.floorTeam) status = `${view.floorTeam.name} is answering`;
  if (myPlace > 0 && !iHaveFloor) status += ` · you buzzed #${myPlace + 1}`;
  if (phase === "revealed") {
    status = view.result.winner?.id === me.id ? `Correct! +${view.result.points}`
      : view.result.winner ? `${view.result.winner.name} got it`
      : "Nobody got it";
  }
  $("#status").textContent = status;
});
