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
  test("a recorded H.P. roll shows as `rolled`", () => {
    const sheet = deriveSheet({ ...leyLineWalker, rolled: { hitPoints: 18 } });
    expect(sheet.vitals.hitPoints.rolled).toBe(18);
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
    ).toThrow();
    expect(() =>
      deriveSheet({ ...leyLineWalker, spellIds: ["globe-of-daylight", "globe-of-daylight"] }),
    ).toThrow();
  });
});
