import { describe, expect, test } from "vite-plus/test";
import type { Rng } from "../src/engine/dice.ts";
import { leyLineWalker, ppeRange, rollBasePpe, rollPpe } from "../src/engine/occ.ts";
import {
  rollD20,
  rollDamage,
  rollDiceDetailed,
  rollPercentile,
  rollSave,
  rollSkillCheck,
} from "../src/engine/rolls.ts";

/** An RNG that yields die faces in order (1-based), then repeats the last. */
function faces(...values: number[]): (sides: number) => Rng {
  return (sides) => {
    let i = 0;
    return () => {
      const v = values[Math.min(i++, values.length - 1)]!;
      return (v - 1) / sides;
    };
  };
}

describe("d20 rolls", () => {
  test("adds the bonus and judges the target", () => {
    const r = rollD20(3, 15, faces(12)(20));
    expect(r).toMatchObject({ die: 12, bonus: 3, total: 15, target: 15, success: true });
    expect(rollD20(3, 15, faces(11)(20)).success).toBe(false);
  });

  test("no target means no verdict", () => {
    const r = rollD20(5, undefined, faces(10)(20));
    expect(r.total).toBe(15);
    expect(r.success).toBeUndefined();
  });

  test("flags natural 1 and 20", () => {
    expect(rollD20(0, undefined, faces(20)(20)).naturalTwenty).toBe(true);
    expect(rollD20(0, undefined, faces(1)(20)).naturalOne).toBe(true);
    const mid = rollD20(0, undefined, faces(10)(20));
    expect([mid.naturalOne, mid.naturalTwenty]).toEqual([false, false]);
  });
});

describe("saving throws", () => {
  test("uses the save's fixed target and bonus", () => {
    const insanity = { target: 12, bonus: 1 };
    const r = rollSave(insanity, { rng: faces(11)(20) });
    expect(r).toMatchObject({ die: 11, total: 12, target: 12, success: true });
  });

  test("a situational target (spell strength) overrides the fixed one", () => {
    const magic = { targetRange: { min: 12, max: 16 }, bonus: 2 };
    const r = rollSave(magic, { target: 14, rng: faces(11)(20) });
    expect(r).toMatchObject({ total: 13, target: 14, success: false });
  });

  test("refuses percentile saves (coma/death rolls d100)", () => {
    expect(() => rollSave({ bonus: 10, percent: true })).toThrow(/rollPercentile/);
  });
});

describe("percentile rolls", () => {
  test("d100 spans 1-100", () => {
    expect(rollPercentile(() => 0)).toBe(1);
    expect(rollPercentile(() => 0.999)).toBe(100);
  });

  test("skill checks succeed on the value or under", () => {
    expect(rollSkillCheck(44, faces(44)(100))).toEqual({ roll: 44, value: 44, success: true });
    expect(rollSkillCheck(44, faces(45)(100)).success).toBe(false);
  });
});

describe("detailed and damage rolls", () => {
  test("keeps per-die results and matches the formula math", () => {
    const r = rollDiceDetailed("3D6*10+20", faces(2, 4, 6)(6));
    expect(r.dice).toEqual([2, 4, 6]);
    expect(r.total).toBe(140); // (2+4+6) * 10 + 20
  });

  test("a plain constant rolls no dice", () => {
    expect(rollDiceDetailed("5")).toEqual({ dice: [], total: 5 });
  });

  test("damage folds the flat bonus into the total", () => {
    const r = rollDamage("2D6", 4, faces(3, 5)(6));
    expect(r).toMatchObject({ dice: [3, 5], bonus: 4, total: 12 });
  });
});

describe("P.P.E. rolls", () => {
  test("stays inside ppeRange at higher levels", () => {
    const range = ppeRange(leyLineWalker, 14, 3);
    for (let i = 0; i < 100; i++) {
      const r = rollPpe(leyLineWalker, 14, 3);
      expect(r).toBeGreaterThanOrEqual(range.min);
      expect(r).toBeLessThanOrEqual(range.max);
    }
  });

  test("hits the exact range bounds with edge RNG", () => {
    const range = ppeRange(leyLineWalker, 14, 3);
    expect(rollPpe(leyLineWalker, 14, 3, () => 0)).toBe(range.min);
    expect(rollPpe(leyLineWalker, 14, 3, () => 0.999)).toBe(range.max);
  });

  test("rollBasePpe is rollPpe at level 1", () => {
    const range = ppeRange(leyLineWalker, 14, 1);
    expect(rollBasePpe(leyLineWalker, 14, () => 0)).toBe(range.min);
    expect(rollBasePpe(leyLineWalker, 14, () => 0.999)).toBe(range.max);
  });
});
