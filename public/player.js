import {
  connect, PHASE_LABELS, SIDE_NAMES, TYPE_LABELS, renderQuestion, startCountdown, formatMs, ordinal,
  choiceText, choiceOptions,
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
  $("#team-label").textContent = name;
  $("#team-side").textContent = SIDE_NAMES[side];
  $("#team-side").dataset.side = side;
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

// The host removed this team, or reset the whole game: forget the code and start over.
function forgetTeam(reason) {
  localStorage.removeItem(CODE_KEY);
  showRegister();
  $("#error").textContent = reason;
}
socket.on("team:kicked", () => forgetTeam("Your team was removed by the host."));
socket.on("game:reset", () => forgetTeam("The host started a new game. Join again."));

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

// ---- Answering: pick or type, then BUZZ seals it ----

let lastView = null;
// The answer picked on this laptop but not locked in yet. Only BUZZ sends it.
let selection = { questionNumber: null, value: null };
let deadline = null; // performance.now() when the answer clock runs out here
let redrawTimer = null;

const hasSelection = () => selection.value !== null && selection.value !== "";
const timeLeft = () => (deadline === null ? 0 : deadline - performance.now());

function select(value) {
  if (!lastView || !["preview", "open"].includes(lastView.phase) || lastView.myAnswer) return;
  selection = { questionNumber: lastView.questionNumber, value };
  $("#buzz-error").textContent = "";
  draw(lastView);
}

function sendBuzz() {
  if ($("#buzz").disabled) return;
  $("#buzz").disabled = true; // one press, even before the server replies
  socket.emit("team:buzz", { answer: selection.value }, (reply) => {
    if (reply.ok) return;
    $("#buzz-error").textContent = reply.error;
    if (lastView) draw(lastView);
  });
}

$("#buzz").addEventListener("click", sendBuzz);
$("#pad-text").addEventListener("input", () => select($("#pad-text").value.trim()));
$("#pad-text").addEventListener("keydown", (event) => {
  if (event.key === "Enter") sendBuzz();
});

// Space buzzes. A to F pick a choice, T and F pick true or false.
document.addEventListener("keydown", (event) => {
  if (event.target.tagName === "INPUT" || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.code === "Space") {
    event.preventDefault(); // stop the page scrolling
    if (!event.repeat) sendBuzz(); // holding space sends one buzz
    return;
  }
  const q = lastView?.question;
  const key = event.key.toLowerCase();
  if (q?.type === "tf" && (key === "t" || key === "f")) select(key === "t");
  else if (q?.type === "mc") {
    const index = key.charCodeAt(0) - 97;
    if (key.length === 1 && index >= 0 && index < q.choices.length) select(index);
  }
});

// The choice buttons are built once per question, so none is redrawn under a finger.
let padBuiltFor = null;
function buildPad(view) {
  if (padBuiltFor === view.questionNumber) return;
  padBuiltFor = view.questionNumber;
  $("#pad-text").value = "";
  $("#pad-choices").replaceChildren(...choiceOptions(view.question).map(([text, value]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.dataset.value = JSON.stringify(value);
    button.addEventListener("click", () => select(value));
    return button;
  }));
}

function drawPad(view) {
  const q = view.question;
  $("#answer-pad").hidden = !q;
  if (!q) return;
  buildPad(view);
  const canPick = ["preview", "open"].includes(view.phase) && !view.myAnswer;
  const mine = view.myAnswer ? view.myAnswer.answer : selection.value;
  for (const button of $("#pad-choices").children) {
    const value = JSON.parse(button.dataset.value);
    button.disabled = !canPick;
    button.classList.toggle("chosen", mine === value);
    button.classList.toggle("sealed", Boolean(view.myAnswer) && mine === value);
    button.classList.toggle("correct", "answer" in q && q.answer === value);
  }
  const text = $("#pad-text");
  text.hidden = q.type !== "free";
  text.disabled = !canPick;
  if (view.myAnswer && q.type === "free") text.value = view.myAnswer.answer;
}

// The label for each buzzer state. The server decides the state; the page only draws it.
function buzzerLabel(view) {
  const mine = view.myAnswer ? choiceText(view.question, view.myAnswer.answer) : "";
  switch (view.buzzer) {
    case "locked": return ["WAIT", view.phase === "preview" ? "Pick your answer now. Buzzers open soon." : "Waiting for the host"];
    case "ready":
      if (timeLeft() <= 0) return ["TIME", "The answer clock ran out"];
      return hasSelection()
        ? ["BUZZ", `Locks in ${choiceText(view.question, selection.value)}`]
        : ["PICK", view.question.type === "free" ? "Type your answer above, then buzz" : "Choose an answer above, then buzz"];
    case "buzzed": return ["LOCKED IN", view.phase === "open"
      ? `${mine}. You were ${ordinal(view.place)} to buzz. Answers are read when time is up.`
      : `${mine}. ${view.place === 1 ? "Yours is read next." : `Yours is read ${ordinal(view.place)}.`}`];
    case "floor": return ["YOUR TURN", `Read it out: ${mine}`];
    case "tried": return ["WRONG", `${mine} was not it`];
    case "missed": return ["NO ANSWER", "Time ran out before you locked in"];
    case "over": return ["DONE", resultLine(view)];
    default: return ["", ""];
  }
}

function resultLine(view) {
  const { result, me, myAnswer } = view;
  if (!result) return "";
  if (result.winner?.id === me.id) return `Correct! +${result.points}`;
  if (myAnswer?.awarded) return `Also right! +${view.lockInPoints}`;
  if (myAnswer && myAnswer.correct == null) return "The host will mark your answer";
  return result.winner ? `${result.winner.name} got it` : "Nobody got it";
}

function drawBuzzer(view) {
  const [label, sub] = buzzerLabel(view);
  const buzzButton = $("#buzz");
  buzzButton.className = view.buzzer;
  buzzButton.disabled = !(view.buzzer === "ready" && view.canAnswer && hasSelection() && timeLeft() > 0);
  buzzButton.replaceChildren(label);
  if (sub) {
    const small = document.createElement("small");
    small.textContent = sub;
    buzzButton.append(small);
  }
}

function draw(view) {
  if (selection.questionNumber !== view.questionNumber) selection = { questionNumber: view.questionNumber, value: null };
  drawPad(view);
  drawBuzzer(view);
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
  const show = (id, value) => { $(id).textContent = value ?? "n/a"; };
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
    const number = document.createElement("span");
    number.className = "q";
    number.textContent = `Q${h.questionNumber}`;
    left.append(number, TYPE_LABELS[h.type]);
    const right = document.createElement("span");
    right.className = `r-${h.result.replace(/ /g, "-")}`;
    right.textContent = h.points ? `${h.result} +${h.points}` : h.result;
    li.append(left, right);
    return li;
  }));
}

// ---- Draw everything from the team view ----

socket.on("state", (view) => {
  lastView = view;
  $("#phase").textContent = PHASE_LABELS[view.phase];
  $("#phase").className = `phase ${view.phase}`;
  startCountdown($("#countdown"), view.answerRemainingMs);
  renderQuestion($("#question"), view.question, { choices: false });

  // When the clock runs out here, redraw so BUZZ greys out without waiting for the server.
  deadline = view.answerRemainingMs == null ? null : performance.now() + view.answerRemainingMs;
  clearTimeout(redrawTimer);
  if (deadline !== null) redrawTimer = setTimeout(() => lastView && draw(lastView), view.answerRemainingMs + 20);
  if (view.phase !== "open") $("#buzz-error").textContent = "";

  draw(view);
  renderScores(view);
  renderStats(view.stats);
  renderHistory(view.history);
});
