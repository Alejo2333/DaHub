import { describe, expect, it, vi } from "vitest";
import { FINAL_FLOOR, Ledger, paydayFor, quotaFor } from "./engine";

vi.mock("./odds", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./odds")>()),
  FLOOR_PAYDAY: 0.5,
}));

const ledger = () => new Ledger(() => 0.5);
/** Clears the current floor with `spare` chips left after the debt and no early bonus. */
const clear = (l: Ledger, spare = 0) => {
  l.g.balance = l.g.quota + spare;
  l.g.timeLeft = 1;
  l.tick();
};

describe("floor payday", () => {
  it("adds a share of the next floor's debt after a clear", () => {
    const l = ledger();
    clear(l, 100);
    expect(paydayFor(2)).toBe(1050);
    expect(l.g.payday).toBe(1050);
    expect(l.g.balance).toBe(100 + 1050);
    expect(l.g.stats.peak).toBeGreaterThanOrEqual(1150);
  });
  it("is paid whether the debt is paid early or on the clock", () => {
    const l = ledger();
    l.g.balance = l.g.quota;
    l.g.timeLeft = 10;
    l.payDebt();
    expect(l.g.balance).toBe(20 + 1050);
  });
  it("ignores debt relief and markers", () => {
    const l = ledger();
    l.takeLoan();
    clear(l);
    expect(l.g.payday).toBe(paydayFor(2));
    const paid = l.g.balance;
    l.g.balance = paid + 1000;
    l.buy("debt");
    l.nextFloor();
    clear(l);
    expect(l.g.payday).toBe(paydayFor(3));
  });
  it("is only reported on the screen between floors", () => {
    const l = ledger();
    clear(l);
    l.nextFloor();
    expect(l.g.payday).toBe(0);
  });
  it("can't be collected by walking away, only by taking the buyout", () => {
    const atChoice = () => {
      const l = ledger();
      l.g.floor = FINAL_FLOOR;
      l.g.quota = quotaFor(FINAL_FLOOR, 0);
      clear(l, 700);
      return l;
    };
    const walk = atChoice();
    expect(walk.g.phase).toBe("final");
    expect(walk.g.payday).toBe(0);
    walk.walkAway();
    expect(walk.g.balance).toBe(700);
    const stay = atChoice();
    stay.buyout();
    expect(stay.g.payday).toBe(paydayFor(FINAL_FLOOR + 1));
    expect(stay.g.balance).toBe(700 + paydayFor(FINAL_FLOOR + 1));
  });
  it("is not paid once the casino is bought", () => {
    const l = ledger();
    l.g.floor = FINAL_FLOOR + 1;
    l.g.quota = 100;
    clear(l, 50);
    expect(l.g.phase).toBe("won");
    expect(l.g.balance).toBe(50);
    expect(l.g.payday).toBe(0);
  });
});
