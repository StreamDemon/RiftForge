import { describe, expect, test } from "vite-plus/test";
import { alignments, deriveSheet, getAlignment, type CharacterInput } from "../src/index.ts";

const base: CharacterInput = {
  name: "Vesper",
  occId: "ley-line-walker",
  level: 1,
  attributes: { IQ: 18, ME: 16, MA: 12, PS: 16, PP: 20, PE: 14, PB: 11, Spd: 12 },
  hthType: "basic",
};

describe("alignments content (RUE pp.289-292)", () => {
  test("the seven canonical alignments, in book order", () => {
    expect(alignments.map((a) => a.id)).toEqual([
      "principled",
      "scrupulous",
      "unprincipled",
      "anarchist",
      "aberrant",
      "miscreant",
      "diabolic",
    ]);
  });

  test("categories match the book: 2 good, 2 selfish, 3 evil — no neutral", () => {
    const ids = (category: string) =>
      alignments.filter((a) => a.category === category).map((a) => a.id);
    expect(ids("good")).toEqual(["principled", "scrupulous"]);
    expect(ids("selfish")).toEqual(["unprincipled", "anarchist"]);
    expect(ids("evil")).toEqual(["aberrant", "miscreant", "diabolic"]);
  });

  test("getAlignment resolves ids and misses unknowns", () => {
    expect(getAlignment("aberrant")?.name).toBe("Aberrant");
    expect(getAlignment("true-neutral")).toBeUndefined();
  });
});

describe("deriveSheet with alignment", () => {
  test("resolves the alignment onto the sheet", () => {
    const sheet = deriveSheet({ ...base, alignmentId: "scrupulous" });
    expect(sheet.alignment).toMatchObject({
      id: "scrupulous",
      name: "Scrupulous",
      category: "good",
    });
  });

  test("characters without an alignment still derive (pre-alignment storage)", () => {
    expect(deriveSheet(base).alignment).toBeUndefined();
  });

  test("unknown alignment ids are rejected", () => {
    expect(() => deriveSheet({ ...base, alignmentId: "lawful-good" })).toThrow(/Unknown alignment/);
  });
});
