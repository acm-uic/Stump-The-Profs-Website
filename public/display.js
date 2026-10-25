import {
  connect, PHASE_LABELS, answerText, renderQuestion, renderTeamList, startCountdown, upNextText, formatMs,
} from "/common.js";

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

socket.on("connect", () => {
  $("#connection").textContent = "Connected";
  socket.emit("display:join"); // join the "display" room, which gets the public view
});
socket.on("disconnect", () => { $("#connection").textContent = "Reconnecting…"; });

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

// Redraw everything from the server's view every time.
socket.on("state", (view) => {
  $("#phase").textContent = PHASE_LABELS[view.phase];
  $("#phase").className = `phase ${view.phase}`;
  $("#progress").textContent = view.questionNumber > 0 ? `Question ${view.questionNumber} of ${view.questionTotal}` : "";
  const url = document.createElement("strong");
  url.textContent = view.joinUrl.replace(/^https?:\/\//, "");
  $("#join").replaceChildren("Join: ", url);

  $("#waiting").hidden = Boolean(view.question);
  renderQuestion($("#question"), view.question);
  renderResult(view);

  $("#floor-box").hidden = !view.floorTeam;
  $("#floor").textContent = view.floorTeam ? `${view.floorTeam.name} is answering` : "";
  startCountdown($("#countdown"), view.answerRemainingMs, view.answerTotalMs, $("#countdown-bar"));
  $("#up-next").textContent = upNextText(view);

  $("#lockin-line").textContent = view.result?.lockInWinners.length
    ? `Lock-in bonus (+${view.lockInPoints}): ${view.result.lockInWinners.map((t) => t.name).join(", ")}`
    : view.lockInCount && view.phase !== "revealed"
      ? `${view.lockInCount} team${view.lockInCount === 1 ? "" : "s"} locked in an answer`
      : "";

  // The first three buzzes, with reaction times: fast enough to be exciting, short enough to read.
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
});
