import { describe, expect, test } from "vite-plus/test";
import {
  ATTRIBUTE_CODES,
  attributeBonusChart,
  bonusesForAttribute,
  deriveAttributeBonuses,
  effectBonus,
  isBeyondChart,
} from "../src/index.ts";

describe("Attribute Bonus Chart (RUE p.281)", () => {
  test("content validates and covers all eight attributes in book order", () => {
    expect(attributeBonusChart.source.page).toBe(281);
    expect(attributeBonusChart.attributes.map((a) => a.code)).toEqual([...ATTRIBUTE_CODES]);
  });

  test("no bonus below the threshold of 16", () => {
    expect(bonusesForAttribute("PP", 15)).toEqual({});
    expect(bonusesForAttribute("PS", 10)).toEqual({});
    expect(bonusesForAttribute("PE", 3)).toEqual({});
  });

  test("P.P. feeds strike, parry, and dodge equally", () => {
    // p.281: PP 20 -> +3 strike / +3 parry / +3 dodge
    expect(bonusesForAttribute("PP", 20)).toEqual({
      strike: 3,
      parry: 3,
      dodge: 3,
    });
    // PP 30 -> +8 to each
    expect(bonusesForAttribute("PP", 30)).toEqual({
      strike: 8,
      parry: 8,
      dodge: 8,
    });
  });

  test("P.S. hand-to-hand damage bonus", () => {
    expect(bonusesForAttribute("PS", 16)).toEqual({ hthDamage: 1 });
    expect(bonusesForAttribute("PS", 24)).toEqual({ hthDamage: 9 });
    expect(bonusesForAttribute("PS", 30)).toEqual({ hthDamage: 15 });
  });

  test("M.E. splits into two independent saves", () => {
    expect(bonusesForAttribute("ME", 30)).toEqual({
      saveVsPsionic: 8,
      saveVsInsanity: 13,
    });
  });

  test("P.E. mixes a percentage save with a flat magic/poison save", () => {
    expect(bonusesForAttribute("PE", 16)).toEqual({
      saveVsComaDeath: 4,
      saveVsMagic: 1,
      saveVsPoison: 1,
    });
    expect(bonusesForAttribute("PE", 30)).toEqual({
      saveVsComaDeath: 30,
      saveVsMagic: 8,
      saveVsPoison: 8,
    });
  });

  test("percentage-based social/skill attributes", () => {
    expect(bonusesForAttribute("IQ", 18)).toEqual({ allSkills: 4 });
    expect(bonusesForAttribute("MA", 30)).toEqual({ trustIntimidate: 97 });
    expect(bonusesForAttribute("PB", 21)).toEqual({ charm: 55, impress: 55 });
  });

  test("Speed contributes no chart bonuses", () => {
    expect(bonusesForAttribute("Spd", 30)).toEqual({});
  });

  test("values beyond the chart clamp to the top row and are flagged", () => {
    expect(isBeyondChart(30)).toBe(false);
    expect(isBeyondChart(31)).toBe(true);
    const ps = attributeBonusChart.attributes.find((a) => a.code === "PS")!;
    expect(effectBonus(ps.effects[0]!, 40)).toBe(15); // clamps to the value-30 row
  });

  test("deriveAttributeBonuses aggregates across a character's attributes", () => {
    const d = deriveAttributeBonuses({ PP: 20, PS: 20, PE: 20, IQ: 12 });
    expect(d.strike).toBe(3);
    expect(d.parry).toBe(3);
    expect(d.dodge).toBe(3);
    expect(d.hthDamage).toBe(5); // PS 20 -> +5
    expect(d.saveVsComaDeath).toBe(10); // PE 20 -> 10%
    expect(d.allSkills).toBeUndefined(); // IQ 12 is below threshold
  });
});
