import { describe, expect, test } from "vite-plus/test";
import {
  combatResolutionRules,
  damageTypeSchema,
  resolveStrike,
  weaponDamageSchema,
  type D20Roll,
} from "../src/index.ts";

describe("combat resolution constants (RUE p.346)", () => {
  test("loads the exact printed constants from page-stamped content", () => {
    expect(combatResolutionRules).toEqual({
      book: "Rifts Ultimate Edition",
      page: 346,
      meleeSeconds: 15,
      automaticMissAtOrBelow: 4,
      sdcPerMd: 100,
      naturalTwentyDamageMultiplier: 2,
    });
  });

  test("weapons and combat share the S.D.C./M.D. type vocabulary", () => {
    expect(damageTypeSchema.parse("sdc")).toBe("sdc");
    expect(damageTypeSchema.parse("md")).toBe("md");
    expect(() => damageTypeSchema.parse("hp")).toThrow();
    expect(weaponDamageSchema.parse({ formula: "2D6", type: "md" })).toEqual({
      formula: "2D6",
      type: "md",
    });
    expect(() => weaponDamageSchema.parse({ formula: "2D6", type: "hp" })).toThrow();
  });
});

function d20(die: number, bonus = 0, overrides: Partial<D20Roll> = {}): D20Roll {
  return {
    die,
    bonus,
    total: die + bonus,
    naturalTwenty: die === 20,
    naturalOne: die === 1,
    ...overrides,
  };
}

describe("resolveStrike (RUE pp.345-346)", () => {
  test("rejects malformed completed rolls and critical thresholds", () => {
    const valid = {
      strike: d20(10, 2),
      allowedDefenses: ["parry"] as const,
      damageType: "sdc" as const,
    };
    expect(() => resolveStrike({ ...valid, strike: d20(0) })).toThrow(/die.*1.*20/i);
    expect(() => resolveStrike({ ...valid, strike: d20(21) })).toThrow(/die.*1.*20/i);
    expect(() => resolveStrike({ ...valid, strike: d20(10.5) })).toThrow(/die.*integer/i);
    expect(() => resolveStrike({ ...valid, strike: d20(10, Number.POSITIVE_INFINITY) })).toThrow(
      /bonus.*finite/i,
    );
    expect(() => resolveStrike({ ...valid, strike: d20(10, 2, { total: 99 }) })).toThrow(
      /total.*die.*bonus/i,
    );
    expect(() => resolveStrike({ ...valid, criticalOn: 1 })).toThrow(/criticalOn.*2.*20/i);
    expect(() => resolveStrike({ ...valid, criticalOn: 21 })).toThrow(/criticalOn.*2.*20/i);
    expect(() => resolveStrike({ ...valid, criticalOn: 18.5 })).toThrow(/criticalOn.*integer/i);
  });

  test("derives natural status from die and applies the post-bonus miss threshold", () => {
    expect(
      resolveStrike({
        strike: d20(1, 100, { naturalOne: false, naturalTwenty: true }),
        allowedDefenses: [],
        damageType: "sdc",
      }),
    ).toEqual({
      outcome: "miss",
      reason: "naturalOne",
      critical: false,
      damageMultiplier: 1,
      damageType: "sdc",
    });
    expect(
      resolveStrike({ strike: d20(2, 2), allowedDefenses: [], damageType: "sdc" }),
    ).toMatchObject({ outcome: "miss", reason: "belowMinimum" });
    expect(
      resolveStrike({ strike: d20(2, 3), allowedDefenses: [], damageType: "sdc" }),
    ).toMatchObject({ outcome: "hit", reason: "unopposed" });
  });

  test("resolves ordinary unopposed, equal-defense, and strike-won rolls", () => {
    expect(
      resolveStrike({ strike: d20(12, 3), allowedDefenses: ["parry"], damageType: "md" }),
    ).toEqual({
      outcome: "hit",
      reason: "unopposed",
      critical: false,
      damageMultiplier: 1,
      damageType: "md",
    });
    expect(
      resolveStrike({
        strike: d20(12, 3),
        defense: { kind: "parry", roll: d20(10, 5) },
        allowedDefenses: ["parry"],
        damageType: "sdc",
      }),
    ).toMatchObject({ outcome: "defended", reason: "parried", critical: false });
    expect(
      resolveStrike({
        strike: d20(12, 4),
        defense: { kind: "autoDodge", roll: d20(10, 5) },
        allowedDefenses: ["autoDodge"],
        damageType: "sdc",
      }),
    ).toMatchObject({ outcome: "hit", reason: "strikeWon" });
  });

  test("a natural-20 defense wins even against a natural-20 strike", () => {
    expect(
      resolveStrike({
        strike: d20(20, 10),
        defense: { kind: "dodge", roll: d20(20, -20) },
        allowedDefenses: ["dodge"],
        damageType: "md",
      }),
    ).toEqual({
      outcome: "defended",
      reason: "dodged",
      critical: false,
      damageMultiplier: 1,
      damageType: "md",
    });
  });

  test("a natural-20 defense beats a higher-total non-natural-20 strike", () => {
    expect(
      resolveStrike({
        strike: d20(19, 100),
        defense: { kind: "dodge", roll: d20(20, -20) },
        allowedDefenses: ["dodge"],
        damageType: "md",
        criticalOn: 18,
      }),
    ).toEqual({
      outcome: "defended",
      reason: "dodged",
      critical: false,
      damageMultiplier: 1,
      damageType: "md",
    });
  });

  test("a natural-20 strike beats every non-natural-20 defense", () => {
    expect(
      resolveStrike({
        strike: d20(20, -10, { naturalTwenty: false }),
        defense: { kind: "dodge", roll: d20(19, 100) },
        allowedDefenses: ["dodge"],
        damageType: "md",
      }),
    ).toEqual({
      outcome: "hit",
      reason: "strikeWon",
      critical: true,
      damageMultiplier: 2,
      damageType: "md",
    });
  });

  test("a lower trained critical remains defendable unless the die is 20", () => {
    expect(
      resolveStrike({
        strike: d20(18, 2),
        allowedDefenses: ["parry"],
        damageType: "sdc",
        criticalOn: 18,
      }),
    ).toMatchObject({ outcome: "hit", critical: true, damageMultiplier: 2 });
    expect(
      resolveStrike({
        strike: d20(18, 2),
        defense: { kind: "parry", roll: d20(17, 3) },
        allowedDefenses: ["parry"],
        damageType: "sdc",
        criticalOn: 18,
      }),
    ).toMatchObject({ outcome: "defended", critical: false, damageMultiplier: 1 });
    expect(
      resolveStrike({ strike: d20(19), allowedDefenses: [], damageType: "sdc" }),
    ).toMatchObject({ outcome: "hit", critical: false, damageMultiplier: 1 });
  });

  test("a defender natural 1 uses the ordinary total comparison", () => {
    expect(
      resolveStrike({
        strike: d20(10),
        defense: { kind: "dodge", roll: d20(1, 9) },
        allowedDefenses: ["dodge"],
        damageType: "sdc",
      }),
    ).toMatchObject({ outcome: "defended", reason: "dodged" });
  });

  test("rejects unsupported or invalid defense kinds", () => {
    expect(() =>
      resolveStrike({
        strike: d20(10, 5),
        defense: { kind: "parry", roll: d20(12) },
        allowedDefenses: ["dodge"],
        damageType: "sdc",
      }),
    ).toThrow(/parry.*not allowed/i);
    expect(() =>
      resolveStrike({
        strike: d20(10, 5),
        defense: { kind: "block" as never, roll: d20(12) },
        allowedDefenses: ["block" as never],
        damageType: "sdc",
      }),
    ).toThrow(/parry|dodge|autoDodge/i);
  });
});
