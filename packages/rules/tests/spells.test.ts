import { describe, expect, test } from "vite-plus/test";
import {
  canCast,
  getSpell,
  getSpellByName,
  initialSpellChoices,
  leyLineWalker,
  occSpellStrength,
  ritualSaveTarget,
  saveTargetVsSpell,
  spellBook,
  spellStrength,
  spellStrengthFromBonus,
  spellsByLevel,
} from "../src/index.ts";

describe("spell book (RUE Magic Spells, levels 1-4)", () => {
  test("validates and carries the RUE spell-strength constants (p.187)", () => {
    expect(spellBook.spellStrengthBase).toBe(12);
    expect(ritualSaveTarget).toBe(16);
  });

  test("lookup by id and by name", () => {
    expect(getSpell("armor-of-ithan")).toMatchObject({ level: 3, ppe: 10 });
    expect(getSpellByName("Energy Bolt")?.id).toBe("energy-bolt");
    expect(getSpellByName("  globe of daylight ")?.id).toBe("globe-of-daylight");
    expect(getSpell("nope")).toBeUndefined();
  });

  test("spells are grouped by level", () => {
    expect(spellsByLevel(1)).toHaveLength(10);
    expect(spellsByLevel(2)).toHaveLength(5);
    expect(spellsByLevel(3)).toHaveLength(9);
    expect(spellsByLevel(4)).toHaveLength(5);
  });

  test("castability depends on available P.P.E.", () => {
    const ithan = getSpell("armor-of-ithan")!;
    expect(canCast(ithan, 137)).toBe(true); // an average level-1 LLW has ~137 P.P.E.
    expect(canCast(ithan, 9)).toBe(false); // needs 10
  });
});

describe("spell strength (RUE p.187)", () => {
  test("base 12, +1 per increment level reached", () => {
    const levels = [3, 7, 10, 13]; // Ley Line Walker's spell-strength levels
    expect(spellStrength(1, levels)).toBe(12);
    expect(spellStrength(3, levels)).toBe(13);
    expect(spellStrength(7, levels)).toBe(14);
    expect(spellStrength(10, levels)).toBe(15);
    expect(spellStrength(13, levels)).toBe(16);
  });

  test("derived from the O.C.C.'s own bonuses", () => {
    expect(occSpellStrength(leyLineWalker, 1)).toBe(12);
    expect(occSpellStrength(leyLineWalker, 7)).toBe(14);
    expect(occSpellStrength(leyLineWalker, 13)).toBe(16);
  });

  test("a flat spell-strength bonus (no atLevels) applies once at every level", () => {
    expect(spellStrengthFromBonus({ value: 2 }, 1)).toBe(14);
    expect(spellStrengthFromBonus({ value: 2 }, 10)).toBe(14);
    expect(spellStrengthFromBonus({ value: 2, atLevels: [] }, 5)).toBe(14);
  });

  test("a level-gated bonus increments per level reached; no bonus = base", () => {
    const gated = { value: 1, atLevels: [3, 7, 10, 13] };
    expect(spellStrengthFromBonus(gated, 1)).toBe(12);
    expect(spellStrengthFromBonus(gated, 7)).toBe(14);
    expect(spellStrengthFromBonus(undefined, 5)).toBe(12);
  });

  test("save target vs a spell is the caster's spell strength", () => {
    expect(saveTargetVsSpell(occSpellStrength(leyLineWalker, 3))).toBe(13);
  });
});

describe("Ley Line Walker initial spell selection (RUE p.116)", () => {
  test("3 spells from each of levels 1-4, with real options available", () => {
    const choices = initialSpellChoices(leyLineWalker);
    expect(choices.map((c) => c.level)).toEqual([1, 2, 3, 4]);
    for (const c of choices) {
      expect(c.choose).toBe(3);
      expect(c.options.length).toBeGreaterThanOrEqual(c.choose);
    }
  });
});
