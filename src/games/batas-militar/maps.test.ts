import { describe, expect, it, vi } from "vitest";
import game, { DROPPABLE, GRAVITY, MAX_FUEL, PH, PW, RANDOM_MAP, WEAPONS, dropCap, randomSpot, tally, type MilAction, type MilState } from ".";
import { MAPS, fieldAt, moveBody, spawnY, type Body, type MapDefinition } from "./maps";

const inSolid = (m: MapDefinition, x: number, y: number, hw: number, hh: number) =>
  m.platforms.some(({ r }) => x + hw > r[0] && x - hw < r[0] + r[2] && y + hh > r[1] && y - hh < r[1] + r[3]) ||
  y + hh > fieldAt(m.terrain.ground, x) + 0.5 ||
  (!!m.terrain.ceil && y - hh < fieldAt(m.terrain.ceil, x) - 0.5);

/** Lets a body fall for a while; returns where it ends up. */
function settle(m: MapDefinition, x: number, y: number) {
  const b: Body = { x, y, vx: 0, vy: 0 };
  let on = null;
  for (let i = 0; i < 60; i++) { b.vy = Math.min(16, b.vy + GRAVITY); on = moveBody(m, b, PW, PH, 0); }
  return { b, on };
}

describe.each(MAPS.map((m) => [m.id, m] as const))("%s", (_, m) => {
  it("has enough spawns and pickups, and full metadata", () => {
    expect(m.spawns.length).toBeGreaterThanOrEqual(8);
    expect(m.pickups.length).toBeGreaterThanOrEqual(2);
    expect(m.name && m.description && m.theme.name && m.modes.length).toBeTruthy();
    expect(m.terrain.ground[0]![0]).toBeLessThanOrEqual(0);
    expect(m.terrain.ground.at(-1)![0]).toBeGreaterThanOrEqual(m.w);
  });

  it("puts every spawn and pickup on a surface, clear of solids", () => {
    for (const s of [...m.spawns, ...m.pickups]) {
      const y = spawnY(m, s) - PH - 1;
      expect(inSolid(m, s.x, y, PW, PH), `${s.x},${s.y}`).toBe(false);
      const { b, on } = settle(m, s.x, y);
      expect(on, `lands at ${s.x},${s.y}`).not.toBeNull();
      expect(Math.abs(b.y - y)).toBeLessThan(3);
    }
  });

  it("keeps every platform top within jetpack reach of something below it", () => {
    // Full tank: thrust 1.75 vs gravity 0.8 for ~90 ticks climbs far more than this, so 400px is a safe bound.
    const reach = 400;
    for (const { r } of m.platforms) {
      const cx = r[0] + r[2] / 2;
      const below = Math.min(
        fieldAt(m.terrain.ground, cx),
        ...m.platforms.filter((q) => q.r !== r && q.r[1] > r[1] && q.r[0] < r[0] + r[2] + 300 && q.r[0] + q.r[2] > r[0] - 300).map((q) => q.r[1]),
      );
      expect(below - r[1], `platform at ${r.join(",")}`).toBeLessThan(reach);
    }
    expect(MAX_FUEL).toBeGreaterThan(0);
  });
});

describe("tally", () => {
  it("picks the most voted map", () => {
    expect(tally({ a: 2, b: 2, c: 1 })).toBe(2);
  });
  it("resolves random and empty votes to a real map", () => {
    for (const v of [{}, { a: RANDOM_MAP }] as Record<string, number>[]) {
      const m = tally(v);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThan(MAPS.length);
    }
  });
});

describe("host", () => {
  it("runs vote → match with the roster and loads the voted map", () => {
    vi.useFakeTimers();
    const roster = [{ id: "h", name: "Host" }, { id: "p", name: "P" }];
    let last: MilState | null = null;
    const host = game.net.createHost({
      selfId: "h",
      players: () => roster as never,
      nameOf: (id: string) => id,
      publish: () => { last = host.state() as MilState; },
      emit: () => {},
      sendTo: () => {},
    });
    const act = (from: string, a: MilAction) => host.onAction(from, a);
    expect((host.state() as MilState).ph).toBe(0);
    act("p", { t: "START", m: 3 }); // not the host: ignored
    expect((host.state() as MilState).ph).toBe(0);
    act("h", { t: "VOTE", m: 4 });
    act("p", { t: "VOTE", m: 4 });
    vi.advanceTimersByTime(3000);
    let s = host.state() as MilState;
    expect(s.ph).toBe(1);
    expect(s.m).toBe(4);
    expect(Object.keys(s.p).sort()).toEqual(["h", "p"]);
    expect(s.pk.length).toBe(MAPS[4]!.pickups.length);
    vi.advanceTimersByTime(1000);
    expect(game.net.isState(last)).toBe(true);
    s = host.state() as MilState;
    for (const p of Object.values(s.p)) expect(inSolid(MAPS[4]!, p.x, p.y, PW - 0.5, PH - 0.5)).toBe(false);
    host.dispose();
    vi.useRealTimers();
  });
});

describe("weapon drops", () => {
  it("only picks standable spots, clear of solids, on every map", () => {
    for (const m of MAPS) {
      let found = 0;
      for (let i = 0; i < 400; i++) {
        const s = randomSpot(m);
        if (!s) continue;
        found++;
        const y = s.y - PH - 1;
        expect(inSolid(m, s.x, y, PW, PH), `${m.id} ${s.x},${s.y}`).toBe(false);
        expect(settle(m, s.x, y).on, `${m.id} lands at ${s.x}`).not.toBeNull();
      }
      expect(found).toBeGreaterThan(200);
    }
  });

  it("drops random weapons at match start and keeps them under the cap", () => {
    vi.useFakeTimers();
    const roster = [{ id: "h", name: "Host" }];
    const host = game.net.createHost({ selfId: "h", players: () => roster as never, nameOf: (id: string) => id, publish: () => {}, emit: () => {}, sendTo: () => {} });
    host.onAction("h", { t: "START", m: 0 });
    let s = host.state() as MilState;
    expect(s.wd.length).toBeGreaterThan(0);
    for (const d of s.wd) expect(DROPPABLE).toContain(d.w as never);
    vi.advanceTimersByTime(30_000);
    s = host.state() as MilState;
    expect(s.wd.length).toBeLessThanOrEqual(dropCap(1));
    expect(game.net.isState(s)).toBe(true);
    host.dispose();
    vi.useRealTimers();
  });
});

describe("weapons", () => {
  it("has the full arsenal with sane stats", () => {
    expect(WEAPONS.map((w) => w.name)).toEqual(["Pistol", "Shotgun", "SMG", "Sniper", "Laser", "Bazooka", "Rifle"]);
    for (const w of WEAPONS) expect(w.ammo > 0 && w.cooldown > 0 && w.dmg > 0).toBe(true);
  });
});
