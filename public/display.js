import {
  connect, PHASE_LABELS, answerText, renderQuestion, renderTeamList, startCountdown, upNextText, formatMs,
  ordinal, choiceText, lockedInText, renderReadOut, SIDE_NAMES,
} from "/common.js";
import { startMusic } from "/music.js";

const socket = connect();
const $ = (selector) => document.querySelector(selector);

// display.html?projector is the big-screen layout; without it, the phone layout.
const isProjector = new URLSearchParams(location.search).has("projector");
document.body.classList.toggle("projector", isProjector);

// Full screen needs a key press or click; browsers refuse it on page load.
document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() !== "f") return;
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
});

const SPECTATOR_KEY = "spectatorId";

socket.on("connect", () => {
  $("#connection").textContent = "Connected";
  socket.emit("display:join"); // join the "display" room, which gets the public view
  // Phones that joined the crowd before (refresh, reconnect) rejoin with their saved id.
  // The server hands out ids: crypto.randomUUID() does not exist on plain http:// pages.
  const savedId = !isProjector && localStorage.getItem(SPECTATOR_KEY);
  if (savedId) {
    socket.emit("crowd:join", { id: savedId }, (reply) => {
      if (reply.ok) showCrowdControls();
      else localStorage.removeItem(SPECTATOR_KEY);
    });
  }
});
socket.on("disconnect", () => { $("#connection").textContent = "Reconnecting…"; });

// The host started a new game: crowd ids from the old game no longer exist.
socket.on("game:reset", () => {
  localStorage.removeItem(SPECTATOR_KEY);
  me = null;
  $("#crowd-join").hidden = false;
  $("#crowd-controls").hidden = true;
  $("#crowd-error").textContent = "A new game started. Join again!";
});

function renderResult(view) {
  const box = $("#result");
  box.hidden = !view.result;
  if (!view.result) return;
  const { winner, points } = view.result;
  box.className = `result-banner${winner ? " win" : ""}`;
  box.replaceChildren(winner ? `${winner.name} got it! +${points}` : "Nobody got it");
  // Choices are highlighted in place; a free-response answer needs spelling out.
  if (view.question.type === "free") {
    const answer = document.createElement("span");
    answer.className = "answer";
    answer.textContent = `Answer: ${answerText(view.question)}`;
    box.append(answer);
  }
}

function renderBoard(view) {
  const { sides } = view;
  $("#total-students").textContent = sides.student.toLocaleString();
  $("#total-profs").textContent = sides.prof.toLocaleString();
  const total = sides.student + sides.prof;
  const share = total === 0 ? 50 : (sides.student / total) * 100;
  $("#tug-s").style.width = `${share}%`;
  $("#tug-p").style.width = `${100 - share}%`;
  renderTeamList($("#students"), view.teams.filter((t) => t.side === "student"), "No student teams yet");
  renderTeamList($("#profs"), view.teams.filter((t) => t.side === "prof"), "No professor teams yet");
}

// ---- Crowd: the phone controls ----

let lastView = null;
let me = null;

function showCrowdControls() {
  $("#crowd-join").hidden = true;
  $("#crowd-controls").hidden = false;
}

function crowdSend(event, data) {
  $("#crowd-error").textContent = "";
  socket.emit(event, data, (reply) => {
    if (!reply.ok) $("#crowd-error").textContent = reply.error;
  });
}

$("#crowd-join").addEventListener("submit", (event) => {
  event.preventDefault();
  socket.emit("crowd:join", { name: $("#crowd-name").value }, (reply) => {
    if (!reply.ok) {
      $("#crowd-error").textContent = reply.error;
      return;
    }
    $("#crowd-error").textContent = "";
    localStorage.setItem(SPECTATOR_KEY, reply.id);
    showCrowdControls();
  });
});

for (const button of document.querySelectorAll("#predict-row button")) {
  button.addEventListener("click", () => crowdSend("crowd:predict", { side: button.dataset.side }));
}

// Cheering: the server ignores taps closer than 150 ms, so don't bother sending them.
let lastCheer = 0;
for (const button of document.querySelectorAll("[data-cheer]")) {
  button.addEventListener("click", () => {
    const now = performance.now();
    if (now - lastCheer < 150) return;
    lastCheer = now;
    socket.emit("crowd:cheer", { side: button.dataset.cheer });
  });
}

function renderCrowdPanel() {
  if (isProjector || !lastView || !me) return;
  const view = lastView;
  $("#crowd-me").textContent = `Playing as ${me.name}`;

  // One prediction for the whole game, open until the first question starts.
  for (const button of document.querySelectorAll("#predict-row button")) {
    button.classList.toggle("chosen", me.prediction === button.dataset.side);
    button.disabled = !view.predictionsOpen;
  }
  const side = SIDE_NAMES[me.prediction];
  $("#crowd-feedback").textContent = view.final
    ? me.predictionRight ? "You called it!"
      : !me.prediction ? ""
      : view.final.winnerSide ? "Not this time."
      : "It's a tie, so nobody called it."
    : view.predictionsOpen
      ? me.prediction ? `You picked ${side}. You can change it until the first question starts.` : "Pick a side before the first question starts!"
      : me.prediction ? `Locked in: ${side}.` : "Predictions closed when the first question started.";
}

socket.on("crowd:me", (data) => {
  me = data;
  renderCrowdPanel();
});

// ---- Crowd: the board (projector and phones) ----

socket.on("cheer", ({ student, prof }) => {
  const total = student + prof;
  const share = total === 0 ? 50 : (student / total) * 100;
  $("#cheer-s").style.width = `${share}%`;
  $("#cheer-p").style.width = `${100 - share}%`;
});

function renderCrowdBoard(view) {
  const { crowd } = view;
  const counts = crowd.predictionCounts;
  const total = counts.student + counts.prof;
  const share = total === 0 ? 50 : (counts.student / total) * 100;
  $("#predict-title").textContent = `Who the crowd thinks wins (${crowd.count} playing)`;
  $("#pred-s").style.width = `${share}%`;
  $("#pred-p").style.width = `${100 - share}%`;
  $("#pred-s-label").textContent = `Students ${counts.student}`;
  $("#pred-p-label").textContent = `Profs ${counts.prof}`;
}

// The end of the night: the winning side, every team ranked, and the awards.
const AWARD_UNITS = {
  ms: (value) => formatMs(value),
  times: (value) => `${value} time${value === 1 ? "" : "s"}`,
  steals: (value) => `${value} steal${value === 1 ? "" : "s"}`,
};
function renderFinal(view) {
  const { final } = view;
  $("#final").hidden = !final;
  if (!final) return;
  $("#final-winner").textContent = final.winnerSide ? `${SIDE_NAMES[final.winnerSide]} win!` : "It's a tie!";
  $("#final-winner").dataset.side = final.winnerSide ?? "";
  const { called, predicted } = final.crowd;
  $("#final-crowd").textContent = predicted === 0 ? ""
    : final.winnerSide ? `${called} of ${predicted} in the crowd called it.`
    : "Nobody in the crowd predicted a tie.";
  $("#standings").replaceChildren(...final.standings.map((team) => {
    const li = document.createElement("li");
    if (team.rank <= 3) li.className = `podium p${team.rank}`;
    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = ordinal(team.rank);
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = team.name; // textContent: team names are typed by players
    const side = document.createElement("span");
    side.className = "side-chip";
    side.dataset.side = team.side;
    side.textContent = SIDE_NAMES[team.side];
    const score = document.createElement("strong");
    score.textContent = team.score.toLocaleString();
    li.append(rank, name, side, score);
    return li;
  }));
  $("#awards").replaceChildren(...final.awards.map((award) => {
    const li = document.createElement("li");
    const title = document.createElement("span");
    title.className = "award-title";
    title.textContent = award.title;
    const who = document.createElement("strong");
    who.textContent = award.teams.map((t) => t.name).join(", ");
    const detail = document.createElement("span");
    detail.textContent = AWARD_UNITS[award.unit](award.value);
    li.append(title, who, detail);
    return li;
  }));
}

// Redraw everything from the server's view every time.
socket.on("state", (view) => {
  lastView = view;
  $("#phase").textContent = PHASE_LABELS[view.phase];
  $("#phase").className = `phase ${view.phase}`;
  $("#progress").textContent = view.questionNumber > 0 && !view.final ? `Question ${view.questionNumber} of ${view.questionTotal}` : "";
  const url = document.createElement("strong");
  url.textContent = view.joinUrl.replace(/^https?:\/\//, "");
  $("#join").replaceChildren("Join: ", url);

  $("#waiting").hidden = Boolean(view.question || view.final);
  renderFinal(view);
  renderQuestion($("#question"), view.question);
  renderResult(view);

  // While answers are open: the clock and how many teams are in. While they are read
  // out: whose answer is up. Nothing anyone typed shows until it is read out.
  const open = view.phase === "open";
  $("#floor-box").hidden = !(open || view.floorTeam);
  $("#floor").textContent = open ? lockedInText(view) : view.floorTeam ? `${view.floorTeam.name} says` : "";
  $("#countdown-track").hidden = !open;
  startCountdown($("#countdown"), view.answerRemainingMs, view.answerTotalMs, $("#countdown-bar"));
  const reading = view.floorTeam && view.readOut.find((entry) => entry.team.id === view.floorTeam.id);
  $("#floor-answer").textContent = reading ? choiceText(view.question, reading.answer) : "";
  renderReadOut($("#read-out"), { ...view, readOut: view.readOut.filter((entry) => entry.correct !== null) });
  $("#up-next").textContent = upNextText(view);

  $("#lockin-line").textContent = view.result?.lockInWinners.length
    ? `Also right (+${view.lockInPoints}): ${view.result.lockInWinners.map((t) => t.name).join(", ")}`
    : "";

  // The first three lock-ins, with reaction times, while answers are open. Once reading
  // starts, the read-out list takes their place.
  $("#buzzes").hidden = view.phase !== "open";
  $("#buzzes").replaceChildren(...view.buzzes.slice(0, 3).map((b, i) => {
    const li = document.createElement("li");
    li.textContent = b.name;
    const gap = document.createElement("span");
    gap.className = "gap";
    gap.textContent = i === 0 ? formatMs(b.ms) : `+${b.ms - view.buzzes[0].ms} ms`;
    li.append(gap);
    return li;
  }));

  renderBoard(view);
  renderCrowdBoard(view);
  renderCrowdPanel();
  if (isProjector) music.update(view.music);
});

// ---- Music: only the projector plays it ----

const music = isProjector ? startMusic({
  hintEl: $("#music-hint"),
  onProblem: (message) => socket.emit("music:status", { message }),
}) : { update() {} };
