import { describe, expect, test } from "vite-plus/test";
import {
  combatExchangeRules,
  deriveAttackProfile,
  deriveSheet,
  validateCombatContext,
  type AttackProfile,
  type CharacterInput,
  type CharacterSheet,
} from "../src/index.ts";

const combatant: CharacterInput = {
  name: "Vesper",
  occId: "ley-line-walker",
  level: 1,
  attributes: { IQ: 18, ME: 16, MA: 12, PS: 16, PP: 20, PE: 14, PB: 11, Spd: 12 },
  hthType: "basic",
  skills: [
    { skillId: "wilderness-survival", occBonus: 10 },
    { skillId: "math-basic", occBonus: 10 },
    { skillId: "land-navigation", occBonus: 4 },
  ],
  spellIds: ["globe-of-daylight", "energy-bolt", "armor-of-ithan"],
  rolled: { hitPoints: 18, sdc: 20 },
};

function combatSheet(overrides: Pick<CharacterInput, "items">): CharacterSheet {
  return deriveSheet({ ...combatant, ...overrides });
}

function requireSupported(profile: AttackProfile): Extract<AttackProfile, { supported: true }> {
  expect(profile.supported).toBe(true);
  if (!profile.supported) throw new Error(`Expected a supported attack, got ${profile.reason}.`);
  return profile;
}

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

describe("weapon attack profiles", () => {
  test("classifies real S.D.C. melee and firearm instances", () => {
    const sheet = combatSheet({
      items: [{ itemId: "survival-knife" }, { itemId: "automatic-pistol" }],
    });
    expect(deriveAttackProfile(sheet, 0)).toMatchObject({
      supported: true,
      kind: "melee",
      minimumStrikeTotal: 5,
      strikeBonus: 3,
      damageFormula: "1D6",
      damageBonus: 1,
      criticalOn: 20,
      damageType: "sdc",
    });
    expect(deriveAttackProfile(sheet, 1)).toMatchObject({
      supported: true,
      kind: "ranged",
      minimumStrikeTotal: 8,
      strikeBonus: 0,
      proficiencyBonus: 0,
      damageFormula: "4D6",
      damageBonus: 0,
      criticalOn: 20,
      damageType: "sdc",
    });
  });

  test("refuses M.D. weapons and non-weapons without inventing modes", () => {
    const sheet = combatSheet({
      items: [{ itemId: "wilks-320-laser-pistol" }, { itemId: "canteen" }],
    });
    expect(deriveAttackProfile(sheet, 0)).toMatchObject({
      supported: false,
      reason: "unsupportedMdWeapon",
    });
    expect(deriveAttackProfile(sheet, 1)).toMatchObject({
      supported: false,
      reason: "unsupportedWeaponMode",
    });
    expect(deriveAttackProfile(sheet, 99)).toEqual({
      supported: false,
      reason: "weaponMissingOrChanged",
    });
  });
});

describe("combat context validation", () => {
  test("requires reasons for nonzero GM modifiers and rejects kind mismatch", () => {
    const profile = requireSupported(
      deriveAttackProfile(combatSheet({ items: [{ itemId: "survival-knife" }] }), 0),
    );
    expect(() =>
      validateCombatContext(profile, {
        kind: "melee",
        defenderAware: true,
        parryMode: "standard",
        strikeModifier: 1,
      }),
    ).toThrow(/reason/i);
    expect(() =>
      validateCombatContext(profile, {
        kind: "ranged",
        defenderAware: true,
        rangeBand: "normal",
      }),
    ).toThrow(/kind/i);
  });

  test("rejects unsafe, out-of-range, and unjustified modifiers", () => {
    const profile = requireSupported(
      deriveAttackProfile(combatSheet({ items: [{ itemId: "survival-knife" }] }), 0),
    );
    const context = {
      kind: "melee",
      defenderAware: true,
      parryMode: "standard",
      strikeModifierReason: "higher ground",
    } as const;

    expect(() =>
      validateCombatContext(profile, { ...context, strikeModifier: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow();
    expect(() => validateCombatContext(profile, { ...context, strikeModifier: 101 })).toThrow();
    expect(() =>
      validateCombatContext(profile, {
        ...context,
        strikeModifier: -1,
        strikeModifierReason: "   ",
      }),
    ).toThrow(/string|reason/i);
  });
});
