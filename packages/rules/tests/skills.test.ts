import { describe, expect, test } from "vite-plus/test";
import {
  buildSkillIndexes,
  getSkillByName,
  iqSkillBonus,
  resolveSkill,
  skillCatalog,
} from "../src/index.ts";

describe("skill resolution (RUE p.299 formula)", () => {
  test("base + O.C.C. bonus at level 1 (no per-level growth yet)", () => {
    // Land Navigation base 36, +4% per level; LLW O.C.C. bonus +4
    expect(resolveSkill("land-navigation", { level: 1, occBonus: 4 })).toMatchObject({
      value: 40,
      capped: false,
    });
  });

  test("per-level growth applies from level 2", () => {
    // level 3 => +4% * 2 = +8; 36 + 4 + 8 = 48
    expect(resolveSkill("land-navigation", { level: 3, occBonus: 4 })?.value).toBe(48);
  });

  test("O.C.C. bonus + I.Q. bonus + per-level all stack", () => {
    // Wilderness Survival base 30, +5%/level, LLW bonus +10, I.Q. 18 -> +4
    // level 5: 30 + 10 + 4 + (5*4) = 64
    expect(
      resolveSkill("wilderness-survival", {
        level: 5,
        occBonus: 10,
        iqBonus: iqSkillBonus(18),
      })?.value,
    ).toBe(64);
  });

  test("percentages are capped at 98%", () => {
    // Computer Operation base 40, +5%/level; at level 15: 40 + 70 = 110 -> 98
    const r = resolveSkill("computer-operation", { level: 15 });
    expect(r?.value).toBe(98);
    expect(r?.capped).toBe(true);
  });

  test("Language: Native Tongue grows at 88% +1%/level", () => {
    expect(resolveSkill("language-native-tongue", { level: 1 })?.value).toBe(88);
    expect(resolveSkill("language-native-tongue", { level: 5 })?.value).toBe(92);
  });

  test("an O.C.C. override replaces the computed value (LLW Native Tongue at 98%)", () => {
    const r = resolveSkill("language-native-tongue", { level: 3, overrideValue: 98 });
    expect(r?.value).toBe(98);
  });

  test("two-value skills resolve both percentages", () => {
    // History: Pre-Rifts 32%/24%, +4%/level; level 3: +8 each
    const r = resolveSkill("history-pre-rifts", { level: 3 });
    expect(r?.value).toBe(40);
    expect(r?.value2).toBe(32);
  });

  test("unknown skill returns undefined", () => {
    expect(resolveSkill("does-not-exist", { level: 1 })).toBeUndefined();
  });

  test("I.Q. skill bonus comes from the Attribute Bonus Chart", () => {
    expect(iqSkillBonus(12)).toBe(0); // below threshold
    expect(iqSkillBonus(18)).toBe(4);
    expect(iqSkillBonus(30)).toBe(16);
  });
});

describe("skill index building fails fast on collisions", () => {
  test("the real catalog builds without id or name collisions", () => {
    expect(() => buildSkillIndexes(skillCatalog.skills)).not.toThrow();
  });

  test("a duplicate id throws", () => {
    expect(() =>
      buildSkillIndexes([
        { id: "a", name: "A", category: "X", baseSkill: 10, perLevel: 5, page: 1 },
        { id: "a", name: "B", category: "X", baseSkill: 10, perLevel: 5, page: 1 },
      ]),
    ).toThrow(/Duplicate skill id/);
  });

  test("a name/alias colliding with a different skill throws (no silent shadow)", () => {
    expect(() =>
      buildSkillIndexes([
        { id: "a", name: "Foo", category: "X", baseSkill: 10, perLevel: 5, page: 1 },
        {
          id: "b",
          name: "Bar",
          aliases: ["foo"],
          category: "X",
          baseSkill: 10,
          perLevel: 5,
          page: 1,
        },
      ]),
    ).toThrow(/collides/);
  });
});

describe("name-based resolution handles the book's naming variants", () => {
  test("O.C.C.-grant names resolve to catalog entries via aliases", () => {
    // LLW grants use the O.C.C.-entry wording, which differs from the skill-description name.
    expect(getSkillByName("Lore: Demon & Monster")?.id).toBe("lore-demons-monsters");
    expect(getSkillByName("Math: Basic")?.id).toBe("math-basic");
  });

  test("canonical names and casing/whitespace also resolve", () => {
    expect(getSkillByName("Lore: Demons & Monsters")?.id).toBe("lore-demons-monsters");
    expect(getSkillByName("  wilderness survival  ")?.id).toBe("wilderness-survival");
    expect(getSkillByName("no such skill")).toBeUndefined();
  });
});

describe("the Ley Line Walker's full O.C.C. skill list resolves (RUE p.116)", () => {
  test("every fixed O.C.C. skill at level 1", () => {
    // Native Tongue at 98% (O.C.C. override)
    expect(resolveSkill("language-native-tongue", { level: 1, overrideValue: 98 })?.value).toBe(98);
    // Language: Other (+20): 50 + 20 = 70
    expect(resolveSkill("language-other", { level: 1, occBonus: 20 })?.value).toBe(70);
    // Climbing (+5): climb 45 / rappel 35
    const climb = resolveSkill("climbing", { level: 1, occBonus: 5 });
    expect(climb?.value).toBe(45);
    expect(climb?.value2).toBe(35);
    // Math: Basic (+10): 45 + 10 = 55
    expect(resolveSkill("math-basic", { level: 1, occBonus: 10 })?.value).toBe(55);
    // Land Navigation (+4): 36 + 4 = 40
    expect(resolveSkill("land-navigation", { level: 1, occBonus: 4 })?.value).toBe(40);
    // Wilderness Survival (+10): 30 + 10 = 40
    expect(resolveSkill("wilderness-survival", { level: 1, occBonus: 10 })?.value).toBe(40);
    // Lore: Demon & Monster (+15): 25 + 15 = 40
    expect(resolveSkill("lore-demons-monsters", { level: 1, occBonus: 15 })?.value).toBe(40);
  });

  test("a level-3 LLW with I.Q. 18 (+4 to all skills)", () => {
    const iq = iqSkillBonus(18); // +4
    // Wilderness Survival: 30 + 10 + 4 + (5*2) = 54
    expect(
      resolveSkill("wilderness-survival", { level: 3, occBonus: 10, iqBonus: iq })?.value,
    ).toBe(54);
    // Math: Basic: 45 + 10 + 4 + (5*2) = 69
    expect(resolveSkill("math-basic", { level: 3, occBonus: 10, iqBonus: iq })?.value).toBe(69);
    // Land Navigation: 36 + 4 + 4 + (4*2) = 52
    expect(resolveSkill("land-navigation", { level: 3, occBonus: 4, iqBonus: iq })?.value).toBe(52);
  });
});
