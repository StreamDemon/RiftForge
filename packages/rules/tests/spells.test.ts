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

  test("spells are grouped by level (full RUE per-level counts)", () => {
    const counts = [10, 13, 17, 16, 18, 12, 14, 18, 8, 12, 6, 5, 2, 3, 2]; // L1..L15
    counts.forEach((count, i) => expect(spellsByLevel(i + 1)).toHaveLength(count));
    expect(spellBook.spells).toHaveLength(156);
  });

  test("the healing spells carry structured effects (#13)", () => {
    expect(getSpell("heal-wounds")?.healing).toEqual({
      hitPoints: "1D6",
      sdc: "3D6",
      target: "touch",
    });
    expect(getSpell("heal-self")?.healing?.target).toBe("self");
    expect(getSpell("light-healing")?.healing).toMatchObject({
      exclusive: true,
      othersOnly: true,
    });
    expect(getSpell("greater-healing")?.healing).toMatchObject({
      hitPoints: "6D6",
      sdc: "2D4*10",
      othersOnly: true,
    });
    expect(getSpell("restoration")?.healing).toEqual({ full: true, target: "touch" });
    // Cure Minor Disorders/Cure Illness are condition relief, not pool healing.
    expect(getSpell("cure-minor-disorders")?.healing).toBeUndefined();
    expect(getSpell("cure-illness")?.healing).toBeUndefined();
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
