import { describe, expect, test } from "vite-plus/test";
import {
  describeOccEligibilityFailure,
  leyLineWalker,
  occSchema,
  type OccEligibilityFailure,
  validateOccEligibility,
} from "../src/index.ts";

const gruntFixture = occSchema.parse({
  source: { book: "Rifts Ultimate Edition", page: 233 },
  id: "coalition-grunt-eligibility-fixture",
  name: "Coalition Grunt eligibility fixture",
  category: "Men at Arms",
  alignment: "Any",
  attributeRequirements: [],
  speciesEligibility: { kind: "oneOf", speciesIds: ["human", "psi-stalker"] },
});

describe("validateOccEligibility", () => {
  test("accepts playable Human for the p.233 Grunt fixture", () => {
    expect(validateOccEligibility(gruntFixture, "human", {})).toMatchObject({
      ok: true,
      species: { id: "human", playable: true },
      failures: [],
    });
  });

  test("distinguishes unknown, unavailable, and disallowed species", () => {
    expect(validateOccEligibility(gruntFixture, "kryptonian", {}).failures).toEqual([
      { kind: "unknownSpecies", speciesId: "kryptonian" },
    ]);
    expect(validateOccEligibility(gruntFixture, "psi-stalker", {}).failures).toEqual([
      { kind: "unavailableSpecies", speciesId: "psi-stalker", name: "Psi-Stalker" },
    ]);
    const psiOnly = occSchema.parse({
      ...gruntFixture,
      id: "psi-only-fixture",
      speciesEligibility: { kind: "oneOf", speciesIds: ["psi-stalker"] },
    });
    expect(validateOccEligibility(psiOnly, "human", {}).failures).toEqual([
      {
        kind: "speciesNotAllowed",
        speciesId: "human",
        allowedSpeciesIds: ["psi-stalker"],
      },
    ]);
  });

  test("reports every failed printed attribute requirement", () => {
    const result = validateOccEligibility(leyLineWalker, "human", { IQ: 9, PE: 11 });
    expect(result.failures).toEqual([
      { kind: "attribute", code: "IQ", min: 10, actual: 9 },
      { kind: "attribute", code: "PE", min: 12, actual: 11 },
    ]);
    expect(result.failures.map(describeOccEligibilityFailure)).toEqual([
      "I.Q. 9; requires 10+.",
      "P.E. 11; requires 12+.",
    ]);
  });

  test.each([
    [
      "unknown species",
      { kind: "unknownSpecies", speciesId: "kryptonian" },
      'Unknown species "kryptonian".',
    ],
    [
      "unavailable species",
      {
        kind: "unavailableSpecies",
        speciesId: "psi-stalker",
        name: "Psi-Stalker",
      },
      "Psi-Stalker is known but not playable.",
    ],
    [
      "disallowed species",
      {
        kind: "speciesNotAllowed",
        speciesId: "human",
        allowedSpeciesIds: ["psi-stalker"],
      },
      'Species "human" is not allowed; expected psi-stalker.',
    ],
  ] satisfies readonly (readonly [string, OccEligibilityFailure, string])[])(
    "pins the exact formatter message for %s",
    (_label, failure, expected) => {
      expect(describeOccEligibilityFailure(failure)).toBe(expected);
    },
  );
});
