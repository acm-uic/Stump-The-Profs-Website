import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, registerTeam, rejoinTeam, buzz } from "../game.js";

test("a new game has no teams and starts in the lobby", () => {
  const state = createGame();
  assert.deepEqual(state.teams, {});
  assert.equal(state.phase, "lobby");
});

test("registering gives back the team with its side and a 4-character code", () => {
  const state = createGame();
  const result = registerTeam(state, { name: "  Byte Me ", side: "student" });
  assert.equal(result.ok, true);
  assert.equal(result.team.name, "Byte Me");
  assert.equal(result.team.side, "student");
  assert.match(result.team.code, /^[A-Z2-9]{4}$/);
  assert.equal(state.teams[result.team.id], result.team);
});

test("duplicate names are refused, ignoring case and spaces, and nothing changes", () => {
  const state = createGame();
  registerTeam(state, { name: "Byte Me", side: "student" });
  const before = structuredClone(state);
  const result = registerTeam(state, { name: "  BYTE ME  ", side: "prof" });
  assert.equal(result.ok, false);
  assert.match(result.error, /name/i);
  assert.deepEqual(state, before);
});

test("an empty name or a bad side is refused", () => {
  const state = createGame();
  assert.equal(registerTeam(state, { name: "   ", side: "prof" }).ok, false);
  assert.equal(registerTeam(state, { name: "Dr. Null", side: "dean" }).ok, false);
  assert.equal(registerTeam(state, {}).ok, false);
  assert.equal(Object.keys(state.teams).length, 0);
  assert.equal(state.nextJoinOrder, 1);
});

test("registration can be closed", () => {
  const state = createGame();
  state.registrationOpen = false;
  assert.equal(registerTeam(state, { name: "Late", side: "prof" }).ok, false);
});

test("every team gets a different code", () => {
  const state = createGame();
  const codes = ["A", "B", "C", "D", "E", "F"].map(
    (name, i) => registerTeam(state, { name, side: i % 2 ? "prof" : "student" }).team.code,
  );
  assert.equal(new Set(codes).size, codes.length);
});

test("rejoin finds the team by code, in any case, and refuses a wrong code", () => {
  const state = createGame();
  const { team } = registerTeam(state, { name: "Byte Me", side: "student" });
  assert.equal(rejoinTeam(state, team.code.toLowerCase()).team, team);
  assert.equal(rejoinTeam(state, "ZZZZ").ok, false);
  assert.equal(rejoinTeam(state, undefined).ok, false);
});

test("a team buzzes once, with the time it was given; unknown teams are refused", () => {
  const state = createGame();
  const { team } = registerTeam(state, { name: "Byte Me", side: "student" });
  assert.equal(buzz(state, team.id, 1000).ok, true);
  assert.equal(buzz(state, team.id, 1200).ok, false);
  assert.equal(buzz(state, "t99", 1300).ok, false);
  assert.deepEqual(state.current.buzzes, [{ teamId: team.id, at: 1000 }]);
});
