import { describe, expect, test } from "vite-plus/test";
import { deriveSheet, type CharacterInput } from "../src/index.ts";

const base: CharacterInput = {
  name: "Kestrel",
  occId: "ley-line-walker",
  level: 1,
  attributes: { IQ: 12, ME: 10, MA: 9, PS: 11, PP: 13, PE: 14, PB: 10, Spd: 12 },
  hthType: "basic",
};

const narrative = {
  epithet: "The ley lines whisper, and she whispers back.",
  appearance: {
    height: "5'7\"",
    weight: "128 lbs",
    age: "19",
    eyes: "grey (faint glow)",
    origin: "Magic Zone fringe",
    disposition: "quiet, watchful",
  },
  traits: ["Magic Zone survivor", "Coalition watchlist", "D-Bee sympathizer"],
  backstory: "She walked out of the Magic Zone on her fourteenth birthday.",
};

describe("narrative identity — story, not mechanics", () => {
  test("passes through deriveSheet untouched", () => {
    const sheet = deriveSheet({ ...base, narrative });
    expect(sheet.narrative).toEqual(narrative);
  });

  test("is optional and absent by default", () => {
    expect(deriveSheet(base).narrative).toBeUndefined();
  });

  test("partial narratives are fine — every field is optional", () => {
    const sheet = deriveSheet({ ...base, narrative: { epithet: "Just a tagline." } });
    expect(sheet.narrative).toEqual({ epithet: "Just a tagline." });
  });

  test("never affects derived numbers", () => {
    const bare = deriveSheet(base);
    const storied = deriveSheet({ ...base, narrative });
    expect(storied.combat).toEqual(bare.combat);
    expect(storied.vitals).toEqual(bare.vitals);
    expect(storied.skills).toEqual(bare.skills);
    expect(storied.saves).toEqual(bare.saves);
  });

  test("bounds are enforced: too many traits, empty epithet", () => {
    expect(() =>
      deriveSheet({ ...base, narrative: { traits: Array.from({ length: 13 }, () => "x") } }),
    ).toThrow();
    expect(() => deriveSheet({ ...base, narrative: { epithet: "" } })).toThrow();
  });

  test("traits cannot contain commas — they must round-trip through comma-separated editors", () => {
    expect(() => deriveSheet({ ...base, narrative: { traits: ["survivor, allegedly"] } })).toThrow(
      /comma/,
    );
  });
});
