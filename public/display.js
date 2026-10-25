const socket = io({ transports: ["websocket", "polling"] });

const connection = document.querySelector("#connection");
const buzzList = document.querySelector("#buzzes");
const noBuzzes = document.querySelector("#no-buzzes");

socket.on("connect", () => { connection.textContent = "Connected"; });
socket.on("disconnect", () => { connection.textContent = "Reconnecting…"; });

function renderTeams(listEl, teams) {
  listEl.replaceChildren();
  if (teams.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-note";
    li.textContent = "No teams yet";
    listEl.append(li);
  }
  for (const team of teams) {
    const li = document.createElement("li");
    li.textContent = team.name; // textContent, so a typed name can never inject HTML
    listEl.append(li);
  }
}

// Redraw everything from the server's state every time.
socket.on("state", ({ teams, buzzes }) => {
  renderTeams(document.querySelector("#students"), teams.filter((t) => t.side === "student"));
  renderTeams(document.querySelector("#profs"), teams.filter((t) => t.side === "prof"));

  buzzList.replaceChildren();
  noBuzzes.hidden = buzzes.length > 0;
  for (const buzz of buzzes) {
    const li = document.createElement("li");
    li.textContent = buzz.name;
    if (buzz !== buzzes[0]) {
      const gap = document.createElement("span");
      gap.className = "gap";
      gap.textContent = `+${buzz.at - buzzes[0].at} ms`;
      li.append(gap);
    }
    buzzList.append(li);
  }
});

document.querySelector("#reset").addEventListener("click", () => {
  socket.emit("reset");
});
