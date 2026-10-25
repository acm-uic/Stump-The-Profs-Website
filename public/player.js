import {
  connect, PHASE_LABELS, SIDE_NAMES, TYPE_LABELS, letter, renderQuestion, startCountdown, formatMs, ordinal,
} from "/common.js";

const socket = connect();
const $ = (selector) => document.querySelector(selector);
const CODE_KEY = "teamCode";

// ---- Joining ----

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

// ---- Buzzing ----

$("#buzz").addEventListener("click", () => socket.emit("team:buzz"));

document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.repeat) return; // holding space sends one buzz
  if (event.target.tagName === "INPUT") return;       // typing a lock-in must not buzz
  event.preventDefault();                              // stop the page scrolling
  if (!$("#buzz").disabled) socket.emit("team:buzz");
});

// The label for each buzzer state. The server decides the state; the page only draws it.
function buzzerLabel(view) {
  const { buzzer, place, floorTeam } = view;
  const line = place === 1 ? "you're next if they miss" : place ? `you're ${ordinal(place)} in line` : "";
  switch (buzzer) {
    case "locked": return ["WAIT", view.phase === "preview" ? "Get ready…" : "Waiting for the host"];
    case "ready": return ["BUZZ", floorTeam ? `${floorTeam.name} is answering · ${line || "buzz to get in line"}` : "Buzzers are open!"];
    case "buzzed": return ["IN LINE", `${floorTeam.name} is answering · ${line}`];
    case "floor": return ["YOUR TURN", "Answer out loud!"];
    case "tried": return ["ANSWERED", floorTeam ? `${floorTeam.name} is answering` : "Waiting for the others"];
    case "over": return ["DONE", resultLine(view)];
    default: return ["", ""];
  }
}

function resultLine(view) {
  const { result, me } = view;
  if (!result) return "";
  if (result.winner?.id === me.id) return `Correct! +${result.points}`;
  return result.winner ? `${result.winner.name} got it` : "Nobody got it";
}

// ---- Lock-ins ----

function sendLockIn(answer) {
  $("#lockin-error").textContent = "";
  socket.emit("team:lockin", { answer }, (reply) => {
    if (!reply.ok) $("#lockin-error").textContent = reply.error;
  });
}
$("#lockin-free").addEventListener("submit", (event) => {
  event.preventDefault();
  sendLockIn($("#lockin-text").value);
});

// Builds the choice buttons only when the question changes, so a button is never
// redrawn under someone's finger.
let builtFor = null;
function buildLockInOptions(view) {
  if (builtFor === view.questionNumber) return;
  builtFor = view.questionNumber;
  $("#lockin-text").value = "";
  const q = view.question;
  const options =
    q?.type === "mc" ? q.choices.map((c, i) => [`${letter(i)}. ${c}`, i])
    : q?.type === "tf" ? [["True", true], ["False", false]]
    : [];
  $("#lockin-options").replaceChildren(...options.map(([text, value]) => {
    const button = document.createElement("button");
    button.textContent = text;
    button.addEventListener("click", () => sendLockIn(value));
    return button;
  }));
}

function lockInText(question, answer) {
  if (question.type === "mc") return `${letter(answer)}. ${question.choices[answer]}`;
  if (question.type === "tf") return answer ? "True" : "False";
  return `"${answer}"`;
}

function renderLockIn(view) {
  const mine = view.myLockIn;
  const showPanel = view.canLockIn || mine;
  $("#lockin").hidden = !showPanel;
  if (!showPanel) return;
  buildLockInOptions(view);
  $("#lockin-points").textContent = view.lockInPoints;
  $("#lockin-options").hidden = !view.canLockIn;
  $("#lockin-free").hidden = !view.canLockIn || view.question.type !== "free";

  let text = "";
  if (mine) {
    text = `Locked in: ${lockInText(view.question, mine.answer)}`;
    if (view.phase === "revealed") {
      if (mine.awarded) text += ` · Right! +${view.lockInPoints}`;
      else if (mine.correct === false) text += " · Not this time";
      else if (mine.correct == null) text += " · Waiting for the host to mark it";
    }
  }
  $("#lockin-result").textContent = text;
}

// ---- Scores, stats, history ----

function renderScores(view) {
  const { me, sides } = view;
  $("#score").textContent = me.score.toLocaleString();
  $("#rank").textContent = ordinal(me.rank);
  $("#rank-of").textContent = `of ${me.rankOf} teams`;

  const mine = sides[me.side];
  const theirs = sides[me.side === "student" ? "prof" : "student"];
  $("#lead").textContent = mine === theirs ? "Tied" : mine > theirs ? `+${mine - theirs}` : `−${theirs - mine}`;

  const total = sides.student + sides.prof;
  const studentShare = total === 0 ? 50 : (sides.student / total) * 100;
  $("#tug-students").style.width = `${studentShare}%`;
  $("#tug-profs").style.width = `${100 - studentShare}%`;
  $("#tug-students").textContent = `Students ${sides.student.toLocaleString()}`;
  $("#tug-profs").textContent = `Profs ${sides.prof.toLocaleString()}`;
}

function renderStats(stats) {
  const show = (id, value) => { $(id).textContent = value ?? "—"; };
  show("#st-buzzes", stats.buzzesWon);
  show("#st-accuracy", stats.accuracy == null ? null : `${stats.accuracy}%`);
  show("#st-avg", stats.avgReactionMs == null ? null : formatMs(stats.avgReactionMs));
  show("#st-fastest", stats.fastestReactionMs == null ? null : formatMs(stats.fastestReactionMs));
  show("#st-correct", stats.correct);
  show("#st-wrong", stats.wrong);
  show("#st-steals", stats.steals);
  show("#st-lockins", stats.lockInHits);
}

function renderHistory(history) {
  if (history.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-note";
    li.textContent = "No questions finished yet";
    $("#history").replaceChildren(li);
    return;
  }
  $("#history").replaceChildren(...[...history].reverse().map((h) => {
    const li = document.createElement("li");
    const left = document.createElement("span");
    left.textContent = `Q${h.questionNumber} · ${TYPE_LABELS[h.type]}`;
    const right = document.createElement("span");
    right.className = `r-${h.result}`;
    right.textContent = h.points ? `${h.result} +${h.points}` : h.result;
    li.append(left, right);
    return li;
  }));
}

// ---- Draw everything from the team view ----

socket.on("state", (view) => {
  $("#phase").textContent = PHASE_LABELS[view.phase];
  $("#phase").className = `phase ${view.phase}`;
  startCountdown($("#countdown"), view.buzzer === "floor" ? view.answerRemainingMs : null);
  renderQuestion($("#question"), view.question);

  const [label, sub] = buzzerLabel(view);
  const buzzButton = $("#buzz");
  buzzButton.className = view.buzzer;
  buzzButton.disabled = view.buzzer !== "ready";
  buzzButton.replaceChildren(label);
  if (sub) {
    const small = document.createElement("small");
    small.textContent = sub;
    buzzButton.append(small);
  }

  renderLockIn(view);
  renderScores(view);
  renderStats(view.stats);
  renderHistory(view.history);
});
