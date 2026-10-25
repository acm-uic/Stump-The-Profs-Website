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

function lockInRow(view, entry) {
  const li = document.createElement("li");
  const left = document.createElement("span");
  left.textContent = `${entry.name}: ${lockInAnswerText(view.question, entry.answer)} `;
  const mark = document.createElement("span");
  if (entry.correct === true) { mark.textContent = entry.awarded ? `✓ +${view.lockInPoints}` : "✓ (won the question)"; mark.className = "mark-right"; }
  else if (entry.correct === false) { mark.textContent = "✗"; mark.className = "mark-wrong"; }
  else { mark.textContent = view.phase === "revealed" ? "needs marking →" : "free response: mark after reveal"; mark.className = "mark-pending"; }
  left.append(mark);
  li.append(left);

  // Free response lock-ins are marked by the host after the reveal. Clicking again is safe.
  if (view.question?.type === "free" && view.phase === "revealed") {
    const buttons = document.createElement("span");
    for (const [label, correct] of [["Right", true], ["Wrong", false]]) {
      const button = document.createElement("button");
      button.textContent = label;
      button.addEventListener("click", () => send({ type: "markLockIn", teamId: entry.teamId, correct }));
      buttons.append(button);
    }
    li.append(buttons);
  }
  return li;
}

function lockInAnswerText(question, answer) {
  if (question?.type === "mc") return `${String.fromCharCode(65 + answer)}. ${question.choices[answer]}`;
  if (question?.type === "tf") return answer ? "True" : "False";
  return `"${answer}"`;
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

  $("#lockin-value").textContent = view.question ? `(worth ${view.lockInPoints} each)` : "";
  if (view.lockIns.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-note";
    li.textContent = "No lock-ins yet";
    $("#lockins").replaceChildren(li);
  } else {
    $("#lockins").replaceChildren(...view.lockIns.map((entry) => lockInRow(view, entry)));
  }

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
