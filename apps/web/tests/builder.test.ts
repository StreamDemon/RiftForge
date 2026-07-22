/// <reference types="node" />

import { existsSync, readFileSync } from "node:fs";
import { createRoot } from "solid-js";
import { describe, expect, test } from "vite-plus/test";
import { createBuilderStore } from "../src/builder/store.ts";

function source(relative: string): string {
  const url = new URL(relative, import.meta.url);
  if (!existsSync(url)) throw new Error(`Missing source under test: ${relative}`);
  return readFileSync(url, "utf8");
}

const storeSource = source("../src/builder/store.ts");
const identitySource = source("../src/builder/steps/identity.tsx");
const occSource = source("../src/builder/steps/occ.tsx");

describe("builder species identity", () => {
  test("starts with the sole playable Human identity", () => {
    createRoot((dispose) => {
      const store = createBuilderStore();
      expect(store.draft.speciesId).toBe("human");
      expect(store.species()).toMatchObject({ id: "human", name: "Human", playable: true });
      dispose();
    });
  });

  test("persists species and delegates O.C.C. legality to the shared engine", () => {
    expect(storeSource).toContain("speciesId: draft.speciesId");
    expect(storeSource).toContain("validateOccEligibility(");
    expect(occSource).toContain("validateOccEligibility(");
    expect(occSource).toContain("describeOccEligibilityFailure");
  });

  test("renders Human as locked identity rather than an editable species step", () => {
    expect(identitySource).toContain("SPECIES");
    expect(identitySource).toContain("HUMAN // LOCKED");
    expect(identitySource).not.toContain('name="species"');
  });
});
