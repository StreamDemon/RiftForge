import { describe, expect, test } from "vite-plus/test";
import {
  authorizeCombatResponse,
  combatExchangeRules,
  deriveAttackProfile,
  deriveDefenseOptions,
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

function combatSheet(
  overrides: Partial<Pick<CharacterInput, "items" | "hthType" | "level">>,
): CharacterSheet {
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

describe("defense option derivation", () => {
  const meleeAttack = requireSupported(
    deriveAttackProfile(combatSheet({ items: [{ itemId: "survival-knife" }] }), 0),
  );
  const rangedAttack = requireSupported(
    deriveAttackProfile(combatSheet({ items: [{ itemId: "automatic-pistol" }] }), 0),
  );

  test("offers aware trained melee defenders parry, dodge, then none", () => {
    const defender = combatSheet({ items: [], hthType: "basic" });

    expect(
      deriveDefenseOptions(defender, meleeAttack, {
        kind: "melee",
        defenderAware: true,
        parryMode: "standard",
      }),
    ).toEqual([
      {
        kind: "parry",
        bonus: 3,
        actionCost: 0,
        explanation: "Parry the melee weapon.",
      },
      {
        kind: "dodge",
        bonus: 3,
        actionCost: 1,
        explanation: "Dodge; costs one action for table tracking.",
      },
      { kind: "none", bonus: 0, actionCost: 0, explanation: "Take the hit." },
    ]);
  });

  test("charges an action for untrained standard parry but not trained standard parry", () => {
    const context = {
      kind: "melee",
      defenderAware: true,
      parryMode: "standard",
    } as const;
    const trained = combatSheet({ items: [], hthType: "basic" });
    const untrained = combatSheet({ items: [], hthType: "none" });

    expect(deriveDefenseOptions(trained, meleeAttack, context)[0]).toMatchObject({
      kind: "parry",
      actionCost: 0,
    });
    expect(deriveDefenseOptions(untrained, meleeAttack, context)[0]).toMatchObject({
      kind: "parry",
      actionCost: 1,
    });
  });

  test("uses zero ordinary parry bonus for a bare-handed weapon parry", () => {
    const defender = combatSheet({ items: [], hthType: "basic" });

    expect(
      deriveDefenseOptions(defender, meleeAttack, {
        kind: "melee",
        defenderAware: true,
        parryMode: "bareHanded",
      })[0],
    ).toEqual({
      kind: "parry",
      bonus: 0,
      actionCost: 0,
      explanation: "Bare-handed weapon parry; no ordinary parry bonus.",
    });
  });

  test("withholds ordinary defenses from unaware melee defenders but retains auto-dodge", () => {
    const basic = combatSheet({ items: [], hthType: "basic" });
    const commando = combatSheet({ items: [], hthType: "commando", level: 15 });
    const context = {
      kind: "melee",
      defenderAware: false,
      parryMode: "standard",
    } as const;

    expect(deriveDefenseOptions(basic, meleeAttack, context)).toEqual([
      { kind: "none", bonus: 0, actionCost: 0, explanation: "Take the hit." },
    ]);
    expect(deriveDefenseOptions(commando, meleeAttack, context)).toEqual([
      {
        kind: "autoDodge",
        bonus: 8,
        actionCost: 0,
        explanation: "Automatic dodge; no action cost.",
      },
      { kind: "none", bonus: 0, actionCost: 0, explanation: "Take the hit." },
    ]);
  });

  test("offers aware ranged defenders only ranged dodge-family options and none", () => {
    const basic = combatSheet({ items: [], hthType: "basic" });
    const commando = combatSheet({ items: [], hthType: "commando", level: 15 });
    const context = {
      kind: "ranged",
      defenderAware: true,
      rangeBand: "normal",
    } as const;

    expect(deriveDefenseOptions(basic, rangedAttack, context)).toEqual([
      {
        kind: "dodge",
        bonus: 3,
        actionCost: 1,
        explanation: "Ranged dodge (0 range-band modifier).",
      },
      { kind: "none", bonus: 0, actionCost: 0, explanation: "Take the hit." },
    ]);
    expect(deriveDefenseOptions(commando, rangedAttack, context)).toEqual([
      {
        kind: "dodge",
        bonus: 3,
        actionCost: 1,
        explanation: "Ranged dodge (0 range-band modifier).",
      },
      {
        kind: "autoDodge",
        bonus: 3,
        actionCost: 0,
        explanation: "Automatic ranged dodge (0 range-band modifier).",
      },
      { kind: "none", bonus: 0, actionCost: 0, explanation: "Take the hit." },
    ]);
  });

  test.each([
    ["pointBlank", -10],
    ["close", -5],
    ["normal", 0],
  ] as const)("applies the %s penalty to both ranged dodge families", (rangeBand, penalty) => {
    const commando = combatSheet({ items: [], hthType: "commando", level: 15 });
    const options = deriveDefenseOptions(commando, rangedAttack, {
      kind: "ranged",
      defenderAware: true,
      rangeBand,
    });

    expect(options.slice(0, 2).map((option) => option.bonus)).toEqual([
      commando.combat.rangedDodge + penalty,
      commando.combat.rangedAutoDodge + penalty,
    ]);
  });

  test("offers unaware ranged defenders none even when they have auto-dodge", () => {
    const commando = combatSheet({ items: [], hthType: "commando", level: 15 });

    expect(
      deriveDefenseOptions(commando, rangedAttack, {
        kind: "ranged",
        defenderAware: false,
        rangeBand: "normal",
      }),
    ).toEqual([{ kind: "none", bonus: 0, actionCost: 0, explanation: "Take the hit." }]);
  });

  test("rejects a context that does not match the attack kind", () => {
    const defender = combatSheet({ items: [], hthType: "basic" });

    expect(() =>
      deriveDefenseOptions(defender, meleeAttack, {
        kind: "ranged",
        defenderAware: true,
        rangeBand: "normal",
      }),
    ).toThrow(/invalidContext/);
  });
});

describe("combat response authorization", () => {
  const defender = combatSheet({ items: [], hthType: "basic" });
  const meleeAttack = requireSupported(
    deriveAttackProfile(combatSheet({ items: [{ itemId: "survival-knife" }] }), 0),
  );
  const options = deriveDefenseOptions(defender, meleeAttack, {
    kind: "melee",
    defenderAware: true,
    parryMode: "standard",
  });

  test("uses server-derived option metadata and normalizes the situational modifier", () => {
    expect(
      authorizeCombatResponse(options, {
        kind: "parry",
        bonus: 99,
        actionCost: 1,
        defenseModifier: -2,
        defenseModifierReason: "unstable footing",
      }),
    ).toEqual({
      kind: "parry",
      bonus: 3,
      actionCost: 0,
      explanation: "Parry the melee weapon.",
      defenseModifier: -2,
      defenseModifierReason: "unstable footing",
      totalBonus: 1,
    });
    expect(authorizeCombatResponse(options, { kind: "none" })).toEqual({
      kind: "none",
      bonus: 0,
      actionCost: 0,
      explanation: "Take the hit.",
      defenseModifier: 0,
      totalBonus: 0,
    });
  });

  test("requires a reason for every nonzero defense modifier", () => {
    expect(() => authorizeCombatResponse(options, { kind: "dodge", defenseModifier: 1 })).toThrow(
      /reason/i,
    );
    expect(() =>
      authorizeCombatResponse(options, {
        kind: "dodge",
        defenseModifier: -1,
        defenseModifierReason: "   ",
      }),
    ).toThrow(/string|reason/i);
  });

  test("rejects unsafe, fractional, and out-of-range defense modifiers", () => {
    const response = {
      kind: "dodge",
      defenseModifierReason: "situational ruling",
    } as const;

    expect(() =>
      authorizeCombatResponse(options, {
        ...response,
        defenseModifier: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow();
    expect(() => authorizeCombatResponse(options, { ...response, defenseModifier: 1.5 })).toThrow();
    expect(() => authorizeCombatResponse(options, { ...response, defenseModifier: 101 })).toThrow();
  });

  test("rejects defenses outside the derived list and never defaults to none", () => {
    expect(() => authorizeCombatResponse(options, { kind: "autoDodge" })).toThrow(
      /illegalDefense: autoDodge/,
    );
    expect(() => authorizeCombatResponse(options, {})).toThrow();
  });
});
