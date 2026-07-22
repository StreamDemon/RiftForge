import { describe, expect, test } from "vite-plus/test";
import {
  basePpeRange,
  getOcc,
  leyLineWalker,
  occSchema,
  rollBasePpe,
  validateOccSpeciesReferences,
} from "../src/index.ts";

const gruntEligibilityFixture = occSchema.parse({
  source: { book: "Rifts Ultimate Edition", page: 233 },
  id: "coalition-grunt-eligibility-fixture",
  name: "Coalition Grunt eligibility fixture",
  category: "Men at Arms",
  alignment: "Any",
  attributeRequirements: [],
  speciesEligibility: { kind: "oneOf", speciesIds: ["human", "psi-stalker"] },
});

describe("Ley Line Walker O.C.C. (RUE pp.113-116)", () => {
  test("Ley Line Walker accepts any playable species through structured content", () => {
    expect(leyLineWalker.speciesEligibility).toEqual({ kind: "any" });
    expect("racialRequirement" in leyLineWalker).toBe(false);
  });

  test("the p.233 Grunt fixture references Human and Psi-Stalker", () => {
    expect(gruntEligibilityFixture.speciesEligibility).toEqual({
      kind: "oneOf",
      speciesIds: ["human", "psi-stalker"],
    });
    expect(() => validateOccSpeciesReferences(gruntEligibilityFixture)).not.toThrow();
  });

  test("rejects legacy prose, empty/duplicate lists, and unknown species references", () => {
    const base = {
      source: { book: "Rifts Ultimate Edition", page: 233 },
      id: "invalid",
      name: "Invalid",
      category: "Test",
      alignment: "Any",
      attributeRequirements: [],
      speciesEligibility: { kind: "any" },
    };
    expect(() => occSchema.parse({ ...base, racialRequirement: "Humans only" })).toThrow();
    expect(() =>
      occSchema.parse({ ...base, speciesEligibility: { kind: "oneOf", speciesIds: [] } }),
    ).toThrow();
    expect(() =>
      occSchema.parse({
        ...base,
        speciesEligibility: { kind: "oneOf", speciesIds: ["human", "human"] },
      }),
    ).toThrow();
    const unknown = occSchema.parse({
      ...base,
      speciesEligibility: { kind: "oneOf", speciesIds: ["human", "kryptonian"] },
    });
    expect(() => validateOccSpeciesReferences(unknown)).toThrow(
      'O.C.C. "invalid" references unknown species "kryptonian".',
    );
  });

  test("validates and is registered", () => {
    expect(leyLineWalker.id).toBe("ley-line-walker");
    expect(leyLineWalker.name).toBe("Ley Line Walker");
    expect(leyLineWalker.category).toBe("Practitioner of Magic");
    expect(getOcc("ley-line-walker")).toBe(leyLineWalker);
    expect(getOcc("nope")).toBeUndefined();
  });

  test("attribute requirements: I.Q. 10, P.E. 12", () => {
    expect(leyLineWalker.attributeRequirements).toEqual([
      { code: "IQ", min: 10 },
      { code: "PE", min: 12 },
    ]);
  });

  test("initial spell knowledge: 3 spells from each of levels 1-4", () => {
    expect(leyLineWalker.spellKnowledge?.initial).toMatchObject({
      fromEachLevel: 3,
      spellLevels: [1, 2, 3, 4],
      total: 12,
    });
    expect(leyLineWalker.spellKnowledge?.startsWithRiftLeyLineMagic).toBe(false);
  });

  test("base P.P.E. = 3D6*10+20 + P.E. attribute", () => {
    // P.E. 12: min (50+12), average (125+12), max (200+12)
    expect(basePpeRange(leyLineWalker, 12)).toEqual({
      min: 62,
      average: 137,
      max: 212,
    });
  });

  test("rolled base P.P.E. respects the range", () => {
    expect(rollBasePpe(leyLineWalker, 12, () => 0)).toBe(62);
    expect(rollBasePpe(leyLineWalker, 12, () => 0.999)).toBe(212);
  });

  test("save-vs-magic bonus is level-gated exactly as printed", () => {
    const magicSave = leyLineWalker.bonuses?.find((b) => b.type === "save" && b.target === "magic");
    expect(magicSave?.atLevels).toEqual([3, 6, 9, 11, 14]);
  });

  test("starting money formulas", () => {
    expect(leyLineWalker.money?.credits).toBe("1D4*1000");
    expect(leyLineWalker.money?.blackMarketItems).toBe("3D4*1000");
  });
});
