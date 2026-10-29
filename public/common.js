// Small drawing helpers shared by the player, display and admin pages.
// They only turn views into text; they never decide game rules.

export const SIDE_NAMES = { student: "Students", prof: "Professors" };

export const PHASE_LABELS = {
  lobby: "Waiting to start",
  preview: "Get ready…",
  open: "BUZZ!",
  judging: "Reading answers",
  revealed: "Answer",
};

export const TYPE_LABELS = { free: "Free response", mc: "Multiple choice", tf: "True / False" };

export const letter = (i) => String.fromCharCode(65 + i); // 0 -> "A"

// 1 -> "1st", 2 -> "2nd", 11 -> "11th", 23 -> "23rd"
export function ordinal(n) {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  return n + ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
}

// 640 -> "640 ms", 1240 -> "1.2 s"
export function formatMs(ms) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

// Any answer to a question as text, e.g. "B. Merge sort", "False" or a typed answer.
export function choiceText(question, answer) {
  if (question?.type === "mc") return `${letter(answer)}. ${question.choices[answer]}`;
  if (question?.type === "tf") return answer ? "True" : "False";
  return String(answer);
}

// The correct answer as text, or "" when this page has not been sent it.
export function answerText(question) {
  if (!question || !("answer" in question)) return "";
  return choiceText(question, question.answer);
}

// "3 of 6 teams locked in"
export function lockedInText(view) {
  return `${view.answerCount} of ${view.teams.length} team${view.teams.length === 1 ? "" : "s"} locked in`;
}

// Connects with WebSocket first. Socket.IO's default starts on HTTP polling and
// upgrades later, and a buzz sent during that upgrade can arrive after a later buzz.
export function connect() {
  return io({ transports: ["websocket", "polling"] });
}

// Counts down from a duration the server measured. Using a duration rather than a
// clock time means devices with wrong clocks still agree. Optionally fills a bar.
const timers = new Map();
export function startCountdown(el, remainingMs, totalMs, barEl) {
  clearInterval(timers.get(el));
  if (remainingMs == null) {
    el.textContent = "";
    if (barEl) barEl.style.width = "0%";
    return;
  }
  const receivedAt = performance.now();
  const tick = () => {
    const left = Math.max(0, remainingMs - (performance.now() - receivedAt));
    el.textContent = `${Math.ceil(left / 1000)} s`;
    if (barEl) barEl.style.width = `${(left / totalMs) * 100}%`;
    if (left === 0) clearInterval(timers.get(el));
  };
  tick();
  timers.set(el, setInterval(tick, 100));
}

// "Still to read: Dr. Null (Professors), Byte Me (Students)", or "" when nobody is waiting.
export function upNextText(view) {
  if (!view.upNext.length) return "";
  return "Still to read: " + view.upNext.map((t) => `${t.name} (${SIDE_NAMES[t.side]})`).join(", ");
}

// Fills a list with the answers read out so far, each with its ruling.
export function renderReadOut(listEl, view) {
  listEl.replaceChildren(...view.readOut.map((entry) => {
    const li = document.createElement("li");
    li.className = entry.correct === true ? "right" : entry.correct === false ? "wrong" : "pending";
    const name = document.createElement("strong");
    name.textContent = entry.team.name;
    const answer = document.createElement("span");
    answer.textContent = choiceText(view.question, entry.answer);
    const ruling = document.createElement("span");
    ruling.className = "ruling";
    ruling.textContent = entry.correct === true ? "Correct" : entry.correct === false ? "Wrong" : "Host is deciding";
    li.append(name, answer, ruling);
    return li;
  }));
}

// Fills a list element with "name, score" rows for some teams.
export function renderTeamList(listEl, teams, emptyText = "No teams yet") {
  listEl.replaceChildren();
  if (teams.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-note";
    li.textContent = emptyText;
    listEl.append(li);
    return;
  }
  for (const team of [...teams].sort((a, b) => b.score - a.score)) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = team.name; // textContent, so a typed name can never inject HTML
    const score = document.createElement("strong");
    score.textContent = team.score;
    li.append(name, " ", score);
    listEl.append(li);
  }
}

// Draws the question: category, points, prompt and (for mc/tf) the choices, unless
// the page draws its own. When the answer is included (after the reveal, or on the
// admin page), it is highlighted.
export function renderQuestion(el, question, { choices = true } = {}) {
  el.replaceChildren();
  if (!question) return;
  const meta = document.createElement("p");
  meta.className = "meta";
  for (const text of [question.category, TYPE_LABELS[question.type], `${question.points} pts`].filter(Boolean)) {
    const chip = document.createElement("span");
    chip.textContent = text;
    meta.append(chip);
  }
  const prompt = document.createElement("p");
  prompt.className = "prompt";
  prompt.textContent = question.prompt;
  el.append(meta, prompt);

  const options = choices ? choiceOptions(question) : [];
  if (options.length) {
    const ul = document.createElement("ul");
    ul.className = "choices";
    for (const [text, value] of options) {
      const li = document.createElement("li");
      li.textContent = text;
      if ("answer" in question && question.answer === value) li.className = "correct";
      ul.append(li);
    }
    el.append(ul);
  }
}

// The choices a team or spectator can pick, as [text, value] pairs. Empty for free response.
export function choiceOptions(question) {
  if (question?.type === "mc") return question.choices.map((c, i) => [`${letter(i)}. ${c}`, i]);
  if (question?.type === "tf") return [["True", true], ["False", false]];
  return [];
}
