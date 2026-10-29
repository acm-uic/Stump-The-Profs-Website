import {
  connect, PHASE_LABELS, SIDE_NAMES, answerText, renderQuestion, startCountdown, upNextText, choiceText, lockedInText,
} from "/common.js";

const socket = connect();
const $ = (selector) => document.querySelector(selector);
const message = $("#message");
const KEY_STORAGE = "adminKey";

// ---- Unlocking with the admin key ----

function showLogin(error = "") {
  $("#login").hidden = false;
  $("#panel").hidden = true;
  $("#login-error").textContent = error;
  $("#key").focus();
}

function authenticate(key) {
  socket.emit("admin:auth", { key }, (reply) => {
    if (reply.ok) {
      localStorage.setItem(KEY_STORAGE, key);
      $("#login").hidden = true;
      $("#panel").hidden = false;
    } else {
      localStorage.removeItem(KEY_STORAGE);
      showLogin(reply.error);
    }
  });
}

// Like team rejoin: after every reconnect, prove we are the admin again.
socket.on("connect", () => {
  $("#connection").textContent = "Connected";
  const saved = localStorage.getItem(KEY_STORAGE);
  if (saved) authenticate(saved);
  else showLogin();
});
socket.on("disconnect", () => { $("#connection").textContent = "Reconnecting…"; });

$("#login").addEventListener("submit", (event) => {
  event.preventDefault();
  authenticate($("#key").value.trim());
});

// ---- Actions ----

// Every button sends one admin action. The server decides whether it is allowed;
// disabling buttons here only helps the host see what makes sense right now.
function send(action) {
  message.textContent = "";
  socket.emit("admin:action", action, (reply) => {
    if (!reply.ok) message.textContent = reply.error;
  });
}
$("#show").addEventListener("click", () => send({ type: "show" }));
$("#open").addEventListener("click", () => send({ type: "open" }));
$("#next").addEventListener("click", () => send({ type: "next" }));
$("#correct").addEventListener("click", () => send({ type: "judge", correct: true }));
$("#wrong").addEventListener("click", () => send({ type: "judge", correct: false }));
$("#reveal").addEventListener("click", () => send({ type: "reveal" }));
$("#undo").addEventListener("click", () => send({ type: "undo" }));
$("#registration").addEventListener("click", () => send({ type: "toggleRegistration" }));
$("#reset").addEventListener("click", () => {
  // The one place a blocking dialog is right: this should be hard to do by accident.
  if (confirm("Reset the whole game? All teams, scores and crowd points are cleared. (Undo can bring it back.)")) {
    send({ type: "reset" });
  }
});

// ---- Backups and questions ----

function toolMessage(text, ok) {
  $("#tool-message").textContent = text;
  $("#tool-message").className = ok ? "ok" : "bad";
}

// Export: the server sends the whole game; the browser saves it as a file.
$("#export").addEventListener("click", () => {
  socket.emit("admin:action", { type: "export" }, (reply) => {
    if (!reply.ok) return toolMessage(reply.error, false);
    const blob = new Blob([JSON.stringify(reply.data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `stump-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    toolMessage("Backup downloaded", true);
  });
});

// Upload: read the chosen file, check it is JSON, and let the server validate the questions.
$("#upload").addEventListener("change", async () => {
  const file = $("#upload").files[0];
  $("#upload").value = ""; // so choosing the same file again still triggers
  if (!file) return;
  let questions;
  try {
    questions = JSON.parse(await file.text());
  } catch (error) {
    return toolMessage(`That file is not valid JSON: ${error.message}`, false);
  }
  socket.emit("admin:action", { type: "loadQuestions", questions }, (reply) => {
    if (reply.ok) toolMessage(`Loaded ${reply.count} questions from ${file.name}`, true);
    else toolMessage(reply.error, false);
  });
});

// Keyboard shortcuts for the host. Clicking a disabled button does nothing, and the
// server checks the phase anyway, so a double press cannot judge twice.
const SHORTCUTS = { n: "#show", o: "#open", a: "#next", c: "#correct", w: "#wrong", r: "#reveal", z: "#undo" };
document.addEventListener("keydown", (event) => {
  if (event.target.tagName === "INPUT" || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
  const button = $(SHORTCUTS[event.key.toLowerCase()] ?? "#none");
  if (button && !button.disabled && !$("#panel").hidden) button.click();
});

// ---- Drawing ----

// One sealed answer: who, how fast, what they locked in, and where it stands.
function answerRow(view, entry) {
  const li = document.createElement("li");
  const left = document.createElement("span");
  const name = document.createElement("strong");
  name.textContent = entry.name;
  const answer = document.createElement("span");
  answer.className = "sealed-answer";
  answer.textContent = choiceText(view.question, entry.answer);
  left.append(name, answer);
  const mark = document.createElement("span");
  if (entry.winner) { mark.textContent = `Won +${view.result?.points ?? ""}`; mark.className = "mark-right"; }
  else if (entry.correct === true) { mark.textContent = entry.awarded ? `Also right +${view.lockInPoints}` : "Right"; mark.className = "mark-right"; }
  else if (entry.correct === false) { mark.textContent = entry.read || view.phase === "revealed" ? "Wrong" : "Wrong, not read yet"; mark.className = "mark-wrong"; }
  else if (view.waitingOn?.id === entry.teamId) { mark.textContent = "Being read: Correct or Wrong?"; mark.className = "mark-pending"; }
  else { mark.textContent = view.phase === "revealed" ? "Needs marking" : "You decide when it is read"; mark.className = "mark-pending"; }
  li.append(left, mark);

  // Free response answers can be marked after the reveal. Clicking again is safe.
  if (view.question?.type === "free" && view.phase === "revealed" && !entry.winner) {
    const buttons = document.createElement("span");
    for (const [label, correct] of [["Right", true], ["Wrong", false]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => send({ type: "markAnswer", teamId: entry.teamId, correct }));
      buttons.append(button);
    }
    li.append(buttons);
  }
  return li;
}

// One team: name, side, rejoin code (to read out if a laptop loses it), score,
// a points box for adjustments, and Remove.
function teamRow(team, phase) {
  const row = document.createElement("div");
  row.className = "team-row";
  const left = document.createElement("span");
  const side = document.createElement("span");
  side.className = "side";
  side.textContent = SIDE_NAMES[team.side];
  left.append(team.name, side);
  const code = document.createElement("span");
  code.className = "code";
  code.textContent = team.code;
  left.append(code);
  const score = document.createElement("strong");
  score.textContent = team.score;

  const actions = document.createElement("div");
  actions.className = "actions";
  const input = document.createElement("input");
  input.type = "number";
  input.step = "50";
  input.placeholder = "± points";
  const apply = document.createElement("button");
  apply.textContent = "Adjust";
  apply.addEventListener("click", () => {
    send({ type: "adjust", teamId: team.id, delta: Number(input.value) });
    input.value = "";
  });
  const kick = document.createElement("button");
  kick.className = "kick";
  kick.textContent = "Remove";
  kick.disabled = phase === "open" || phase === "judging";
  kick.addEventListener("click", () => {
    if (confirm(`Remove ${team.name} from the game?`)) send({ type: "kick", teamId: team.id });
  });
  actions.append(input, apply, kick);
  row.append(left, score, actions);
  return row;
}

socket.on("state", (view) => {
  const { phase } = view;
  $("#phase").textContent = PHASE_LABELS[phase];
  $("#phase").className = `phase ${phase}`;
  $("#progress").textContent = view.questionNumber > 0 ? `Question ${view.questionNumber} of ${view.questionTotal}` : `${view.questionTotal} questions loaded`;
  startCountdown($("#countdown"), view.answerRemainingMs);

  renderQuestion($("#question"), view.question);
  $("#answer-box").hidden = !view.question;
  $("#answer").textContent = answerText(view.question);

  const waiting = view.answers.find((entry) => entry.teamId === view.waitingOn?.id);
  $("#floor").textContent = phase === "open"
    ? `${lockedInText(view)}. Answers close by themselves when the clock runs out, or press A to start reading now.`
    : waiting ? `${waiting.name} says: ${choiceText(view.question, waiting.answer)}`
    : phase === "judging" ? "Press A to read the next answer." : "";
  $("#up-next").textContent = phase === "judging"
    ? upNextText(view) || "This is the last answer: Wrong ends the question"
    : "";
  $("#result").textContent = view.result
    ? view.result.winner ? `${view.result.winner.name} got it: +${view.result.points}` : "Nobody got it"
    : "";

  const isLast = view.questionNumber >= view.questionTotal;
  $("#show").disabled = !((phase === "lobby" || phase === "revealed") && !isLast);
  $("#open").disabled = phase !== "preview";
  $("#next").disabled = !(phase === "open" || (phase === "judging" && !view.waitingOn));
  $("#correct").disabled = !view.waitingOn;
  $("#wrong").disabled = !view.waitingOn;
  $("#reveal").disabled = !(phase === "open" || phase === "judging");
  $("#undo").disabled = view.undoCount === 0;
  $("#undo").firstChild.textContent = view.undoCount ? `Undo (${view.undoCount})` : "Undo";
  $("#registration").textContent = view.registrationOpen ? "Close registration" : "Reopen registration";

  $("#lockin-value").textContent = view.question ? `(in lock-in order; other right answers get ${view.lockInPoints})` : "";
  if (view.answers.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-note";
    li.textContent = phase === "open" ? "Nobody has locked in yet" : "No answers yet";
    $("#answers").replaceChildren(li);
  } else {
    $("#answers").replaceChildren(...view.answers.map((entry) => answerRow(view, entry)));
  }

  drawMusic(view);

  // Don't redraw the team list while the host is part-way through typing an adjustment.
  const typing = document.activeElement?.tagName === "INPUT" && $("#teams").contains(document.activeElement)
    && document.activeElement.value !== "";
  if (!typing) {
    $("#teams").replaceChildren(...view.teams.map((t) => teamRow(t, phase)));
    if (view.teams.length === 0) $("#teams").textContent = "No teams yet";
  }

  $("#question-list").replaceChildren(...view.questionList.map((q) => {
    const li = document.createElement("li");
    li.textContent = `[${q.type}] ${q.prompt}${q.music ? " (has music)" : ""}`;
    if (q.number === view.questionNumber) li.className = "current";
    else if (q.played) li.className = "played";
    return li;
  }));
});

// ---- Music: the projector plays it; this panel steers it ----

$("#music-form").addEventListener("submit", (event) => {
  event.preventDefault();
  $("#music-message").textContent = "";
  socket.emit("admin:action", { type: "music", background: $("#music-link").value.trim() }, (reply) => {
    if (!reply.ok) $("#music-message").textContent = reply.error;
  });
});
$("#music-toggle").addEventListener("click", () => {
  send({ type: "music", playing: $("#music-toggle").dataset.playing !== "true" });
});
$("#music-volume").addEventListener("change", () => {
  send({ type: "music", volume: Number($("#music-volume").value) });
});
socket.on("music:status", ({ message }) => {
  $("#music-message").textContent = `Projector: ${message}`;
});

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function drawMusic(view) {
  const { music } = view;
  // Leave the link box and the slider alone while the host is using them.
  if (document.activeElement !== $("#music-link")) $("#music-link").value = view.musicLink;
  if (document.activeElement !== $("#music-volume")) $("#music-volume").value = music.volume;
  $("#music-toggle").dataset.playing = String(music.playing);
  $("#music-toggle").textContent = music.playing ? "Pause" : "Play";
  const track = music.theme ?? music.background;
  $("#music-now").textContent = !track ? "No background link set"
    : !music.playing ? "Paused"
    : music.theme ? `Playing question ${music.theme.questionNumber}'s theme from ${clock(music.theme.start)}`
    : "Playing the background music";
}
