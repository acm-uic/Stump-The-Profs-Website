import { connect, PHASE_LABELS, answerText, renderQuestion, renderTeamList, startCountdown, upNextText } from "/common.js";

const socket = connect();
const $ = (selector) => document.querySelector(selector);

socket.on("connect", () => {
  $("#connection").textContent = "Connected";
  socket.emit("display:join"); // join the "display" room, which gets the public view
});
socket.on("disconnect", () => { $("#connection").textContent = "Reconnecting…"; });

// Redraw everything from the server's view every time.
socket.on("state", (view) => {
  $("#phase").textContent = PHASE_LABELS[view.phase];
  $("#phase").className = `phase ${view.phase}`;
  $("#progress").textContent = view.questionNumber > 0 ? `Question ${view.questionNumber} of ${view.questionTotal}` : "";

  renderQuestion($("#question"), view.question);
  if (view.result) {
    const answer = view.question.type === "free" ? ` Answer: ${answerText(view.question)}.` : "";
    $("#result").textContent = view.result.winner
      ? `${view.result.winner.name} got it! +${view.result.points}.${answer}`
      : `Nobody got it.${answer}`;
  } else {
    $("#result").textContent = "";
  }

  $("#floor").textContent = view.floorTeam ? `${view.floorTeam.name} is answering` : "";
  startCountdown($("#countdown"), view.answerRemainingMs);
  $("#up-next").textContent = upNextText(view);

  $("#buzzes").replaceChildren(...view.buzzes.map((b, i) => {
    const li = document.createElement("li");
    li.textContent = b.name;
    const gap = document.createElement("span");
    gap.className = "gap";
    gap.textContent = i === 0 ? `${(b.ms / 1000).toFixed(2)} s` : `+${b.ms - view.buzzes[0].ms} ms`;
    li.append(gap);
    return li;
  }));

  renderTeamList($("#students"), view.teams.filter((t) => t.side === "student"));
  renderTeamList($("#profs"), view.teams.filter((t) => t.side === "prof"));
});
