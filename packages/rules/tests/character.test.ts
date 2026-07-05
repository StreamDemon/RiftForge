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
      strike: 3, // P.P. 20 -> +3
      parry: 3,
      dodge: 3,
      damageBonus: 1, // P.S. 16 -> +1
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
