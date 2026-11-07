import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import game, {
  BOARD_WIDTH,
  COUNTDOWN_TICKS,
  FINISH_ROW,
  RESPAWN_TICKS,
  ROUND_BREAK_TICKS,
  TICK_MS,
  TOTAL_ROUNDS,
  VIEW_ROWS,
  type CrossyState,
} from ".";

const makeHost = () => game.net.createHost({
  selfId: "host",
  players: () => [{ id: "racer", name: "Racer", ready: true }],
  nameOf: (id) => id,
  publish: vi.fn(),
  emit: vi.fn(),
  sendTo: vi.fn(),
});

describe("Crossy Race host rules", () => {
  let host: ReturnType<typeof makeHost>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    host = makeHost();
  });

  afterEach(() => {
    host.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates a safe start row and valid traffic rows", () => {
    const state = host.state() as CrossyState;
    expect(state.phase).toBe("countdown");
    expect(state.countdownTicks).toBe(COUNTDOWN_TICKS);
    expect(state.players.racer).toMatchObject({
      x: Math.floor(BOARD_WIDTH / 2),
      y: 0,
      alive: true,
    });
    expect(state.rows[0]).toMatchObject({ y: 0, kind: "grass", items: [] });
    expect(state.rows.every((row) =>
      Number.isInteger(row.y) &&
      row.items.every((item) => item >= 0 && item < BOARD_WIDTH) &&
      Number.isFinite(row.speed),
    )).toBe(true);
    expect(game.net.isState(state)).toBe(true);
    expect(game.net.isState({ ...state, rows: [{ ...state.rows[0], y: -1 }] })).toBe(false);
  });

  it("accepts movement, wraps horizontally, and prevents moving behind the start", () => {
    vi.advanceTimersByTime(COUNTDOWN_TICKS * TICK_MS);
    host.onAction("racer", { t: "MOVE", dir: "left" });
    let racer = (host.state() as CrossyState).players.racer!;
    expect(racer.x).toBe(3);

    vi.advanceTimersByTime(TICK_MS);
    host.onAction("racer", { t: "MOVE", dir: "left" });
    vi.advanceTimersByTime(TICK_MS);
    host.onAction("racer", { t: "MOVE", dir: "left" });
    vi.advanceTimersByTime(TICK_MS);
    host.onAction("racer", { t: "MOVE", dir: "left" });
    vi.advanceTimersByTime(TICK_MS);
    host.onAction("racer", { t: "MOVE", dir: "left" });
    racer = (host.state() as CrossyState).players.racer!;
    expect(racer.x).toBe(BOARD_WIDTH - 1);

    vi.advanceTimersByTime(TICK_MS);
    host.onAction("racer", { t: "MOVE", dir: "down" });
    expect((host.state() as CrossyState).players.racer!.y).toBe(0);
  });

  it("does not allow movement until the countdown has finished", () => {
    host.onAction("racer", { t: "MOVE", dir: "up" });
    expect((host.state() as CrossyState).players.racer!.y).toBe(0);
    expect((host.state() as CrossyState).phase).toBe("countdown");

    vi.advanceTimersByTime(COUNTDOWN_TICKS * TICK_MS);
    host.onAction("racer", { t: "MOVE", dir: "up" });
    expect((host.state() as CrossyState).players.racer!.y).toBe(1);
  });

  it("respawns a racer after a collision using a fixed delay", () => {
    vi.advanceTimersByTime(COUNTDOWN_TICKS * TICK_MS);
    host.onAction("racer", { t: "MOVE", dir: "up" });
    const state = host.state() as CrossyState;
    const racer = state.players.racer!;
    const row = state.rows.find((candidate) => candidate.y === 1)!;
    row.kind = "road";
    row.speed = 0;
    row.items = [racer.x];

    vi.advanceTimersByTime(TICK_MS);
    expect(racer.alive).toBe(false);
    vi.advanceTimersByTime((RESPAWN_TICKS - 1) * TICK_MS);
    expect(racer.alive).toBe(false);
    vi.advanceTimersByTime(TICK_MS);
    expect(racer).toMatchObject({ alive: true, x: Math.floor(BOARD_WIDTH / 2), y: 0 });
  });

  it("uses a fresh randomized map each round and ends after four winners", () => {
    host.dispose();
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.13)
      .mockReturnValueOnce(0.87)
      .mockReturnValue(0.42);
    host = makeHost();
    let firstMap = "";

    vi.advanceTimersByTime(COUNTDOWN_TICKS * TICK_MS);
    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      if (round > 1) {
        vi.advanceTimersByTime(
          (ROUND_BREAK_TICKS + COUNTDOWN_TICKS) * TICK_MS,
        );
      }
      const state = host.state() as CrossyState;
      if (!state.players.racer) host.onAction("racer", { t: "MOVE", dir: "up" });
      const racer = state.players.racer!;
      const map = JSON.stringify(state.rows.slice(1, VIEW_ROWS).map((row) => [
        row.kind,
        row.direction,
        row.speed,
        row.items.length,
      ]));
      if (round === 1) firstMap = map;
      if (round === 2) expect(map).not.toBe(firstMap);
      racer.x = Math.floor(BOARD_WIDTH / 2);
      racer.y = FINISH_ROW - 1;
      racer.alive = true;
      state.rows.push({
        y: FINISH_ROW - 1,
        kind: "grass",
        direction: 1,
        speed: 0,
        items: [],
      });

      vi.advanceTimersByTime(TICK_MS);
      host.onAction("racer", { t: "MOVE", dir: "up" });
      expect(state.round).toBe(round);
    }

    const finalState = host.state() as CrossyState;
    expect(finalState.phase).toBe("finished");
    expect(finalState.roundWins.racer).toBe(TOTAL_ROUNDS);
    expect(finalState.winners).toEqual(["racer"]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
