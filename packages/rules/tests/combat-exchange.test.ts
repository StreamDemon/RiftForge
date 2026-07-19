import { describe, expect, test } from "vite-plus/test";
import { combatExchangeRules } from "../src/index.ts";

describe("combat exchange constants", () => {
  test("loads rendered-page S.D.C. combat values", () => {
    expect(combatExchangeRules).toEqual({
      book: "Rifts Ultimate Edition",
      pages: {
        armorAndVitals: 287,
        sdcCombat: 339,
        defense: 340,
        damage: 341,
        automaticDodge: 344,
        modernWeapons: 360,
        rangedDodging: 361,
      },
      minimumStrikeTotal: { melee: 5, ranged: 8 },
      rangedDodgeModifier: { pointBlank: -10, close: -5, normal: 0 },
    });
  });
});
