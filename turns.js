// Works out who gets the floor next after a wrong answer.
//
// Rules: the floor goes to the side opposite the team that just tried. Within a side,
// teams that buzzed go first, in buzz order, then the rest in the order they registered.
// If one side has nobody left, the other side keeps going.
//
// The order is worked out fresh from the facts (teams, buzzes, attempts) every time,
// never stored, so a late buzz is always taken into account. It changes nothing.

const otherSide = (side) => (side === "student" ? "prof" : "student");

export function stealOrder(teams, buzzes, attempted) {
  const buzzPosition = new Map(buzzes.map((b, i) => [b.teamId, i]));

  // Buzzers first (earlier buzz first), then non-buzzers (earlier join first).
  const byPriority = (a, b) => {
    const aBuzz = buzzPosition.get(a.id);
    const bBuzz = buzzPosition.get(b.id);
    if (aBuzz !== undefined && bBuzz !== undefined) return aBuzz - bBuzz;
    if (aBuzz !== undefined) return -1;
    if (bBuzz !== undefined) return 1;
    return a.joinOrder - b.joinOrder;
  };

  const remaining = teams.filter((t) => !attempted.includes(t.id));
  const piles = {
    student: remaining.filter((t) => t.side === "student").sort(byPriority),
    prof: remaining.filter((t) => t.side === "prof").sort(byPriority),
  };

  const lastTeam = teams.find((t) => t.id === attempted.at(-1));
  let side = lastTeam ? otherSide(lastTeam.side) : "student";

  // Deal alternately from the two piles, like dealing cards.
  const order = [];
  while (piles.student.length > 0 || piles.prof.length > 0) {
    if (piles[side].length > 0) order.push(piles[side].shift().id);
    side = otherSide(side);
  }
  return order;
}
