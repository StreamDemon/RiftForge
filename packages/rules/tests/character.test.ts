import { describe, expect, test } from "vite-plus/test";
import { deriveSheet, type CharacterInput } from "../src/index.ts";

const leyLineWalker: CharacterInput = {
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
};

describe("deriveSheet — a level-1 Ley Line Walker", () => {
  const sheet = deriveSheet(leyLineWalker);

  test("identity", () => {
    expect(sheet.occ).toMatchObject({
      id: "ley-line-walker",
      name: "Ley Line Walker",
      category: "Practitioner of Magic",
    });
    expect(sheet.level).toBe(1);
  });

  test("combat profile from P.P. 20 / P.S. 16, Basic H2H", () => {
    expect(sheet.combat).toEqual({
      attacksPerMelee: 4,
      handToHandBonuses: { pullPunch: 2, rollWithImpact: 2 },
      handToHandType: "basic",
      hasHandToHandTraining: true,
      hasAutoDodge: false,
      strike: 3,
      parry: 3,
      dodge: 3,
      rangedDodge: 3,
      rangedAutoDodge: 0,
      damageBonus: 1,
      initiative: 0,
      autoDodge: 0,
      strikeThrown: 3,
      strikeGuns: 0,
      saveVsHorrorFactor: 0,
      criticalStrikeOn: 20,
    });
  });

  test("vitals from P.E. 14", () => {
    expect(sheet.vitals.hitPoints).toEqual({ min: 15, max: 20, average: 17.5 });
    expect(sheet.vitals.sdc).toEqual({ min: 14, max: 24, average: 19 });
    expect(sheet.vitals.comaDeathFloor).toBe(-14);
  });

  test("P.P.E. = 3D6*10+20 + P.E., and spell strength 12 at level 1", () => {
    expect(sheet.ppe).toEqual({ min: 64, max: 214, average: 139 });
    expect(sheet.spellStrength).toBe(12);
  });

  test("saves combine attribute + O.C.C. bonuses", () => {
    expect(sheet.saves.magic).toEqual({
      targetRange: { min: 12, max: 16 },
      bonus: 0, // P.E. 14 gives no attribute bonus; magic O.C.C. bonus starts at level 3
    });
    expect(sheet.saves.psionics).toEqual({ target: 15, bonus: 1 }); // M.E. 16 -> +1
    expect(sheet.saves.horrorFactor.bonus).toBe(4); // LLW flat +4
    expect(sheet.saves.curses).toEqual({ target: 15, bonus: 3 });
    expect(sheet.saves.possession.bonus).toBe(2);
  });

  test("Horror Factor saves combine Hand-to-Hand and O.C.C. bonuses", () => {
    const commando = deriveSheet({ ...leyLineWalker, hthType: "commando", level: 15 });

    expect(commando.combat.saveVsHorrorFactor).toBe(5);
    expect(commando.saves.horrorFactor.bonus).toBe(9); // Commando +5, LLW +4
  });

  test("skills resolve with O.C.C. + I.Q.(18 -> +4) bonuses", () => {
    const bySkill = Object.fromEntries(sheet.skills.map((s) => [s.id, s.value]));
    expect(bySkill["wilderness-survival"]).toBe(44); // 30 + 10 + 4
    expect(bySkill["math-basic"]).toBe(59); // 45 + 10 + 4
    expect(bySkill["land-navigation"]).toBe(44); // 36 + 4 + 4
  });

  test("known spells resolve", () => {
    expect(sheet.spells.count).toBe(3);
    expect(sheet.spells.known.map((s) => s.id)).toContain("armor-of-ithan");
  });
});

describe("deriveSheet — edge cases", () => {
  test("derives alive from positive H.P. and coma from zero through the floor", () => {
    const rolled = { hitPoints: 18, sdc: 20 };

    expect(
      deriveSheet({
        ...leyLineWalker,
        rolled,
        current: { hitPoints: 1, sdc: 0 },
      }).vitals.lifeState,
    ).toBe("alive");

    for (const hitPoints of [0, -7, -14]) {
      expect(
        deriveSheet({
          ...leyLineWalker,
          rolled,
          current: { hitPoints, sdc: 0 },
        }).vitals.lifeState,
      ).toBe("coma");
    }
  });

  test("accepts a dead marker only at the terminal rolled-vitals state", () => {
    const sheet = deriveSheet({
      ...leyLineWalker,
      rolled: { hitPoints: 18, sdc: 20 },
      current: { hitPoints: -14, sdc: 0, lifeState: "dead" },
    });

    expect(sheet.vitals.lifeState).toBe("dead");
  });

  test("rejects unrolled or contradictory dead markers", () => {
    expect(() => deriveSheet({ ...leyLineWalker, current: { lifeState: "dead" } })).toThrow(
      /rolled vitals/i,
    );
    expect(() =>
      deriveSheet({
        ...leyLineWalker,
        rolled: { hitPoints: 18, sdc: 20 },
        current: { hitPoints: -14, sdc: 1, lifeState: "dead" },
      }),
    ).toThrow(/S\.D\.C\./);
    expect(() =>
      deriveSheet({
        ...leyLineWalker,
        rolled: { hitPoints: 18, sdc: 20 },
        current: { hitPoints: 0, sdc: 0, lifeState: "dead" },
      }),
    ).toThrow(/coma\/death floor/i);
  });

  test("does not treat a root lifeState property as the persisted marker", () => {
    const rootMarker = {
      ...leyLineWalker,
      rolled: { hitPoints: 18, sdc: 20 },
      current: { hitPoints: -14, sdc: 0 },
      lifeState: "dead",
    };

    expect(deriveSheet(rootMarker).vitals.lifeState).toBe("coma");
  });

  test("legacy marker-absent documents remain valid", () => {
    const sheet = deriveSheet({
      ...leyLineWalker,
      rolled: { hitPoints: 18, sdc: 20 },
      current: { hitPoints: -14, sdc: 0 },
    });

    expect(sheet.vitals.lifeState).toBe("coma");
  });

  test("a recorded H.P. roll shows as `rolled`, with `current` defaulting to it", () => {
    const sheet = deriveSheet({ ...leyLineWalker, rolled: { hitPoints: 18 } });
    expect(sheet.vitals.hitPoints.rolled).toBe(18);
    expect(sheet.vitals.hitPoints.current).toBe(18);
    // Unrolled stats carry neither.
    expect(sheet.vitals.sdc.rolled).toBeUndefined();
    expect(sheet.vitals.sdc.current).toBeUndefined();
  });

  test("live `current` values ride the sheet next to their maximums", () => {
    const sheet = deriveSheet({
      ...leyLineWalker,
      rolled: { hitPoints: 18, sdc: 20, ppe: 84 },
      current: { hitPoints: -3, sdc: 0, ppe: 79 },
    });
    expect(sheet.vitals.hitPoints).toMatchObject({ rolled: 18, current: -3 }); // coma band
    expect(sheet.vitals.sdc).toMatchObject({ rolled: 20, current: 0 });
    expect(sheet.ppe).toMatchObject({ rolled: 84, current: 79 });
  });

  test("illegal `current` states are rejected, not clamped", () => {
    const rolled = { hitPoints: 18, sdc: 20, ppe: 84 };
    // No maximum to measure against.
    expect(() => deriveSheet({ ...leyLineWalker, current: { ppe: 10 } })).toThrow(
      /current\.ppe requires rolled\.ppe/,
    );
    // Above the rolled maximum.
    expect(() => deriveSheet({ ...leyLineWalker, rolled, current: { ppe: 85 } })).toThrow(
      /exceeds the rolled maximum/,
    );
    // H.P. below the -(P.E.) coma/death floor (P.E. 14 -> -14).
    expect(() => deriveSheet({ ...leyLineWalker, rolled, current: { hitPoints: -15 } })).toThrow(
      /below the legal minimum/,
    );
    // At the floor exactly is still legal (coma, not gone).
    expect(
      deriveSheet({ ...leyLineWalker, rolled, current: { hitPoints: -14 } }).vitals.hitPoints
        .current,
    ).toBe(-14);
  });

  test("an unknown O.C.C. throws", () => {
    expect(() => deriveSheet({ ...leyLineWalker, occId: "nope" })).toThrow(/Unknown O\.C\.C\./);
  });

  test("P.P.E. grows with level (+3D6 per level from level 2)", () => {
    // level 3: base {64, 214, 139} + 2 * 3D6 {3, 18, 10.5}
    expect(deriveSheet({ ...leyLineWalker, level: 3 }).ppe).toEqual({
      min: 70,
      max: 250,
      average: 160,
    });
  });

  test("save-vs-psionics target follows the character's psychic class", () => {
    expect(deriveSheet(leyLineWalker).saves.psionics.target).toBe(15); // ordinary (default)
    expect(
      deriveSheet({ ...leyLineWalker, psychicClass: "masterPsychic" }).saves.psionics.target,
    ).toBe(10);
  });

  test("duplicate skills or spells are rejected", () => {
    expect(() =>
      deriveSheet({
        ...leyLineWalker,
        skills: [
          { skillId: "math-basic", occBonus: 10 },
          { skillId: "math-basic", occBonus: 10 },
        ],
      }),
    ).toThrow(/cannot be taken twice/);
    expect(() =>
      deriveSheet({ ...leyLineWalker, spellIds: ["globe-of-daylight", "globe-of-daylight"] }),
    ).toThrow();
  });

  test("a repeatable skill can be taken twice (LLW: Language: Other x2, RUE p.115)", () => {
    const sheet = deriveSheet({
      ...leyLineWalker,
      skills: [
        { skillId: "language-other", occBonus: 20, label: "Dragonese" },
        { skillId: "language-other", occBonus: 20, label: "Spanish" },
      ],
    });
    expect(sheet.skills.map((s) => ({ id: s.id, value: s.value, label: s.label }))).toEqual([
      { id: "language-other", value: 74, label: "Dragonese" }, // 50 + 20 + I.Q. 4
      { id: "language-other", value: 74, label: "Spanish" },
    ]);
  });

  test("unknown skill and spell ids throw instead of silently dropping", () => {
    expect(() =>
      deriveSheet({ ...leyLineWalker, skills: [{ skillId: "underwater-basket-weaving" }] }),
    ).toThrow(/Unknown skill "underwater-basket-weaving"/);
    expect(() => deriveSheet({ ...leyLineWalker, spellIds: ["fireball-xxl"] })).toThrow(
      /Unknown spell "fireball-xxl"/,
    );
  });

  test("equipment resolves against the catalog; unknown item ids throw", () => {
    const sheet = deriveSheet({
      ...leyLineWalker,
      items: [{ itemId: "wilks-320-laser-pistol" }, { itemId: "canteen" }],
    });
    expect(sheet.equipment.map((e) => e.item.id)).toEqual(["wilks-320-laser-pistol", "canteen"]);
    expect(sheet.armor).toBeUndefined();
    expect(() => deriveSheet({ ...leyLineWalker, items: [{ itemId: "bfg-9000" }] })).toThrow(
      /Unknown item "bfg-9000"/,
    );
  });

  test("a worn fixed suit surfaces its pool at maximum; current.armor depletes it", () => {
    const items = [{ itemId: "gladiator", worn: true }]; // 70 M.D.C. main body, p.267
    expect(deriveSheet({ ...leyLineWalker, items }).armor).toMatchObject({
      max: 70,
      current: 70,
    });
    const damaged = deriveSheet({ ...leyLineWalker, items, current: { armor: 12 } });
    expect(damaged.armor).toMatchObject({ max: 70, current: 12 });
  });

  test("a dice-capacity suit (LLW concealed, 2D6+32, p.113) needs its per-suit roll", () => {
    const worn = { itemId: "llw-concealed-light", worn: true };
    // Unrolled: the suit is worn but has no pool yet.
    expect(deriveSheet({ ...leyLineWalker, items: [worn] }).armor).toMatchObject({
      max: undefined,
    });
    // Rolled: the roll is the maximum.
    expect(
      deriveSheet({ ...leyLineWalker, items: [{ ...worn, rolledMdc: 40 }] }).armor,
    ).toMatchObject({ max: 40, current: 40 });
    // A roll outside the printed 2D6+32 range (34-44) is a bug upstream.
    expect(() => deriveSheet({ ...leyLineWalker, items: [{ ...worn, rolledMdc: 45 }] })).toThrow(
      /outside the printed 2D6\+32 range/,
    );
    // rolledMdc on a fixed suit or a non-armor item is meaningless.
    expect(() =>
      deriveSheet({ ...leyLineWalker, items: [{ itemId: "gladiator", rolledMdc: 40 }] }),
    ).toThrow(/only armor with dice-capacity/);
    expect(() =>
      deriveSheet({ ...leyLineWalker, items: [{ itemId: "canteen", rolledMdc: 40 }] }),
    ).toThrow(/only armor with dice-capacity/);
  });

  test("worn is armor-only and exclusive; illegal current.armor states are rejected", () => {
    expect(() =>
      deriveSheet({ ...leyLineWalker, items: [{ itemId: "canteen", worn: true }] }),
    ).toThrow(/Only armor can be worn/);
    expect(() =>
      deriveSheet({
        ...leyLineWalker,
        items: [
          { itemId: "gladiator", worn: true },
          { itemId: "crusader", worn: true },
        ],
      }),
    ).toThrow(/At most one armor/);
    // No worn armor -> no pool to measure against.
    expect(() =>
      deriveSheet({
        ...leyLineWalker,
        items: [{ itemId: "gladiator" }],
        current: { armor: 10 },
      }),
    ).toThrow(/requires a worn armor/);
    // Worn but unrolled dice suit -> no maximum yet.
    expect(() =>
      deriveSheet({
        ...leyLineWalker,
        items: [{ itemId: "llw-concealed-light", worn: true }],
        current: { armor: 10 },
      }),
    ).toThrow(/requires the suit's rolled M\.D\.C\./);
    // Above the suit's maximum.
    expect(() =>
      deriveSheet({
        ...leyLineWalker,
        items: [{ itemId: "gladiator", worn: true }],
        current: { armor: 71 },
      }),
    ).toThrow(/exceeds the suit's maximum/);
  });

  test("an O.C.C. flat-value grant overrides the computed percentage (Native Tongue 98%)", () => {
    const sheet = deriveSheet({
      ...leyLineWalker,
      skills: [{ skillId: "language-native-tongue", overrideValue: 98 }],
    });
    expect(sheet.skills[0]).toMatchObject({
      id: "language-native-tongue",
      value: 98, // flat 98%, not base 88 + I.Q. bonus
      capped: false,
    });
  });
});
