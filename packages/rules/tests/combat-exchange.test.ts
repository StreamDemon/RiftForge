import { describe, expect, test } from "vite-plus/test";
import {
  attackerCombatStateToken,
  armorSchema,
  authorizeCombatResponse,
  combatExchangeErrorCodeSchema,
  combatExchangeRules,
  combatExchangeRulesSchema,
  defenderCombatStateToken,
  deriveAttackProfile,
  deriveDefenseOptions,
  deriveProtection,
  deriveSheet,
  evaluateDeclaration,
  resolveCombatExchange,
  routeCombatHit,
  validateCombatContext,
  type AttackProfile,
  type CharacterInput,
  type CharacterSheet,
  type D20Roll,
  type DamageRoll,
  type ProtectionState,
  type ResolveCombatExchangeInput,
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

const tokenBackstory = "TOKEN-SCOPE-SENTINEL: Vesper escaped the Ashwood rift.";
const tokenItems = [
  { itemId: "survival-knife" },
  { itemId: "llw-concealed-light", worn: true, rolledMdc: 40 },
] as const;
const tokenCurrent = { hitPoints: 16, sdc: 18, ppe: 70, armor: 36 } as const;
const tokenCombatant: CharacterInput = {
  ...combatant,
  narrative: { backstory: tokenBackstory },
  items: [...tokenItems],
  rolled: { hitPoints: 18, sdc: 20, ppe: 84 },
  current: tokenCurrent,
};

function tokenSheet(overrides: Partial<CharacterInput> = {}): CharacterSheet {
  return deriveSheet({ ...tokenCombatant, ...overrides });
}

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

const expectedCombatExchangeRules = {
  book: "Rifts Ultimate Edition",
  pages: {
    armorAndVitals: 287,
    megaDamageIntro: 288,
    sdcCombat: 339,
    defense: 340,
    damage: 341,
    automaticDodge: 344,
    megaDamageCombat: 355,
    modernWeapons: 360,
    rangedDodging: 361,
  },
  rules: {
    sdcPerMd: 100,
    minimumSdcToDamageMdc: 100,
    depletedMdcArmorBypassStrike: 8,
    finalMdcAbsorbsDestroyingBlast: true,
  },
  minimumStrikeTotal: { melee: 5, ranged: 8 },
  rangedDodgeModifier: { pointBlank: -10, close: -5, normal: 0 },
} as const;

describe("combat exchange constants", () => {
  test("loads rendered-page S.D.C. combat values", () => {
    expect(combatExchangeRules).toEqual(expectedCombatExchangeRules);
  });

  test.each([
    [
      "mega-damage introduction page",
      {
        ...expectedCombatExchangeRules,
        pages: { ...expectedCombatExchangeRules.pages, megaDamageIntro: 289 },
      },
    ],
    [
      "mega-damage combat page",
      {
        ...expectedCombatExchangeRules,
        pages: { ...expectedCombatExchangeRules.pages, megaDamageCombat: 356 },
      },
    ],
    [
      "S.D.C. per M.D. ratio",
      {
        ...expectedCombatExchangeRules,
        rules: { ...expectedCombatExchangeRules.rules, sdcPerMd: 101 },
      },
    ],
    [
      "minimum S.D.C. needed to damage M.D.C.",
      {
        ...expectedCombatExchangeRules,
        rules: { ...expectedCombatExchangeRules.rules, minimumSdcToDamageMdc: 101 },
      },
    ],
    [
      "depleted M.D.C. armor bypass strike",
      {
        ...expectedCombatExchangeRules,
        rules: { ...expectedCombatExchangeRules.rules, depletedMdcArmorBypassStrike: 9 },
      },
    ],
    [
      "final M.D.C. absorption rule",
      {
        ...expectedCombatExchangeRules,
        rules: { ...expectedCombatExchangeRules.rules, finalMdcAbsorbsDestroyingBlast: false },
      },
    ],
  ])("rejects an altered %s literal", (_name, candidate) => {
    expect(combatExchangeRulesSchema.safeParse(candidate).success).toBe(false);
  });

  test("accepts new readiness errors while retaining legacy unsupported errors", () => {
    expect(combatExchangeErrorCodeSchema.parse("combatantDead")).toBe("combatantDead");
    expect(combatExchangeErrorCodeSchema.parse("armorNotReady")).toBe("armorNotReady");
    expect(combatExchangeErrorCodeSchema.parse("unsupportedMdWeapon")).toBe("unsupportedMdWeapon");
    expect(combatExchangeErrorCodeSchema.parse("unsupportedMdcProtection")).toBe(
      "unsupportedMdcProtection",
    );
  });
});

describe("combat-state tokens", () => {
  test("uses stable, explicitly ordered tuples for independently derived equivalent sheets", () => {
    const first = tokenSheet();
    const second = tokenSheet();
    const entry = first.equipment[0]!;
    const armor = first.armor!;
    const attack = requireSupported(deriveAttackProfile(first, 0));
    if (entry.item.kind !== "weapon") throw new Error("Expected the selected item to be a weapon.");

    expect(first).not.toBe(second);
    expect(attackerCombatStateToken(first, 0)).toBe(attackerCombatStateToken(second, 0));
    expect(defenderCombatStateToken(first)).toBe(defenderCombatStateToken(second));
    expect(JSON.parse(attackerCombatStateToken(first, 0))).toEqual([
      "attacker-v2",
      first.level,
      [
        first.attributes.IQ,
        first.attributes.ME,
        first.attributes.MA,
        first.attributes.PS,
        first.attributes.PP,
        first.attributes.PE,
        first.attributes.PB,
        first.attributes.Spd,
      ],
      [
        first.combat.handToHandType,
        first.combat.strike,
        first.combat.damageBonus,
        first.combat.strikeGuns,
        first.combat.criticalStrikeOn,
      ],
      first.vitals.lifeState,
      [
        combatExchangeRules.book,
        [287, 288, 339, 340, 341, 344, 355, 360, 361],
        [100, 100, 8, true],
        [5, 8],
        [-10, -5, 0],
      ],
      0,
      [
        "weapon",
        entry.item.id,
        entry.item.category,
        entry.item.damage.formula,
        entry.item.damage.type,
        entry.item.page,
        [false, null],
      ],
      [
        "supported",
        attack.kind,
        attack.minimumStrikeTotal,
        attack.strikeBonus,
        attack.strikeBonusSources.map((source) => [source.source, source.label, source.value]),
        attack.proficiencyBonus,
        attack.damageFormula,
        attack.damageBonus,
        attack.criticalOn,
        attack.damageType,
        [
          attack.weapon.index,
          attack.weapon.itemId,
          attack.weapon.name,
          attack.weapon.category,
          false,
          null,
        ],
      ],
    ]);
    expect(JSON.parse(defenderCombatStateToken(first))).toEqual([
      "defender-v2",
      first.level,
      [
        first.attributes.IQ,
        first.attributes.ME,
        first.attributes.MA,
        first.attributes.PS,
        first.attributes.PP,
        first.attributes.PE,
        first.attributes.PB,
        first.attributes.Spd,
      ],
      [
        first.combat.handToHandType,
        first.combat.hasHandToHandTraining,
        first.combat.hasAutoDodge,
        first.combat.parry,
        first.combat.dodge,
        first.combat.autoDodge,
        first.combat.rangedDodge,
        first.combat.rangedAutoDodge,
      ],
      [
        first.vitals.sdc.rolled,
        first.vitals.sdc.current,
        first.vitals.hitPoints.rolled,
        first.vitals.hitPoints.current,
        first.vitals.comaDeathFloor,
        first.vitals.lifeState,
      ],
      [armor.item.id, "mdc", true, null, armor.max, armor.current],
    ]);
  });

  test("stales an otherwise-identical attacker sheet when life state becomes dead", () => {
    const alive = tokenSheet();
    const dead: CharacterSheet = {
      ...alive,
      vitals: { ...alive.vitals, lifeState: "dead" },
    };

    expect(attackerCombatStateToken(dead, 0)).not.toBe(attackerCombatStateToken(alive, 0));
  });

  test("ignores narrative, P.P.E., and unrelated inventory without leaking backstory", () => {
    const base = tokenSheet();
    const baseAttacker = attackerCombatStateToken(base, 0);
    const baseDefender = defenderCombatStateToken(base);
    const irrelevantVariants = [
      tokenSheet({ narrative: { backstory: "A completely different history." } }),
      tokenSheet({ current: { ...tokenCurrent, ppe: 69 } }),
      tokenSheet({ items: [...tokenItems, { itemId: "canteen" }] }),
    ];

    for (const variant of irrelevantVariants) {
      expect(attackerCombatStateToken(variant, 0)).toBe(baseAttacker);
      expect(defenderCombatStateToken(variant)).toBe(baseDefender);
    }
    expect(baseAttacker).not.toContain(tokenBackstory);
    expect(baseDefender).not.toContain(tokenBackstory);
  });

  test("stales attacks for every attacker-derived dimension and selected weapon change", () => {
    const base = tokenSheet();
    const baseToken = attackerCombatStateToken(base, 0);
    const attributeOrder = ["IQ", "ME", "MA", "PS", "PP", "PE", "PB", "Spd"] as const;

    expect(attackerCombatStateToken(tokenSheet({ level: 2 }), 0)).not.toBe(baseToken);
    for (const code of attributeOrder) {
      const changed = tokenSheet({
        attributes: { ...tokenCombatant.attributes, [code]: tokenCombatant.attributes[code] + 1 },
      });
      expect(attackerCombatStateToken(changed, 0)).not.toBe(baseToken);
    }

    expect(attackerCombatStateToken(tokenSheet({ hthType: "none" }), 0)).not.toBe(baseToken);
    const changedCombatProfiles = [
      { handToHandType: "none" },
      { strike: base.combat.strike + 1 },
      { damageBonus: base.combat.damageBonus + 1 },
      { strikeGuns: base.combat.strikeGuns + 1 },
      { criticalStrikeOn: base.combat.criticalStrikeOn - 1 },
    ];
    for (const combatChange of changedCombatProfiles) {
      const changed = { ...base, combat: { ...base.combat, ...combatChange } };
      expect(attackerCombatStateToken(changed, 0)).not.toBe(baseToken);
    }

    expect(attackerCombatStateToken(base, 1)).not.toBe(baseToken);
    const changedWeapon = tokenSheet({
      items: [{ itemId: "hand-axe" }, tokenItems[1]],
    });
    expect(attackerCombatStateToken(changedWeapon, 0)).not.toBe(baseToken);
  });

  test("stales attacks for selected instance state but not appended inventory", () => {
    const bodyCurrent = { hitPoints: 16, sdc: 18, ppe: 70 } as const;
    const selectedWorn = tokenSheet();
    const selectedUnworn = tokenSheet({
      items: [tokenItems[0], { itemId: "llw-concealed-light", rolledMdc: 40 }],
      current: bodyCurrent,
    });
    const changedRoll = tokenSheet({
      items: [tokenItems[0], { itemId: "llw-concealed-light", rolledMdc: 41 }],
      current: bodyCurrent,
    });
    const appendedInventory = tokenSheet({ items: [...tokenItems, { itemId: "canteen" }] });

    expect(attackerCombatStateToken(selectedWorn, 1)).not.toBe(
      attackerCombatStateToken(selectedUnworn, 1),
    );
    expect(attackerCombatStateToken(selectedUnworn, 1)).not.toBe(
      attackerCombatStateToken(changedRoll, 1),
    );
    expect(attackerCombatStateToken(appendedInventory, 0)).toBe(
      attackerCombatStateToken(selectedWorn, 0),
    );
  });

  test("fingerprints selected weapon tier, mechanics, attack sources, and page-stamped rules", () => {
    const base = tokenSheet();
    const selected = base.equipment[0]!;
    if (selected.item.kind !== "weapon")
      throw new Error("Expected the selected test item to be a weapon.");
    const baseToken = attackerCombatStateToken(base, 0);
    const withWeapon = (item: typeof selected.item): CharacterSheet => ({
      ...base,
      equipment: [{ ...selected, item }, ...base.equipment.slice(1)],
    });
    const changedSources: CharacterSheet = {
      ...base,
      attributeBonuses: {
        ...base.attributeBonuses,
        strike: (base.attributeBonuses.strike ?? 0) + 1,
      },
      combat: {
        ...base.combat,
        handToHandBonuses: {
          ...base.combat.handToHandBonuses,
          strike: (base.combat.handToHandBonuses.strike ?? 0) - 1,
        },
      },
    };
    const changedRules = {
      ...combatExchangeRules,
      pages: { ...combatExchangeRules.pages, sdcCombat: 340 },
      minimumStrikeTotal: { ...combatExchangeRules.minimumStrikeTotal, melee: 6 },
    } as unknown as typeof combatExchangeRules;

    expect(
      attackerCombatStateToken(
        withWeapon({
          ...selected.item,
          damage: { ...selected.item.damage, formula: "2D6" },
        }),
        0,
      ),
    ).not.toBe(baseToken);
    expect(attackerCombatStateToken(withWeapon({ ...selected.item, category: "axe" }), 0)).not.toBe(
      baseToken,
    );
    expect(
      attackerCombatStateToken(
        withWeapon({
          ...selected.item,
          damage: { ...selected.item.damage, type: "md" },
        }),
        0,
      ),
    ).not.toBe(baseToken);
    expect(attackerCombatStateToken(changedSources, 0)).not.toBe(baseToken);
    expect(attackerCombatStateToken(base, 0, changedRules)).not.toBe(baseToken);
  });

  test.each([
    [
      "mega-damage introduction page",
      {
        ...combatExchangeRules,
        pages: {
          ...combatExchangeRules.pages,
          megaDamageIntro: combatExchangeRules.pages.megaDamageIntro + 1,
        },
      },
    ],
    [
      "mega-damage combat page",
      {
        ...combatExchangeRules,
        pages: {
          ...combatExchangeRules.pages,
          megaDamageCombat: combatExchangeRules.pages.megaDamageCombat + 1,
        },
      },
    ],
    [
      "S.D.C.-per-M.D. ratio",
      {
        ...combatExchangeRules,
        rules: { ...combatExchangeRules.rules, sdcPerMd: combatExchangeRules.rules.sdcPerMd + 1 },
      },
    ],
    [
      "minimum S.D.C. needed to damage M.D.C.",
      {
        ...combatExchangeRules,
        rules: {
          ...combatExchangeRules.rules,
          minimumSdcToDamageMdc: combatExchangeRules.rules.minimumSdcToDamageMdc + 1,
        },
      },
    ],
    [
      "depleted M.D.C. armor bypass strike",
      {
        ...combatExchangeRules,
        rules: {
          ...combatExchangeRules.rules,
          depletedMdcArmorBypassStrike: combatExchangeRules.rules.depletedMdcArmorBypassStrike + 1,
        },
      },
    ],
    [
      "final M.D.C. absorption rule",
      {
        ...combatExchangeRules,
        rules: {
          ...combatExchangeRules.rules,
          finalMdcAbsorbsDestroyingBlast: !combatExchangeRules.rules.finalMdcAbsorbsDestroyingBlast,
        },
      },
    ],
  ])("stales attacker-v2 when the %s changes", (_name, changedRules) => {
    const sheet = tokenSheet();
    const baseToken = attackerCombatStateToken(sheet, 0);

    expect(
      attackerCombatStateToken(sheet, 0, changedRules as unknown as typeof combatExchangeRules),
    ).not.toBe(baseToken);
  });

  test("stales defenses for level, every attribute, and every defense-profile dimension", () => {
    const base = tokenSheet();
    const baseToken = defenderCombatStateToken(base);
    const attributeOrder = ["IQ", "ME", "MA", "PS", "PP", "PE", "PB", "Spd"] as const;

    expect(defenderCombatStateToken(tokenSheet({ level: 2 }))).not.toBe(baseToken);
    for (const code of attributeOrder) {
      const changed = tokenSheet({
        attributes: { ...tokenCombatant.attributes, [code]: tokenCombatant.attributes[code] + 1 },
      });
      expect(defenderCombatStateToken(changed)).not.toBe(baseToken);
    }

    expect(defenderCombatStateToken(tokenSheet({ hthType: "none" }))).not.toBe(baseToken);
    const changedCombatProfiles = [
      { handToHandType: "none" },
      { hasHandToHandTraining: !base.combat.hasHandToHandTraining },
      { hasAutoDodge: !base.combat.hasAutoDodge },
      { parry: base.combat.parry + 1 },
      { dodge: base.combat.dodge + 1 },
      { autoDodge: base.combat.autoDodge + 1 },
      { rangedDodge: base.combat.rangedDodge + 1 },
      { rangedAutoDodge: base.combat.rangedAutoDodge + 1 },
    ];
    for (const combatChange of changedCombatProfiles) {
      const changed = { ...base, combat: { ...base.combat, ...combatChange } };
      expect(defenderCombatStateToken(changed)).not.toBe(baseToken);
    }
  });

  test("stales defenses for every rolled/current body pool, life state, and the coma floor", () => {
    const base = tokenSheet();
    const baseToken = defenderCombatStateToken(base);
    const changedVitals = [
      { ...base.vitals, sdc: { ...base.vitals.sdc, rolled: base.vitals.sdc.rolled! + 1 } },
      { ...base.vitals, sdc: { ...base.vitals.sdc, current: base.vitals.sdc.current! - 1 } },
      {
        ...base.vitals,
        hitPoints: { ...base.vitals.hitPoints, rolled: base.vitals.hitPoints.rolled! + 1 },
      },
      {
        ...base.vitals,
        hitPoints: { ...base.vitals.hitPoints, current: base.vitals.hitPoints.current! - 1 },
      },
      { ...base.vitals, comaDeathFloor: base.vitals.comaDeathFloor - 1 },
      { ...base.vitals, lifeState: "coma" as const },
    ];

    for (const vitals of changedVitals) {
      expect(defenderCombatStateToken({ ...base, vitals })).not.toBe(baseToken);
    }
  });

  test("stales defenses for complete worn-protection identity, tier, rating, and pools", () => {
    const base = tokenSheet();
    const sdcArmor = armorSchema.parse({
      kind: "armor",
      id: "token-sdc-armor",
      name: "Token S.D.C. Armor",
      ar: 12,
      sdc: 30,
      page: 287,
    });
    const baseArmor = { item: sdcArmor, max: 30, current: 25 };
    const armored = { ...base, armor: baseArmor };
    const baseToken = defenderCombatStateToken(armored);
    const changedArmorStates: NonNullable<CharacterSheet["armor"]>[] = [
      {
        ...baseArmor,
        item: armorSchema.parse({ ...sdcArmor, id: "token-sdc-armor-2" }),
      },
      {
        item: armorSchema.parse({ ...sdcArmor, sdc: 31 }),
        max: 31,
        current: 25,
      },
      { ...baseArmor, current: 24 },
      {
        item: armorSchema.parse({
          kind: "armor",
          id: sdcArmor.id,
          name: sdcArmor.name,
          mdc: { mainBody: "30" },
          page: 287,
        }),
        max: 30,
        current: 25,
      },
      {
        ...baseArmor,
        item: armorSchema.parse({ ...sdcArmor, ar: 13 }),
      },
    ];

    for (const armor of changedArmorStates) {
      expect(defenderCombatStateToken({ ...armored, armor })).not.toBe(baseToken);
    }
  });

  test("stales defenses for M.D.C. readiness, maximum, and current capacity", () => {
    const ready = tokenSheet();
    const baseToken = defenderCombatStateToken(ready);
    const bodyCurrent = { hitPoints: 16, sdc: 18, ppe: 70 } as const;
    const variants = [
      tokenSheet({
        items: [tokenItems[0], { itemId: "llw-concealed-light", worn: true }],
        current: bodyCurrent,
      }),
      tokenSheet({
        items: [tokenItems[0], { itemId: "llw-concealed-light", worn: true, rolledMdc: 41 }],
        current: { ...bodyCurrent, armor: 36 },
      }),
      tokenSheet({ current: { ...tokenCurrent, armor: 35 } }),
      tokenSheet({ current: { ...tokenCurrent, armor: 0 } }),
    ];

    for (const variant of variants) {
      expect(defenderCombatStateToken(variant)).not.toBe(baseToken);
    }
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

  test("authorizes catalog M.D. energy pistols and rifles with their printed profiles", () => {
    const sheet = combatSheet({
      items: [{ itemId: "wilks-320-laser-pistol" }, { itemId: "wilks-447-laser-rifle" }],
    });
    expect(deriveAttackProfile(sheet, 0)).toMatchObject({
      supported: true,
      kind: "ranged",
      minimumStrikeTotal: 8,
      strikeBonus: 0,
      proficiencyBonus: 0,
      damageFormula: "1D6",
      damageBonus: 0,
      criticalOn: 20,
      damageType: "md",
      weapon: { category: "energyPistol" },
    });
    expect(deriveAttackProfile(sheet, 1)).toMatchObject({
      supported: true,
      kind: "ranged",
      minimumStrikeTotal: 8,
      strikeBonus: 0,
      proficiencyBonus: 0,
      damageFormula: "3D6",
      damageBonus: 0,
      criticalOn: 20,
      damageType: "md",
      weapon: { category: "energyRifle" },
    });
  });

  test("refuses non-weapons and missing instances without inventing modes", () => {
    const sheet = combatSheet({ items: [{ itemId: "canteen" }] });
    expect(deriveAttackProfile(sheet, 1)).toMatchObject({
      supported: false,
      reason: "weaponMissingOrChanged",
    });
    expect(deriveAttackProfile(sheet, 0)).toMatchObject({
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

  test("rejects a nonzero defense modifier when taking the hit", () => {
    expect(() =>
      authorizeCombatResponse(options, {
        kind: "none",
        defenseModifier: 1,
        defenseModifierReason: "GM ruling",
      }),
    ).toThrow(/take-the-hit.*defense modifier/i);
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

describe("declaration evaluation", () => {
  test("applies the melee and ranged declaration minimums after bonuses", () => {
    expect(evaluateDeclaration(d20(4), 5)).toEqual({
      status: "miss",
      reason: "belowMinimum",
    });
    expect(evaluateDeclaration(d20(5), 5)).toEqual({ status: "pendingDefense" });
    expect(evaluateDeclaration(d20(7), 8)).toEqual({
      status: "miss",
      reason: "belowMinimum",
    });
    expect(evaluateDeclaration(d20(8), 8)).toEqual({ status: "pendingDefense" });
  });

  test("a natural 1 misses and malformed completed rolls use resolver validation", () => {
    expect(evaluateDeclaration(d20(1, 100), 5)).toEqual({
      status: "miss",
      reason: "naturalOne",
    });
    expect(() => evaluateDeclaration(d20(5, 0, { total: 99 }), 5)).toThrow(/total.*die.*bonus/i);
  });
});

describe("protection classification", () => {
  test("derives no protection for an unarmored sheet", () => {
    expect(deriveProtection(combatSheet({ items: [] }))).toEqual({ kind: "none" });
  });

  test.each([
    ["full", undefined, 70],
    ["partial", 35, 35],
    ["depleted", 0, 0],
  ] as const)(
    "preserves %s fixed-capacity M.D.C. armor as protection",
    (_state, current, expected) => {
      const sheet = deriveSheet({
        ...combatant,
        items: [{ itemId: "gladiator", worn: true }],
        ...(current === undefined ? {} : { current: { armor: current } }),
      });

      expect(deriveProtection(sheet)).toEqual({
        kind: "mdcArmor",
        itemId: "gladiator",
        name: "Gladiator Full Environmental Body Armor",
        max: 70,
        current: expected,
      });
    },
  );

  test("preserves unrolled dice-capacity M.D.C. armor with absent pools", () => {
    expect(
      deriveProtection(combatSheet({ items: [{ itemId: "llw-concealed-light", worn: true }] })),
    ).toEqual({
      kind: "mdcArmor",
      itemId: "llw-concealed-light",
      name: "Ley Line Walker Concealed Armor (Light)",
    });
  });

  test("continues to collapse depleted S.D.C. armor to no protection", () => {
    const fixture = armorSchema.parse({
      kind: "armor",
      id: "depleted-sdc-armor",
      name: "Depleted S.D.C. Armor",
      ar: 12,
      sdc: 30,
      page: 287,
    });

    expect(
      deriveProtection({
        ...combatSheet({ items: [] }),
        armor: { item: fixture, max: 30, current: 0 },
      }),
    ).toEqual({ kind: "none" });
  });
});

describe("tiered hit routing", () => {
  const fixture = armorSchema.parse({
    kind: "armor",
    id: "test-sdc-armor",
    name: "Validated S.D.C. Armor Fixture",
    ar: 12,
    sdc: 30,
    page: 287,
  });
  const armor: ProtectionState = {
    kind: "sdcArmor",
    itemId: fixture.id,
    name: fixture.name,
    ar: fixture.ar!,
    max: fixture.sdc!,
    current: 5,
  };

  test.each([
    ["S.D.C. below", 11, { type: "sdc", value: 9 }, undefined],
    ["S.D.C. at", 12, { type: "sdc", value: 9 }, undefined],
    ["M.D. below", 11, { type: "md", value: 1 }, { type: "sdc", value: 100 }],
    ["M.D. at", 12, { type: "md", value: 1 }, { type: "sdc", value: 100 }],
  ] as const)(
    "a %s A.R. strike ablates S.D.C. armor without spilling",
    (_case, strikeTotal, damage, convertedDamage) => {
      expect(
        routeCombatHit({
          strikeTotal,
          damage,
          protection: armor,
          body: { sdc: 10, hitPoints: 20 },
          comaDeathFloor: -10,
        }),
      ).toEqual({
        routingVersion: 2,
        kind: "armor",
        nativeDamage: damage,
        ...(convertedDamage === undefined ? {} : { convertedDamage }),
        armor: {
          kind: "sdcArmor",
          itemId: fixture.id,
          name: fixture.name,
          before: 5,
          after: 0,
        },
        body: {
          before: { sdc: 10, hitPoints: 20 },
          after: { sdc: 10, hitPoints: 20 },
        },
        finalBlastAbsorbed: true,
      });
    },
  );

  test.each([
    ["S.D.C.", { type: "sdc", value: 9 }, undefined, { sdc: 1, hitPoints: 20 }],
    ["M.D.", { type: "md", value: 1 }, { type: "sdc", value: 100 }, { sdc: 0, hitPoints: -10 }],
  ] as const)(
    "a %s strike above A.R. routes the full hit to the body without changing armor",
    (_tier, damage, convertedDamage, after) => {
      expect(
        routeCombatHit({
          strikeTotal: 13,
          damage,
          protection: armor,
          body: { sdc: 10, hitPoints: 20 },
          comaDeathFloor: -10,
        }),
      ).toEqual({
        routingVersion: 2,
        kind: damage.type === "md" ? "fatal" : "body",
        nativeDamage: damage,
        ...(convertedDamage === undefined ? {} : { convertedDamage }),
        armor: {
          kind: "sdcArmor",
          itemId: fixture.id,
          name: fixture.name,
          before: 5,
          after: 5,
        },
        body: {
          before: { sdc: 10, hitPoints: 20 },
          after,
        },
        lifeState: {
          before: "alive",
          after: damage.type === "md" ? "dead" : "alive",
        },
      });
    },
  );

  test("depleted armor routes future hits through body S.D.C. before Hit Points", () => {
    expect(
      routeCombatHit({
        strikeTotal: 12,
        damage: { type: "sdc", value: 5 },
        protection: { ...armor, current: 0 },
        body: { sdc: 3, hitPoints: 20 },
        comaDeathFloor: -10,
      }),
    ).toEqual({
      routingVersion: 2,
      kind: "body",
      nativeDamage: { type: "sdc", value: 5 },
      armor: {
        kind: "sdcArmor",
        itemId: fixture.id,
        name: fixture.name,
        before: 0,
        after: 0,
      },
      body: {
        before: { sdc: 3, hitPoints: 20 },
        after: { sdc: 0, hitPoints: 18 },
      },
      lifeState: { before: "alive", after: "alive" },
    });
  });

  const mdcArmor: ProtectionState = {
    kind: "mdcArmor",
    itemId: "gladiator",
    name: "Gladiator Full Environmental Body Armor",
    max: 70,
    current: 10,
  };

  test.each([
    [99, "stopped", undefined, 10],
    [100, "armor", 1, 9],
    [199, "armor", 1, 9],
    [200, "armor", 2, 8],
    [450, "armor", 4, 6],
    [496, "armor", 4, 6],
  ] as const)(
    "routes %i S.D.C. against intact M.D.C. armor as %s",
    (value, kind, convertedValue, after) => {
      const result = routeCombatHit({
        strikeTotal: 20,
        damage: { type: "sdc", value },
        protection: mdcArmor,
        body: { sdc: 10, hitPoints: 20 },
        comaDeathFloor: -10,
      });

      expect(result).toEqual(
        kind === "stopped"
          ? {
              routingVersion: 2,
              kind: "stopped",
              reason: "intactMdcImpervious",
              nativeDamage: { type: "sdc", value },
              armor: {
                kind: "mdcArmor",
                itemId: mdcArmor.itemId,
                name: mdcArmor.name,
                before: 10,
                after: 10,
              },
              body: {
                before: { sdc: 10, hitPoints: 20 },
                after: { sdc: 10, hitPoints: 20 },
              },
            }
          : {
              routingVersion: 2,
              kind: "armor",
              nativeDamage: { type: "sdc", value },
              convertedDamage: { type: "md", value: convertedValue },
              armor: {
                kind: "mdcArmor",
                itemId: mdcArmor.itemId,
                name: mdcArmor.name,
                before: 10,
                after,
              },
              body: {
                before: { sdc: 10, hitPoints: 20 },
                after: { sdc: 10, hitPoints: 20 },
              },
              finalBlastAbsorbed: false,
            },
      );
    },
  );

  test.each([
    [
      { type: "sdc", value: 200 },
      { type: "md", value: 2 },
    ],
    [{ type: "md", value: 21 }, undefined],
  ] as const)(
    "absorbs the full %s final M.D.C. blast without body spill",
    (damage, convertedDamage) => {
      expect(
        routeCombatHit({
          strikeTotal: 20,
          damage,
          protection: { ...mdcArmor, current: 1 },
          body: { sdc: 10, hitPoints: 20 },
          comaDeathFloor: -10,
        }),
      ).toEqual({
        routingVersion: 2,
        kind: "armor",
        nativeDamage: damage,
        ...(convertedDamage === undefined ? {} : { convertedDamage }),
        armor: {
          kind: "mdcArmor",
          itemId: mdcArmor.itemId,
          name: mdcArmor.name,
          before: 1,
          after: 0,
        },
        body: {
          before: { sdc: 10, hitPoints: 20 },
          after: { sdc: 10, hitPoints: 20 },
        },
        finalBlastAbsorbed: true,
      });
    },
  );

  test("a depleted M.D.C. shell stops an S.D.C. strike total of 7", () => {
    expect(
      routeCombatHit({
        strikeTotal: 7,
        damage: { type: "sdc", value: 5 },
        protection: { ...mdcArmor, current: 0 },
        body: { sdc: 120, hitPoints: 20 },
        comaDeathFloor: -10,
      }),
    ).toEqual({
      routingVersion: 2,
      kind: "stopped",
      reason: "depletedMdcShell",
      nativeDamage: { type: "sdc", value: 5 },
      armor: {
        kind: "mdcArmor",
        itemId: mdcArmor.itemId,
        name: mdcArmor.name,
        before: 0,
        after: 0,
      },
      body: {
        before: { sdc: 120, hitPoints: 20 },
        after: { sdc: 120, hitPoints: 20 },
      },
    });
  });

  test.each([
    [8, { type: "sdc", value: 5 }, undefined, { sdc: 115, hitPoints: 20 }],
    [7, { type: "md", value: 1 }, { type: "sdc", value: 100 }, { sdc: 20, hitPoints: 20 }],
  ] as const)(
    "a depleted M.D.C. shell admits strike %i with %s damage",
    (strikeTotal, damage, convertedDamage, after) => {
      expect(
        routeCombatHit({
          strikeTotal,
          damage,
          protection: { ...mdcArmor, current: 0 },
          body: { sdc: 120, hitPoints: 20 },
          comaDeathFloor: -10,
        }),
      ).toEqual({
        routingVersion: 2,
        kind: "body",
        nativeDamage: damage,
        ...(convertedDamage === undefined ? {} : { convertedDamage }),
        armor: {
          kind: "mdcArmor",
          itemId: mdcArmor.itemId,
          name: mdcArmor.name,
          before: 0,
          after: 0,
        },
        body: {
          before: { sdc: 120, hitPoints: 20 },
          after,
        },
        lifeState: { before: "alive", after: "alive" },
      });
    },
  );

  test.each([
    [
      "S.D.C. before Hit Points",
      { type: "sdc", value: 5 },
      undefined,
      { sdc: 3, hitPoints: 5 },
      -5,
      "body",
      { sdc: 0, hitPoints: 3 },
      "alive",
    ],
    [
      "exact coma floor",
      { type: "md", value: 1 },
      { type: "sdc", value: 100 },
      { sdc: 90, hitPoints: 5 },
      -5,
      "body",
      { sdc: 0, hitPoints: -5 },
      "coma",
    ],
    [
      "fatal overflow",
      { type: "md", value: 1 },
      { type: "sdc", value: 100 },
      { sdc: 89, hitPoints: 5 },
      -5,
      "fatal",
      { sdc: 0, hitPoints: -5 },
      "dead",
    ],
  ] as const)(
    "routes no-armor damage through %s",
    (_case, damage, convertedDamage, before, comaDeathFloor, kind, after, lifeAfter) => {
      expect(
        routeCombatHit({
          strikeTotal: 20,
          damage,
          protection: { kind: "none" },
          body: before,
          comaDeathFloor,
        }),
      ).toEqual({
        routingVersion: 2,
        kind,
        nativeDamage: damage,
        ...(convertedDamage === undefined ? {} : { convertedDamage }),
        body: { before, after },
        lifeState: { before: "alive", after: lifeAfter },
      });
    },
  );
});

describe("completed pure combat exchanges", () => {
  const defender = combatSheet({ items: [], hthType: "basic" });
  const meleeAttack = requireSupported(
    deriveAttackProfile(combatSheet({ items: [{ itemId: "survival-knife" }] }), 0),
  );
  const meleeContext = {
    kind: "melee",
    defenderAware: true,
    parryMode: "standard",
  } as const;
  const meleeOptions = deriveDefenseOptions(defender, meleeAttack, meleeContext);
  const noneResponse = authorizeCombatResponse(meleeOptions, { kind: "none" });
  const parryResponse = authorizeCombatResponse(meleeOptions, { kind: "parry" });
  const dodgeResponse = authorizeCombatResponse(meleeOptions, { kind: "dodge" });
  const damageRoll: DamageRoll = { dice: [4], bonus: 1, total: 5 };
  const unopposedMelee = {
    attack: meleeAttack,
    context: meleeContext,
    strikeRoll: d20(12, meleeAttack.strikeBonus),
    response: noneResponse,
    protection: { kind: "none" },
    body: { sdc: 10, hitPoints: 20 },
    comaDeathFloor: -10,
  } satisfies Omit<ResolveCombatExchangeInput, "damageRoll">;

  test("a declaration miss returns before defense or damage", () => {
    expect(
      resolveCombatExchange({
        ...unopposedMelee,
        context: {
          ...meleeContext,
          strikeModifier: -2,
          strikeModifierReason: "poor footing",
        },
        strikeRoll: d20(3, 1),
      }),
    ).toEqual({
      outcome: "miss",
      reason: "belowMinimum",
      critical: false,
      damageMultiplier: 1,
    });
  });

  test.each([
    ["parry", parryResponse, "parried"],
    ["dodge", dodgeResponse, "dodged"],
  ] as const)("an equal-total %s favors the defender", (_kind, response, reason) => {
    const defenseRoll = d20(12, response.totalBonus);
    expect(
      resolveCombatExchange({
        ...unopposedMelee,
        response,
        defenseRoll,
      }),
    ).toEqual({
      outcome: "defended",
      reason,
      response,
      defenseRoll,
      critical: false,
      damageMultiplier: 1,
    });
  });

  test("a natural-20 defense beats a natural-20 strike through resolveStrike", () => {
    const strikeRoll = d20(20, meleeAttack.strikeBonus);
    const defenseRoll = d20(20, dodgeResponse.totalBonus);
    expect(
      resolveCombatExchange({
        ...unopposedMelee,
        strikeRoll,
        response: dodgeResponse,
        defenseRoll,
      }),
    ).toMatchObject({
      outcome: "defended",
      reason: "dodged",
      defenseRoll,
      critical: false,
      damageMultiplier: 1,
    });
  });

  test("none resolves an ordinary unopposed hit and routes its damage", () => {
    expect(resolveCombatExchange({ ...unopposedMelee, damageRoll })).toEqual({
      outcome: "hit",
      reason: "unopposed",
      response: noneResponse,
      critical: false,
      damageMultiplier: 1,
      damageRoll,
      totalDamage: 5,
      route: {
        routingVersion: 2,
        kind: "body",
        nativeDamage: { type: "sdc", value: 5 },
        body: {
          before: { sdc: 10, hitPoints: 20 },
          after: { sdc: 5, hitPoints: 20 },
        },
        lifeState: { before: "alive", after: "alive" },
      },
    });
  });

  test("melee damage applies its flat bonus before the critical multiplier", () => {
    expect(
      resolveCombatExchange({
        ...unopposedMelee,
        strikeRoll: d20(20, meleeAttack.strikeBonus),
        damageRoll,
      }),
    ).toEqual({
      outcome: "hit",
      reason: "unopposed",
      response: noneResponse,
      critical: true,
      damageMultiplier: 2,
      damageRoll,
      totalDamage: 10,
      route: {
        routingVersion: 2,
        kind: "body",
        nativeDamage: { type: "sdc", value: 10 },
        body: {
          before: { sdc: 10, hitPoints: 20 },
          after: { sdc: 0, hitPoints: 20 },
        },
        lifeState: { before: "alive", after: "alive" },
      },
    });
  });

  test("firearm damage carries no P.S. or Hand-to-Hand flat bonus", () => {
    const attack = requireSupported(
      deriveAttackProfile(combatSheet({ items: [{ itemId: "automatic-pistol" }] }), 0),
    );
    const context = {
      kind: "ranged",
      defenderAware: false,
      rangeBand: "normal",
    } as const;
    const response = authorizeCombatResponse(deriveDefenseOptions(defender, attack, context), {
      kind: "none",
    });
    const firearmDamage: DamageRoll = { dice: [1, 2, 3, 4], bonus: 0, total: 10 };

    expect(
      resolveCombatExchange({
        attack,
        context,
        strikeRoll: d20(10, attack.strikeBonus),
        response,
        damageRoll: firearmDamage,
        protection: { kind: "none" },
        body: { sdc: 20, hitPoints: 20 },
        comaDeathFloor: -10,
      }),
    ).toEqual({
      outcome: "hit",
      reason: "unopposed",
      response,
      critical: false,
      damageMultiplier: 1,
      damageRoll: firearmDamage,
      totalDamage: 10,
      route: {
        routingVersion: 2,
        kind: "body",
        nativeDamage: { type: "sdc", value: 10 },
        body: {
          before: { sdc: 20, hitPoints: 20 },
          after: { sdc: 10, hitPoints: 20 },
        },
        lifeState: { before: "alive", after: "alive" },
      },
    });
  });

  test("multiplies a critical M.D. roll before converting body damage", () => {
    const attack = requireSupported(
      deriveAttackProfile(combatSheet({ items: [{ itemId: "wilks-320-laser-pistol" }] }), 0),
    );
    const context = {
      kind: "ranged",
      defenderAware: false,
      rangeBand: "normal",
    } as const;
    const response = authorizeCombatResponse(deriveDefenseOptions(defender, attack, context), {
      kind: "none",
    });
    const mdDamage: DamageRoll = { dice: [4], bonus: 0, total: 4 };

    expect(
      resolveCombatExchange({
        attack,
        context,
        strikeRoll: d20(20, attack.strikeBonus),
        response,
        damageRoll: mdDamage,
        protection: { kind: "none" },
        body: { sdc: 1_000, hitPoints: 20 },
        comaDeathFloor: -10,
      }),
    ).toEqual({
      outcome: "hit",
      reason: "unopposed",
      response,
      critical: true,
      damageMultiplier: 2,
      damageRoll: mdDamage,
      totalDamage: 8,
      route: {
        routingVersion: 2,
        kind: "body",
        nativeDamage: { type: "md", value: 8 },
        convertedDamage: { type: "sdc", value: 800 },
        body: {
          before: { sdc: 1_000, hitPoints: 20 },
          after: { sdc: 200, hitPoints: 20 },
        },
        lifeState: { before: "alive", after: "alive" },
      },
    });
  });

  test("requires exactly the defense roll authorized by the response", () => {
    expect(() => resolveCombatExchange({ ...unopposedMelee, response: parryResponse })).toThrow(
      /parry requires a completed defense roll/i,
    );
    expect(() =>
      resolveCombatExchange({
        ...unopposedMelee,
        defenseRoll: d20(12, parryResponse.totalBonus),
      }),
    ).toThrow(/Take-the-hit cannot contain a defense roll/i);
    expect(() =>
      resolveCombatExchange({
        ...unopposedMelee,
        response: parryResponse,
        defenseRoll: d20(12, parryResponse.totalBonus + 1),
      }),
    ).toThrow(/Defense bonus must be 3/i);
  });

  test("requires the server-derived strike bonus", () => {
    expect(() =>
      resolveCombatExchange({
        ...unopposedMelee,
        strikeRoll: d20(12, meleeAttack.strikeBonus + 1),
        damageRoll,
      }),
    ).toThrow(/Strike bonus must be 3/i);
  });

  test("requires damage only for a hit", () => {
    expect(() => resolveCombatExchange(unopposedMelee)).toThrow(
      /hit requires a completed damage roll/i,
    );
    expect(() =>
      resolveCombatExchange({
        ...unopposedMelee,
        context: {
          ...meleeContext,
          strikeModifier: -2,
          strikeModifierReason: "poor footing",
        },
        strikeRoll: d20(3, 1),
        damageRoll,
      }),
    ).toThrow(/missed declaration cannot contain defense or damage rolls/i);
    expect(() =>
      resolveCombatExchange({
        ...unopposedMelee,
        response: parryResponse,
        defenseRoll: d20(12, parryResponse.totalBonus),
        damageRoll,
      }),
    ).toThrow(/defended attack cannot contain damage/i);
  });

  test("validates the completed damage bonus, dice, faces, and total", () => {
    expect(() =>
      resolveCombatExchange({
        ...unopposedMelee,
        damageRoll: { dice: [4], bonus: 0, total: 4 },
      }),
    ).toThrow(/Damage bonus must be 1/i);
    expect(() =>
      resolveCombatExchange({
        ...unopposedMelee,
        damageRoll: { dice: [2, 3], bonus: 1, total: 6 },
      }),
    ).toThrow(/Damage roll requires 1 dice/i);
    expect(() =>
      resolveCombatExchange({
        ...unopposedMelee,
        damageRoll: { dice: [7], bonus: 1, total: 8 },
      }),
    ).toThrow(/Damage dice must be integers from 1 to 6/i);
    expect(() =>
      resolveCombatExchange({
        ...unopposedMelee,
        damageRoll: { dice: [2.5], bonus: 1, total: 3.5 },
      }),
    ).toThrow(/Damage dice must be integers from 1 to 6/i);
    expect(() =>
      resolveCombatExchange({
        ...unopposedMelee,
        damageRoll: { dice: [4], bonus: 1, total: 99 },
      }),
    ).toThrow(/Damage total must be 5/i);
  });

  test("emits a v2 stopped route instead of unsupported M.D.C. protection", () => {
    expect(
      resolveCombatExchange({
        ...unopposedMelee,
        damageRoll,
        protection: {
          kind: "mdcArmor",
          itemId: "gladiator",
          name: "Gladiator Full Environmental Body Armor",
          max: 70,
          current: 70,
        },
      }),
    ).toEqual({
      outcome: "hit",
      reason: "unopposed",
      response: noneResponse,
      critical: false,
      damageMultiplier: 1,
      damageRoll,
      totalDamage: 5,
      route: {
        routingVersion: 2,
        kind: "stopped",
        reason: "intactMdcImpervious",
        nativeDamage: { type: "sdc", value: 5 },
        armor: {
          kind: "mdcArmor",
          itemId: "gladiator",
          name: "Gladiator Full Environmental Body Armor",
          before: 70,
          after: 70,
        },
        body: {
          before: { sdc: 10, hitPoints: 20 },
          after: { sdc: 10, hitPoints: 20 },
        },
      },
    });
  });
});
