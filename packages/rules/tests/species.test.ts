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
    expect(humanSpecies).toMatchObject({ id: "human", name: "Human", playable: true });
    expect(getSpecies("psi-stalker")).toMatchObject({
      name: "Psi-Stalker",
      playable: false,
      source: { book: "Rifts Ultimate Edition", page: 233 },
    });
    expect(getSpecies("unknown")).toBeUndefined();
  });

  test("rejects duplicate ids instead of shadowing entries", () => {
    const duplicate: Species[] = [humanSpecies, { ...humanSpecies, name: "Duplicate" }];
    expect(() => buildSpeciesIndex(duplicate)).toThrow('Duplicate species id "human"');
  });
});
