/// <reference types="node" />

import { existsSync, readFileSync } from "node:fs";
import type { AttributeCode, AttributeRoll, OccEligibilityFailure } from "@riftforge/rules";
import { createRoot } from "solid-js";
import { describe, expect, test } from "vite-plus/test";
import {
  createBuilderStore,
  occEligibilityRecoveryGuidance,
  stepValidity,
} from "../src/builder/store.ts";

function source(relative: string): string {
  const url = new URL(relative, import.meta.url);
  if (!existsSync(url)) throw new Error(`Missing source under test: ${relative}`);
  return readFileSync(url, "utf8");
}

const identitySource = source("../src/builder/steps/identity.tsx");

const rolled = (...dice: number[]): AttributeRoll => ({
  total: dice.reduce((sum, die) => sum + die, 0),
  dice,
  exceptional: false,
});

const legalLeyLineWalkerAttributes: Record<AttributeCode, AttributeRoll> = {
  IQ: rolled(3, 3, 4),
  ME: rolled(4, 4, 4),
  MA: rolled(4, 4, 4),
  PS: rolled(4, 4, 4),
  PP: rolled(4, 4, 4),
  PE: rolled(4, 4, 4),
  PB: rolled(4, 4, 4),
  Spd: rolled(4, 4, 4),
};

describe("builder species identity", () => {
  test("starts with the sole playable Human identity", () => {
    createRoot((dispose) => {
      const store = createBuilderStore();
      expect(store.draft.speciesId).toBe("human");
      expect(store.species()).toMatchObject({ id: "human", name: "Human", playable: true });
      dispose();
    });
  });

  test("derives legal and species-ineligible O.C.C. results through store accessors", () => {
    createRoot((dispose) => {
      const store = createBuilderStore();
      const validity = stepValidity(store);
      store.setDraft("attributes", legalLeyLineWalkerAttributes);
      store.setDraft("occId", "ley-line-walker");

      expect(validity.eligibility()).toMatchObject({
        ok: true,
        species: { id: "human", source: { book: "Rifts Ultimate Edition", page: 233 } },
        failures: [],
      });
      expect(validity.occ()).toBe(true);

      store.setDraft("speciesId", "psi-stalker");
      const speciesIneligible = validity.eligibility();
      expect(speciesIneligible).toMatchObject({
        ok: false,
        failures: [{ kind: "unavailableSpecies", speciesId: "psi-stalker", name: "Psi-Stalker" }],
      });
      expect(occEligibilityRecoveryGuidance(speciesIneligible?.failures ?? [])).toBe(
        "IDENTITY/O.C.C. UNAVAILABLE",
      );
      expect(validity.occ()).toBe(false);
      dispose();
    });
  });

  test("uses identity guidance for species failures and reroll guidance for attributes", () => {
    expect(
      occEligibilityRecoveryGuidance([{ kind: "attribute", code: "PE", min: 12, actual: 11 }]),
    ).toBe("REROLL ATTRIBUTES TO QUALIFY");
    const mixedFailures: OccEligibilityFailure[] = [
      { kind: "unavailableSpecies", speciesId: "psi-stalker", name: "Psi-Stalker" },
      { kind: "attribute", code: "PE", min: 12, actual: 11 },
    ];
    expect(occEligibilityRecoveryGuidance(mixedFailures)).toBe("IDENTITY/O.C.C. UNAVAILABLE");
  });

  test("renders Human as locked identity rather than an editable species step", () => {
    expect(identitySource).toContain("SPECIES");
    expect(identitySource).toContain("HUMAN // LOCKED");
    expect(identitySource).not.toContain('name="species"');
  });
});
