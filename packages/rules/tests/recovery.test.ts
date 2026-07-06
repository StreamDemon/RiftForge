import { describe, expect, test } from "vite-plus/test";
import {
  leyLineDraw,
  leyLineDrawRate,
  leyLineWalker,
  ppeRecoveryRate,
  recovery,
  restRecovery,
  rollSpellHealing,
  spellHealingSchema,
  spellSchema,
  treatmentRecovery,
  type Spell,
} from "../src/index.ts";

describe("recovery rates content (RUE pp.186/354)", () => {
  test("carries the printed P.P.E. rates, page-stamped", () => {
    expect(recovery.ppe.source.page).toBe(186);
    expect(recovery.ppe.perHourRest).toBe(5);
    expect(recovery.ppe.perHourMeditation).toBe(10);
    expect(recovery.ppe.leyLineDraw).toMatchObject({
      perMeleeOnLine: 10,
      perMeleeAtNexus: 20,
    });
  });

  test("carries the printed treatment rates, page-stamped", () => {
    expect(recovery.treatment.source.page).toBe(354);
    expect(recovery.treatment.nonProfessional).toEqual({ hitPointsPerDay: 2, sdcPerDay: 4 });
    expect(recovery.treatment.professional).toEqual({
      hitPointsPerDayFirstTwoDays: 2,
      hitPointsPerDayAfter: 4,
      sdcPerDay: 6,
    });
  });
});

describe("P.P.E. recovery — rest and meditation", () => {
  test("book-default rates apply when the O.C.C. has no override", () => {
    expect(ppeRecoveryRate("rest")).toBe(5);
    expect(ppeRecoveryRate("meditation")).toBe(10);
    expect(restRecovery(6, "rest")).toBe(30);
    expect(restRecovery(3, "meditation")).toBe(30);
  });

  test("the Ley Line Walker's printed rates override the defaults (7/15)", () => {
    expect(ppeRecoveryRate("rest", leyLineWalker)).toBe(7);
    expect(ppeRecoveryRate("meditation", leyLineWalker)).toBe(15);
    expect(restRecovery(4, "meditation", leyLineWalker)).toBe(60);
  });

  test("hours must be a whole, non-negative count (GM-adjudicated input)", () => {
    expect(restRecovery(0, "rest")).toBe(0);
    expect(() => restRecovery(-1, "rest")).toThrow(/non-negative integer/);
    expect(() => restRecovery(1.5, "meditation")).toThrow(/non-negative integer/);
  });
});

describe("P.P.E. recovery — ley line draw", () => {
  test("default practitioner draw: 10 per melee on a line, 20 at a nexus", () => {
    expect(leyLineDrawRate(false)).toBe(10);
    expect(leyLineDrawRate(true)).toBe(20);
    expect(leyLineDraw(3, false)).toBe(30);
  });

  test("the Ley Line Walker draws double (20/40)", () => {
    expect(leyLineDrawRate(false, leyLineWalker)).toBe(20);
    expect(leyLineDrawRate(true, leyLineWalker)).toBe(40);
    expect(leyLineDraw(2, true, leyLineWalker)).toBe(80);
  });

  test("melees must be a whole, non-negative count", () => {
    expect(() => leyLineDraw(-2, false)).toThrow(/non-negative integer/);
    expect(() => leyLineDraw(0.5, true)).toThrow(/non-negative integer/);
  });
});

describe("H.P./S.D.C. recovery — treatment days", () => {
  test("non-professional care is flat: 2 H.P. and 4 S.D.C. per day", () => {
    expect(treatmentRecovery(1, false)).toEqual({ hitPoints: 2, sdc: 4 });
    expect(treatmentRecovery(5, false)).toEqual({ hitPoints: 10, sdc: 20 });
    // The non-professional rate never ramps, no matter how deep into the course.
    expect(treatmentRecovery(3, false, 10)).toEqual({ hitPoints: 6, sdc: 12 });
  });

  test("professional care ramps: 2 H.P./day for two days, then 4; S.D.C. at 6", () => {
    expect(treatmentRecovery(1, true)).toEqual({ hitPoints: 2, sdc: 6 });
    expect(treatmentRecovery(2, true)).toEqual({ hitPoints: 4, sdc: 12 });
    expect(treatmentRecovery(3, true)).toEqual({ hitPoints: 8, sdc: 18 }); // 2+2+4
    expect(treatmentRecovery(5, true)).toEqual({ hitPoints: 16, sdc: 30 }); // 2+2+4+4+4
  });

  test("daysAlreadyTreated places the days inside the ramp", () => {
    // Day 3 of an ongoing professional course heals at the ramped rate.
    expect(treatmentRecovery(1, true, 2)).toEqual({ hitPoints: 4, sdc: 6 });
    // Starting mid-ramp: day 2 heals 2, day 3 heals 4.
    expect(treatmentRecovery(2, true, 1)).toEqual({ hitPoints: 6, sdc: 12 });
  });

  test("days and daysAlreadyTreated must be whole, non-negative counts", () => {
    expect(treatmentRecovery(0, true)).toEqual({ hitPoints: 0, sdc: 0 });
    expect(() => treatmentRecovery(-1, false)).toThrow(/non-negative integer/);
    expect(() => treatmentRecovery(2, true, -1)).toThrow(/non-negative integer/);
    expect(() => treatmentRecovery(1.5, true)).toThrow(/non-negative integer/);
  });
});

describe("spell healing — schema and rolls", () => {
  /** A synthetic healing spell (the L1-4 catalog has none; real ones land with #13). */
  const healWounds: Spell = spellSchema.parse({
    id: "test-heal-wounds",
    name: "Test Heal Wounds",
    level: 6,
    ppe: 10,
    range: "Touch",
    duration: "Instant",
    savingThrow: "none",
    healing: { hitPoints: "1D6", sdc: "2D6", target: "touch" },
    page: 1,
  });

  test("healing must restore at least one pool, with valid dice", () => {
    expect(() => spellHealingSchema.parse({ target: "self" })).toThrow();
    expect(() => spellHealingSchema.parse({ hitPoints: "banana", target: "self" })).toThrow();
    expect(spellHealingSchema.parse({ sdc: "3D6", target: "ranged" })).toMatchObject({
      sdc: "3D6",
    });
  });

  test("rollSpellHealing rolls each declared pool", () => {
    const minRng = () => 0; // every die rolls 1
    expect(rollSpellHealing(healWounds, minRng)).toEqual({ hitPoints: 1, sdc: 2 });
    const maxRng = () => 0.999999; // every die rolls its max
    expect(rollSpellHealing(healWounds, maxRng)).toEqual({ hitPoints: 6, sdc: 12 });
  });

  test("rolls only the pools the spell declares", () => {
    const hpOnly = spellSchema.parse({
      ...healWounds,
      id: "test-hp-only",
      name: "Test HP Only",
      healing: { hitPoints: "2D4", target: "self" },
    });
    expect(rollSpellHealing(hpOnly, () => 0)).toEqual({ hitPoints: 2 });
  });

  test("non-healing spells roll nothing", () => {
    const bolt = spellSchema.parse({
      ...healWounds,
      id: "test-bolt",
      name: "Test Bolt",
      healing: undefined,
    });
    expect(rollSpellHealing(bolt)).toBeUndefined();
  });

  test("exclusive healing rolls only the chosen pool, and demands a choice", () => {
    const either = spellSchema.parse({
      ...healWounds,
      id: "test-either",
      name: "Test Either",
      healing: { hitPoints: "1D4", sdc: "1D6", target: "touch", exclusive: true },
    });
    expect(() => rollSpellHealing(either, () => 0)).toThrow(/choose hitPoints or sdc/);
    expect(rollSpellHealing(either, () => 0, "hitPoints")).toEqual({ hitPoints: 1 });
    expect(rollSpellHealing(either, () => 0, "sdc")).toEqual({ sdc: 1 });
  });

  test("full restorations roll no dice", () => {
    const resto = spellSchema.parse({
      ...healWounds,
      id: "test-resto",
      name: "Test Resto",
      healing: { full: true, target: "touch" },
    });
    expect(rollSpellHealing(resto)).toEqual({ full: true });
    // The schema refuses contradictory shapes.
    expect(() =>
      spellSchema.parse({
        ...healWounds,
        id: "test-bad",
        name: "Test Bad",
        healing: { full: true, hitPoints: "1D6", target: "touch" },
      }),
    ).toThrow();
  });
});
