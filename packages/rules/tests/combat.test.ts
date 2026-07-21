import { describe, expect, test } from "vite-plus/test";
import {
  applyDamage,
  attacksPerMelee,
  combatProfile,
  comaDeathFloor,
  hitPointsRange,
  hthBonuses,
  physicalSdcRange,
  psionicsSaveTarget,
  rollHitPoints,
  saveTargetSchema,
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

describe("applyDamage — S.D.C. before H.P. (RUE p.347), coma floor (p.287)", () => {
  const floor = comaDeathFloor(14);

  test("S.D.C. absorbs damage while it lasts", () => {
    expect(applyDamage({ sdc: 20, hitPoints: 18 }, 7, floor)).toEqual({
      sdc: 13,
      hitPoints: 18,
    });
  });

  test("overflow past S.D.C. comes off Hit Points", () => {
    expect(applyDamage({ sdc: 5, hitPoints: 18 }, 12, floor)).toEqual({
      sdc: 0,
      hitPoints: 11,
    });
  });

  test("H.P. can go negative (coma band) but stops at the floor", () => {
    expect(applyDamage({ sdc: 0, hitPoints: 4 }, 10, floor)).toEqual({
      sdc: 0,
      hitPoints: -6,
    });
    expect(applyDamage({ sdc: 0, hitPoints: 4 }, 999, floor)).toEqual({
      sdc: 0,
      hitPoints: -14,
    });
  });

  test("zero damage is a no-op; negative or fractional damage throws", () => {
    expect(applyDamage({ sdc: 5, hitPoints: 18 }, 0, floor)).toEqual({ sdc: 5, hitPoints: 18 });
    expect(() => applyDamage({ sdc: 5, hitPoints: 18 }, -3, floor)).toThrow(/non-negative/);
    expect(() => applyDamage({ sdc: 5, hitPoints: 18 }, 2.5, floor)).toThrow(/non-negative/);
  });
});

describe("Hand to Hand progression (RUE pp.347-349)", () => {
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

  test("Expert attacks per melee: 4, +1 at 4/9/14", () => {
    expect(attacksPerMelee("expert", 1)).toBe(4);
    expect(attacksPerMelee("expert", 4)).toBe(5);
    expect(attacksPerMelee("expert", 9)).toBe(6);
    expect(attacksPerMelee("expert", 15)).toBe(7);
  });

  test("Expert accumulative bonuses at level 15", () => {
    expect(hthBonuses("expert", 15)).toEqual({
      pullPunch: 3,
      rollWithImpact: 2,
      parry: 5,
      dodge: 5,
      strike: 2,
      disarm: 3,
      damage: 3,
    });
  });

  test("Martial Arts attacks per melee: 4, +1 at 4/9/14", () => {
    expect(attacksPerMelee("martial-arts", 1)).toBe(4);
    expect(attacksPerMelee("martial-arts", 4)).toBe(5);
    expect(attacksPerMelee("martial-arts", 9)).toBe(6);
    expect(attacksPerMelee("martial-arts", 15)).toBe(7);
  });

  test("Martial Arts accumulative bonuses at level 15", () => {
    expect(hthBonuses("martial-arts", 15)).toEqual({
      pullPunch: 3,
      rollWithImpact: 3,
      parry: 5,
      dodge: 5,
      strike: 2,
      initiative: 2,
      entangle: 2,
      disarm: 4,
      damage: 4,
    });
  });

  test("Assassin attacks per melee: 3, +2 at 2, +1 at 5/8/13", () => {
    expect(attacksPerMelee("assassin", 1)).toBe(3);
    expect(attacksPerMelee("assassin", 2)).toBe(5);
    expect(attacksPerMelee("assassin", 5)).toBe(6);
    expect(attacksPerMelee("assassin", 8)).toBe(7);
    expect(attacksPerMelee("assassin", 15)).toBe(8);
  });

  test("Assassin accumulative bonuses at level 15 (incl. thrown/gun strikes)", () => {
    expect(hthBonuses("assassin", 15)).toEqual({
      strike: 6,
      initiative: 4,
      pullPunch: 5,
      rollWithImpact: 2,
      damage: 6,
      strikeThrown: 2,
      strikeGuns: 3,
      parry: 3,
      dodge: 3,
      entangle: 2,
    });
  });

  test("Commando attacks per melee: 4, +1 at 4/8/13", () => {
    expect(attacksPerMelee("commando", 1)).toBe(4);
    expect(attacksPerMelee("commando", 4)).toBe(5);
    expect(attacksPerMelee("commando", 8)).toBe(6);
    expect(attacksPerMelee("commando", 15)).toBe(7);
  });

  test("Commando accumulative bonuses at level 15 (incl. auto-dodge & Horror Factor)", () => {
    expect(hthBonuses("commando", 15)).toEqual({
      saveVsHorrorFactor: 5,
      initiative: 6,
      strike: 3,
      parry: 4,
      dodge: 4,
      rollWithImpact: 4,
      pullPunch: 8,
      disarm: 3,
      autoDodge: 5,
      bodyFlipThrow: 5,
      damage: 4,
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

  test("saveTargetSchema rejects malformed rows", () => {
    // exactly one of target / targetRange
    expect(saveTargetSchema.safeParse({ kind: "x", label: "X" }).success).toBe(false);
    expect(
      saveTargetSchema.safeParse({
        kind: "x",
        label: "X",
        target: 12,
        targetRange: { min: 12, max: 16 },
      }).success,
    ).toBe(false);
    // inverted range
    expect(
      saveTargetSchema.safeParse({
        kind: "magic",
        label: "Magic",
        targetRange: { min: 16, max: 12 },
      }).success,
    ).toBe(false);
    // valid range
    expect(
      saveTargetSchema.safeParse({
        kind: "magic",
        label: "Magic",
        targetRange: { min: 12, max: 16 },
      }).success,
    ).toBe(true);
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
    expect(p.saveBonuses.poison).toBe(8); // P.E. 30 -> save vs magic/poison +8
  });

  test("an unknown Hand-to-Hand id throws instead of silently defaulting", () => {
    expect(() => attacksPerMelee("ninjutsu", 1)).toThrow(/Unknown Hand-to-Hand/);
    expect(() => hthBonuses("ninjutsu", 1)).toThrow(/Unknown Hand-to-Hand/);
  });

  test("P.P. 20 / P.S. 20, Expert H2H at level 3", () => {
    const p = combatProfile({
      attributes: { PP: 20, PS: 20 },
      hthType: "expert",
      level: 3,
    });
    expect(p.attacksPerMelee).toBe(4);
    expect(p.strike).toBe(5); // P.P. +3, Expert +2 at level 3
    expect(p.parry).toBe(6); // P.P. +3, Expert +3 at level 2
    expect(p.dodge).toBe(6);
    expect(p.damageBonus).toBe(5); // P.S. +5, no Expert damage bonus until level 10
  });

  test("preserves the sparse raw H2H record and zeroes absent named totals", () => {
    const p = combatProfile({ attributes: { PP: 20, PS: 16 }, hthType: "basic", level: 1 });
    expect(p.handToHandBonuses).toEqual({ pullPunch: 2, rollWithImpact: 2 });
    expect(p).toMatchObject({
      strike: 3,
      strikeThrown: 3,
      strikeGuns: 0,
      initiative: 0,
      autoDodge: 0,
      saveVsHorrorFactor: 0,
      criticalStrikeOn: 20,
    });
  });

  test("Assassin thrown attacks combine general bonuses while guns use their named bonus only", () => {
    const p = combatProfile({ attributes: { PP: 20 }, hthType: "assassin", level: 15 });
    expect(p.handToHandBonuses).toMatchObject({
      strike: 6,
      strikeThrown: 2,
      strikeGuns: 3,
      initiative: 4,
    });
    expect(p.strike).toBe(9);
    expect(p.strikeThrown).toBe(11);
    expect(p.strikeGuns).toBe(3);
    expect(p.criticalStrikeOn).toBe(19);
  });

  test("Commando auto-dodge uses P.P. plus autoDodge, never ordinary dodge", () => {
    const p = combatProfile({ attributes: { PP: 20 }, hthType: "commando", level: 15 });
    expect(p.handToHandBonuses).toMatchObject({
      dodge: 4,
      autoDodge: 5,
      initiative: 6,
      saveVsHorrorFactor: 5,
    });
    expect(p.dodge).toBe(7);
    expect(p.autoDodge).toBe(8);
    expect(p.initiative).toBe(6);
    expect(p.saveVsHorrorFactor).toBe(5);
    expect(p.criticalStrikeOn).toBe(17);
  });

  test("makes training and ranged-defense capability explicit", () => {
    const untrained = combatProfile({ attributes: { PP: 20 }, hthType: "none", level: 1 });
    expect(untrained).toMatchObject({
      handToHandType: "none",
      hasHandToHandTraining: false,
      hasAutoDodge: false,
      rangedDodge: 3,
      rangedAutoDodge: 0,
    });

    const commando = combatProfile({ attributes: { PP: 20 }, hthType: "commando", level: 15 });
    expect(commando).toMatchObject({
      handToHandType: "commando",
      hasHandToHandTraining: true,
      hasAutoDodge: true,
      dodge: 7,
      autoDodge: 8,
      rangedDodge: 3,
      rangedAutoDodge: 3,
    });
  });

  test("unconditional critical ranges unlock at their printed levels", () => {
    expect(combatProfile({ attributes: {}, hthType: "basic", level: 5 }).criticalStrikeOn).toBe(20);
    expect(combatProfile({ attributes: {}, hthType: "basic", level: 6 }).criticalStrikeOn).toBe(19);
    expect(combatProfile({ attributes: {}, hthType: "expert", level: 5 }).criticalStrikeOn).toBe(
      20,
    );
    expect(combatProfile({ attributes: {}, hthType: "expert", level: 6 }).criticalStrikeOn).toBe(
      18,
    );
    expect(
      combatProfile({ attributes: {}, hthType: "martial-arts", level: 6 }).criticalStrikeOn,
    ).toBe(18);
    expect(combatProfile({ attributes: {}, hthType: "assassin", level: 10 }).criticalStrikeOn).toBe(
      19,
    );
    expect(combatProfile({ attributes: {}, hthType: "commando", level: 14 }).criticalStrikeOn).toBe(
      20,
    );
    expect(combatProfile({ attributes: {}, hthType: "commando", level: 15 }).criticalStrikeOn).toBe(
      17,
    );
  });
});
