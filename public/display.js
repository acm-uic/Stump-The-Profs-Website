const socket = io({ transports: ["websocket", "polling"] });

const connection = document.querySelector("#connection");
const list = document.querySelector("#buzzes");
const empty = document.querySelector("#empty");

socket.on("connect", () => { connection.textContent = "Connected"; });
socket.on("disconnect", () => { connection.textContent = "Reconnecting…"; });

// Redraw the whole list from the server's state every time.
socket.on("state", ({ buzzes }) => {
  list.replaceChildren();
  empty.hidden = buzzes.length > 0;

  for (const buzz of buzzes) {
    const li = document.createElement("li");
    li.textContent = buzz.name; // textContent, so a typed name can never inject HTML

    if (buzz !== buzzes[0]) {
      const gap = document.createElement("span");
      gap.className = "gap";
      gap.textContent = `+${buzz.at - buzzes[0].at} ms`;
      li.append(gap);
    }
    list.append(li);
  }
});

document.querySelector("#reset").addEventListener("click", () => {
  socket.emit("reset");
});
