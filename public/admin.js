import { connect, PHASE_LABELS, SIDE_NAMES, answerText, renderQuestion, startCountdown, upNextText } from "/common.js";

const socket = connect();
const $ = (selector) => document.querySelector(selector);
const message = $("#message");

socket.on("connect", () => {
  $("#connection").textContent = "Connected";
  socket.emit("admin:auth", {}, (reply) => {
    if (!reply.ok) message.textContent = reply.error;
  });
});
socket.on("disconnect", () => { $("#connection").textContent = "Reconnecting…"; });

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
$("#correct").addEventListener("click", () => send({ type: "judge", correct: true }));
$("#wrong").addEventListener("click", () => send({ type: "judge", correct: false }));
$("#reveal").addEventListener("click", () => send({ type: "reveal" }));

socket.on("state", (view) => {
  const { phase } = view;
  $("#phase").textContent = PHASE_LABELS[phase];
  $("#phase").className = `phase ${phase}`;
  $("#progress").textContent = view.questionNumber > 0 ? `Question ${view.questionNumber} of ${view.questionTotal}` : `${view.questionTotal} questions loaded`;
  startCountdown($("#countdown"), view.answerRemainingMs);

  renderQuestion($("#question"), view.question);
  $("#answer-box").hidden = !view.question;
  $("#answer").textContent = answerText(view.question);

  $("#floor").textContent = view.floorTeam
    ? `${view.floorTeam.name} (${SIDE_NAMES[view.floorTeam.side]}) has the floor`
    : "";
  $("#up-next").textContent = view.phase === "answering"
    ? upNextText(view) || "Nobody left after this team: Wrong will end the question"
    : "";
  $("#result").textContent = view.result
    ? view.result.winner ? `${view.result.winner.name} got it: +${view.result.points}` : "Nobody got it"
    : "";

  const isLast = view.questionNumber >= view.questionTotal;
  $("#show").disabled = !((phase === "lobby" || phase === "revealed") && !isLast);
  $("#open").disabled = phase !== "preview";
  $("#correct").disabled = phase !== "answering";
  $("#wrong").disabled = phase !== "answering";
  $("#reveal").disabled = !(phase === "open" || phase === "answering");

  $("#buzzes").replaceChildren(...view.buzzes.map((b) => {
    const li = document.createElement("li");
    li.textContent = `${b.name} (${(b.ms / 1000).toFixed(2)} s)`;
    return li;
  }));

  $("#teams").replaceChildren(...view.teams.map((t) => {
    const li = document.createElement("li");
    const left = document.createElement("span");
    left.textContent = `${t.name} · ${SIDE_NAMES[t.side]} `;
    const code = document.createElement("span");
    code.className = "code";
    code.textContent = t.code;
    left.append(code);
    const score = document.createElement("strong");
    score.textContent = t.score;
    li.append(left, score);
    return li;
  }));

  $("#question-list").replaceChildren(...view.questionList.map((q) => {
    const li = document.createElement("li");
    li.textContent = `[${q.type}] ${q.prompt}`;
    if (q.number === view.questionNumber) li.className = "current";
    else if (q.played) li.className = "played";
    return li;
  }));
});
