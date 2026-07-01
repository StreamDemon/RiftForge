import { describe, expect, test } from "vite-plus/test";
import {
  attacksPerMelee,
  combatProfile,
  comaDeathFloor,
  hitPointsRange,
  hthBonuses,
  physicalSdcRange,
  psionicsSaveTarget,
  rollHitPoints,
  savingThrowTarget,
} from "../src/index.ts";

describe("Hit Points & S.D.C. (RUE p.287)", () => {
  test("H.P. = P.E. + 1D6 at level 1, +1D6 per level after", () => {
    expect(hitPointsRange(12, 1)).toEqual({ min: 13, max: 18, average: 15.5 });
    // level 3: +2 more 1D6 rolls
    expect(hitPointsRange(12, 3)).toEqual({ min: 15, max: 30, average: 22.5 });
  });

  test("rolled H.P. hits the bounds with edge RNG", () => {
    expect(rollHitPoints(12, 1, () => 0)).toBe(13);
    expect(rollHitPoints(12, 1, () => 0.999)).toBe(18);
    expect(rollHitPoints(12, 3, () => 0.999)).toBe(30);
  });

  test("physical S.D.C. base is 2D6+12", () => {
    expect(physicalSdcRange()).toEqual({ min: 14, max: 24, average: 19 });
  });

  test("coma/death floor is -(P.E.)", () => {
    expect(comaDeathFloor(12)).toBe(-12);
  });
});

describe("Hand to Hand progression (RUE p.347)", () => {
  test("Basic attacks per melee: 4, +1 at 4/9/15", () => {
    expect(attacksPerMelee("basic", 1)).toBe(4);
    expect(attacksPerMelee("basic", 3)).toBe(4);
    expect(attacksPerMelee("basic", 4)).toBe(5);
    expect(attacksPerMelee("basic", 9)).toBe(6);
    expect(attacksPerMelee("basic", 15)).toBe(7);
  });

  test("No-H2H attacks per melee: 1, +1 at 3/9", () => {
    expect(attacksPerMelee("none", 1)).toBe(1);
    expect(attacksPerMelee("none", 3)).toBe(2);
    expect(attacksPerMelee("none", 9)).toBe(3);
  });

  test("Basic accumulative bonuses at level 12", () => {
    expect(hthBonuses("basic", 12)).toEqual({
      pullPunch: 4,
      rollWithImpact: 4,
      parry: 3,
      dodge: 3,
      strike: 2,
      disarm: 1,
      damage: 2,
    });
  });
});

describe("Saving throws (RUE p.346)", () => {
  test("fixed targets", () => {
    expect(savingThrowTarget("curses")).toEqual({ target: 15, targetRange: undefined });
    expect(savingThrowTarget("lethalPoison")?.target).toBe(14);
    expect(savingThrowTarget("insanity")?.target).toBe(12);
  });

  test("magic is a range", () => {
    expect(savingThrowTarget("magic")?.targetRange).toEqual({ min: 12, max: 16 });
  });

  test("psionics target depends on the saver's psychic class", () => {
    expect(psionicsSaveTarget("masterPsychic")).toBe(10);
    expect(psionicsSaveTarget("majorOrMinorPsychic")).toBe(12);
    expect(psionicsSaveTarget("ordinary")).toBe(15);
  });
});

describe("combatProfile integrates attributes + Hand to Hand", () => {
  test("P.P. 20 / P.S. 20, Basic H2H at level 5", () => {
    const p = combatProfile({
      attributes: { PP: 20, PS: 20 },
      hthType: "basic",
      level: 5,
    });
    expect(p.attacksPerMelee).toBe(5); // 4 base + 1 at level 4
    expect(p.strike).toBe(4); // P.P. +3, Basic +1 at level 5
    expect(p.parry).toBe(5); // P.P. +3, Basic +2 at level 2
    expect(p.dodge).toBe(5);
    expect(p.damageBonus).toBe(5); // P.S. +5, no H2H damage bonus until level 7
  });

  test("save bonuses flow through from attributes", () => {
    const p = combatProfile({
      attributes: { ME: 30, PE: 30 },
      hthType: "basic",
      level: 1,
    });
    expect(p.saveBonuses.psionic).toBe(8);
    expect(p.saveBonuses.insanity).toBe(13);
    expect(p.saveBonuses.comaDeathPct).toBe(30);
    expect(p.saveBonuses.magic).toBe(8);
  });
});
