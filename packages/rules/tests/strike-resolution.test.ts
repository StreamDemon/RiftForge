import { describe, expect, test } from "vite-plus/test";
import { combatResolutionRules, damageTypeSchema, weaponDamageSchema } from "../src/index.ts";

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
