import { describe, expect, test } from "vite-plus/test";
import {
  buildSpeciesIndex,
  getSpecies,
  humanSpecies,
  speciesCatalog,
  type Species,
} from "../src/index.ts";

describe("species catalog — first O.C.C. breadth boundary", () => {
  test("pins the complete two-entry catalog and p.233 source", () => {
    expect(speciesCatalog.species).toHaveLength(2);
    expect(speciesCatalog.species.map((species) => species.id)).toEqual(["human", "psi-stalker"]);
    expect(humanSpecies).toMatchObject({
      id: "human",
      name: "Human",
      playable: true,
      source: { book: "Rifts Ultimate Edition", page: 233 },
    });
    expect(getSpecies("psi-stalker")).toMatchObject({
      name: "Psi-Stalker",
      playable: false,
      source: { book: "Rifts Ultimate Edition", page: 233 },
    });
    expect(getSpecies("unknown")).toBeUndefined();
  });

  test("exposes only immutable source-stamped catalog entries", () => {
    expect(Object.isFrozen(speciesCatalog)).toBe(true);
    expect(Object.isFrozen(speciesCatalog.species)).toBe(true);
    for (const species of speciesCatalog.species) {
      expect(Object.isFrozen(species)).toBe(true);
      expect(Object.isFrozen(species.source)).toBe(true);
    }

    expect(() => {
      (humanSpecies as unknown as { playable: boolean }).playable = false;
    }).toThrow();
    expect(getSpecies("human")?.playable).toBe(true);
  });

  test("rejects duplicate ids instead of shadowing entries", () => {
    const duplicate: Species[] = [humanSpecies, { ...humanSpecies, name: "Duplicate" }];
    expect(() => buildSpeciesIndex(duplicate)).toThrow('Duplicate species id "human"');
  });
});
