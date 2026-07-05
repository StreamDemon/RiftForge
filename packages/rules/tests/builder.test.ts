import { describe, expect, test } from "vite-plus/test";
import {
  assembleSkills,
  deriveSheet,
  leyLineWalker,
  meetsAttributeRequirements,
  occSchema,
  occSkillPlan,
  relatedSkillPlan,
  rollPsionics,
  secondarySkillPlan,
  validateInitialSpells,
  type BuilderSelections,
} from "../src/index.ts";
import type { Rng } from "../src/engine/dice.ts";

/** An RNG that yields d100 faces in order (1-based), then repeats the last. */
function d100Faces(...values: number[]): Rng {
  let i = 0;
  return () => {
    const v = values[Math.min(i++, values.length - 1)]!;
    return (v - 1) / 100;
  };
}

describe("meetsAttributeRequirements — LLW needs I.Q. 10, P.E. 12", () => {
  test("passes at the printed minimums", () => {
    const check = meetsAttributeRequirements(leyLineWalker, { IQ: 10, PE: 12 });
    expect(check).toEqual({ ok: true, failures: [] });
  });

  test("reports each failing attribute with the shortfall", () => {
    const check = meetsAttributeRequirements(leyLineWalker, { IQ: 9, PE: 11 });
    expect(check.ok).toBe(false);
    expect(check.failures).toEqual([
      { code: "IQ", min: 10, actual: 9 },
      { code: "PE", min: 12, actual: 11 },
    ]);
  });

  test("missing attributes count as 0", () => {
    expect(meetsAttributeRequirements(leyLineWalker, {}).failures).toHaveLength(2);
  });
});

describe("rollPsionics — Random Psionics Table, RUE p.289", () => {
  test("01-10 is major, 11-25 minor, 26-00 none", () => {
    expect(rollPsionics(d100Faces(5))).toEqual({
      roll: 5,
      result: "major",
      psychicClass: "majorOrMinorPsychic",
    });
    expect(rollPsionics(d100Faces(10)).result).toBe("major");
    expect(rollPsionics(d100Faces(11)).result).toBe("minor");
    expect(rollPsionics(d100Faces(25)).result).toBe("minor");
    expect(rollPsionics(d100Faces(26))).toEqual({
      roll: 26,
      result: "none",
      psychicClass: "ordinary",
    });
    expect(rollPsionics(d100Faces(100)).result).toBe("none");
  });
});

describe("occSkillPlan — the LLW's printed grants", () => {
  const plan = occSkillPlan(leyLineWalker);

  test("fixed grants carry their O.C.C. bonuses (and the 98% override)", () => {
    expect(plan.fixed).toEqual([
      { skillId: "language-native-tongue", overrideValue: 98 },
      { skillId: "climbing", occBonus: 5 },
      { skillId: "math-basic", occBonus: 10 },
      { skillId: "land-navigation", occBonus: 4 },
      { skillId: "wilderness-survival", occBonus: 10 },
      { skillId: "lore-demons-monsters", occBonus: 15 },
    ]);
  });

  test("choice slots: 2 languages, 1 Pilot, 4 Lore", () => {
    expect(
      plan.choices.map((c) => ({ key: c.key, choose: c.choose, occBonus: c.occBonus })),
    ).toEqual([
      { key: "language-other", choose: 2, occBonus: 20 },
      { key: "category:Pilot", choose: 1, occBonus: 5 },
      { key: "prefix:Lore", choose: 4, occBonus: 10 },
    ]);
    expect(plan.choices[0]!.repeatable).toBe(true);
    expect(plan.choices[1]!.options.map((s) => s.id)).toContain("pilot-hovercycle");
    expect(plan.choices[2]!.options.map((s) => s.id)).toEqual([
      "lore-demons-monsters",
      "lore-american-indians",
      "lore-cattle-animals",
      "lore-dbee",
    ]);
  });

  test("hand to hand: basic, with all printed upgrades available (#15)", () => {
    expect(plan.hth?.hthId).toBe("basic");
    expect(
      plan.hth?.upgrades.map((u) => ({
        to: u.to,
        hthId: u.hthId,
        cost: u.cost,
        available: u.available,
      })),
    ).toEqual([
      { to: "Hand to Hand: Expert", hthId: "expert", cost: 1, available: true },
      { to: "Martial Arts", hthId: "martial-arts", cost: 2, available: true },
      { to: "Assassin", hthId: "assassin", cost: 2, available: true },
    ]);
  });
});

describe("relatedSkillPlan — LLW related picks", () => {
  const plan = relatedSkillPlan(leyLineWalker);

  test("7 picks at level 1, with the printed category minimums", () => {
    expect(plan.count).toBe(7);
    expect(plan.constraints).toEqual([
      { fromCategory: "Science", min: 2 },
      { fromCategory: "Technical", min: 1 },
    ]);
  });

  test("category bonuses from the printed rules", () => {
    expect(plan.categoryBonuses).toMatchObject({ Science: 10, Technical: 5, Pilot: 2 });
  });

  test("excluded and restricted categories drop out of the options", () => {
    const ids = new Set(plan.options.map((s) => s.id));
    // Communication is "Radio: Basic only" and radio-basic isn't in the catalog yet.
    expect(ids.has("language-other")).toBe(false);
    expect(ids.has("language-native-tongue")).toBe(false);
    // Science/Technical/Wilderness are open.
    expect(ids.has("biology")).toBe(true);
    expect(ids.has("history-pre-rifts")).toBe(true);
    expect(ids.has("track-trap-animals")).toBe(true);
    // Physical is "any except Gymnastics and Wrestling" — climbing stays.
    expect(ids.has("climbing")).toBe(true);
  });

  test("unparsable printed rules are surfaced as notes", () => {
    expect(plan.notes.join("\n")).toContain("Radio: Basic only");
  });
});

// A fully legal level-1 Ley Line Walker build.
const legalSelections: BuilderSelections = {
  occChoices: {
    "language-other": [
      { skillId: "language-other", label: "Dragonese" },
      { skillId: "language-other", label: "Euro" },
    ],
    "category:Pilot": [{ skillId: "pilot-hovercycle" }],
    "prefix:Lore": [
      { skillId: "lore-demons-monsters", label: "Vampires" },
      { skillId: "lore-american-indians" },
      { skillId: "lore-cattle-animals" },
      { skillId: "lore-dbee" },
    ],
  },
  related: [
    { skillId: "math-advanced" },
    { skillId: "biology" },
    { skillId: "history-pre-rifts" },
    { skillId: "computer-operation" },
    { skillId: "track-trap-animals" },
    { skillId: "dowsing" },
    { skillId: "pilot-automobile" },
  ],
  secondary: [
    { skillId: "carpentry" },
    { skillId: "fasting" },
    { skillId: "preserve-food" },
    { skillId: "spelunking" },
    { skillId: "identify-plants-fruit" },
    { skillId: "boat-building" },
  ],
  alignmentId: "scrupulous",
};

const legalSpells = [
  "globe-of-daylight",
  "see-aura",
  "sense-magic",
  "befuddle",
  "chameleon",
  "levitation",
  "armor-of-ithan",
  "energy-bolt",
  "impervious-to-fire",
  "carpet-of-adhesion",
  "charismatic-aura",
  "electric-arc",
];

describe("assembleSkills — a legal LLW build", () => {
  const assembled = assembleSkills(leyLineWalker, legalSelections);

  test("no errors, hand to hand defaults to the grant", () => {
    expect(assembled.errors).toEqual([]);
    expect(assembled.hthType).toBe("basic");
  });

  test("fixed + 7 choice picks + 7 related + 6 secondary = 26 skills", () => {
    expect(assembled.skills).toHaveLength(26);
  });

  test("bonuses land where the book says: slot occBonus, related categoryBonus, bare secondary", () => {
    const byId = (id: string) => assembled.skills.filter((s) => s.skillId === id);
    expect(byId("language-other")[0]).toMatchObject({ occBonus: 20, label: "Dragonese" });
    expect(byId("math-advanced")[0]).toEqual({ skillId: "math-advanced", categoryBonus: 10 });
    expect(byId("history-pre-rifts")[0]).toEqual({
      skillId: "history-pre-rifts",
      categoryBonus: 5,
    });
    expect(byId("track-trap-animals")[0]).toEqual({ skillId: "track-trap-animals" });
    expect(byId("carpentry")[0]).toEqual({ skillId: "carpentry" });
  });

  test("the assembled build derives a full sheet end-to-end", () => {
    expect(validateInitialSpells(leyLineWalker, legalSpells)).toEqual([]);
    const sheet = deriveSheet({
      name: "Kestrel",
      occId: "ley-line-walker",
      alignmentId: "scrupulous",
      level: 1,
      attributes: { IQ: 12, ME: 10, MA: 9, PS: 11, PP: 13, PE: 14, PB: 10, Spd: 12 },
      hthType: assembled.hthType,
      psychicClass: "ordinary",
      skills: assembled.skills,
      spellIds: legalSpells,
    });
    expect(sheet.skills).toHaveLength(26);
    expect(sheet.spells.count).toBe(12);
    expect(sheet.alignment?.id).toBe("scrupulous");
    // Related Science pick: base 45 + category 10 (no I.Q. bonus at 12) = 55.
    expect(sheet.skills.find((s) => s.id === "math-advanced")?.value).toBe(55);
  });
});

describe("assembleSkills — rule violations", () => {
  test("wrong slot count, ineligible picks, unmet constraints", () => {
    const { errors } = assembleSkills(leyLineWalker, {
      occChoices: {
        "language-other": [{ skillId: "language-other", label: "Euro" }],
        "category:Pilot": [{ skillId: "boat-building" }],
        "prefix:Lore": legalSelections.occChoices["prefix:Lore"]!,
      },
      related: [
        { skillId: "math-advanced" },
        { skillId: "dowsing" },
        { skillId: "carpentry" },
        { skillId: "spelunking" },
        { skillId: "fasting" },
        { skillId: "preserve-food" },
        { skillId: "language-other", label: "Techno-can" },
      ],
      secondary: legalSelections.secondary,
    });
    expect(errors).toContainEqual(expect.stringContaining("Language: Other: pick 2"));
    expect(errors).toContainEqual(expect.stringContaining('"boat-building" is not an option'));
    expect(errors).toContainEqual(
      expect.stringContaining('"language-other" is not an eligible pick'),
    );
    expect(errors).toContainEqual(expect.stringContaining("at least 2 from Science"));
    expect(errors).toContainEqual(expect.stringContaining("at least 1 from Technical"));
  });

  test("a non-repeatable skill cannot be taken twice across the build", () => {
    const { errors } = assembleSkills(leyLineWalker, {
      ...legalSelections,
      related: [...legalSelections.related.slice(0, 6), { skillId: "math-basic" }],
    });
    expect(errors).toContainEqual(
      expect.stringContaining('"Mathematics: Basic" cannot be taken twice'),
    );
  });

  test("repeatable picks with the same label are rejected", () => {
    const { errors } = assembleSkills(leyLineWalker, {
      ...legalSelections,
      occChoices: {
        ...legalSelections.occChoices,
        "language-other": [
          { skillId: "language-other", label: "Euro" },
          { skillId: "language-other", label: "Euro" },
        ],
      },
    });
    expect(errors).toContainEqual(expect.stringContaining("same label"));
  });

  test("upgrading to Expert spends one related pick (#15)", () => {
    const result = assembleSkills(leyLineWalker, {
      ...legalSelections,
      hthId: "expert",
      related: legalSelections.related.slice(0, 6),
    });
    expect(result.errors).toEqual([]);
    expect(result.hthType).toBe("expert");
  });

  test("upgrading to Martial Arts spends two related picks (#15)", () => {
    const result = assembleSkills(leyLineWalker, {
      ...legalSelections,
      hthId: "martial-arts",
      related: legalSelections.related.slice(0, 5),
    });
    expect(result.errors).toEqual([]);
    expect(result.hthType).toBe("martial-arts");
  });

  test("Assassin demands an evil alignment even now that it is modeled", () => {
    const { errors } = assembleSkills(leyLineWalker, {
      ...legalSelections,
      hthId: "assassin",
      related: legalSelections.related.slice(0, 5),
      // legalSelections is scrupulous (good)
    });
    expect(errors).toContainEqual(expect.stringContaining("requires an evil alignment"));
  });
});

describe("assembleSkills — hand-to-hand upgrades (synthetic O.C.C.)", () => {
  // A minimal O.C.C. whose grant is "none" upgradable to Basic, so the upgrade
  // mechanics are exercisable — plus an unmodeled style to pin the
  // unavailability path now that all printed RUE types exist (#15).
  const brawler = occSchema.parse({
    source: { book: "Test Fixture", page: 1 },
    id: "test-brawler",
    name: "Test Brawler",
    category: "Test",
    alignment: "Any",
    attributeRequirements: [],
    occSkills: [
      { skill: "Climbing", skillId: "climbing", occBonus: 5 },
      {
        skill: "Hand to Hand: None",
        hthId: "none",
        upgrades: [
          { to: "Basic", cost: { occRelatedSkills: 1 } },
          { to: "Hand to Hand: Expert", cost: { occRelatedSkills: 2 }, requiresAlignment: "evil" },
          { to: "Ninjutsu", cost: { occRelatedSkills: 1 } },
        ],
      },
    ],
    occRelatedSkills: { count: 2, categoryRules: [{ category: "Science", allowed: "any" }] },
  });

  test("an upgrade to an unmodeled style stays unavailable", () => {
    const plan = occSkillPlan(brawler);
    expect(plan.hth?.upgrades.find((u) => u.to === "Ninjutsu")).toMatchObject({
      hthId: undefined,
      available: false,
    });
    const { errors } = assembleSkills(brawler, {
      occChoices: {},
      related: [{ skillId: "biology" }],
      secondary: [],
      hthId: "ninjutsu",
    });
    expect(errors).toContainEqual(expect.stringContaining('"ninjutsu" is not available'));
  });

  test("an available upgrade spends related picks", () => {
    const result = assembleSkills(brawler, {
      occChoices: {},
      related: [{ skillId: "biology" }],
      secondary: [],
      hthId: "basic",
    });
    expect(result.errors).toEqual([]);
    expect(result.hthType).toBe("basic");
  });

  test("skipping the upgrade keeps the full related count", () => {
    const result = assembleSkills(brawler, {
      occChoices: {},
      related: [{ skillId: "biology" }, { skillId: "chemistry" }],
      secondary: [],
    });
    expect(result.errors).toEqual([]);
    expect(result.hthType).toBe("none");
  });

  test("an alignment-gated upgrade demands the category", () => {
    const evil = assembleSkills(brawler, {
      occChoices: {},
      related: [],
      secondary: [],
      hthId: "expert",
      alignmentId: "miscreant",
    });
    // Expert costs both related picks; an evil alignment satisfies the gate.
    expect(evil.errors).toEqual([]);
    expect(evil.hthType).toBe("expert");

    const gated = occSchema.parse({
      ...brawler,
      occSkills: [
        {
          skill: "Hand to Hand: None",
          hthId: "none",
          upgrades: [{ to: "Basic", cost: { occRelatedSkills: 1 }, requiresAlignment: "evil" }],
        },
      ],
    });
    const wrong = assembleSkills(gated, {
      occChoices: {},
      related: [{ skillId: "biology" }],
      secondary: [],
      hthId: "basic",
      alignmentId: "principled",
    });
    expect(wrong.errors).toContainEqual(expect.stringContaining("requires an evil alignment"));

    const right = assembleSkills(gated, {
      occChoices: {},
      related: [{ skillId: "biology" }],
      secondary: [],
      hthId: "basic",
      alignmentId: "miscreant",
    });
    expect(right.errors).toEqual([]);
  });
});

describe("validateInitialSpells — LLW picks 3 from each of levels 1-4", () => {
  test("a legal 12-spell selection passes", () => {
    expect(validateInitialSpells(leyLineWalker, legalSpells)).toEqual([]);
  });

  test("wrong per-level counts are reported per level", () => {
    const errors = validateInitialSpells(leyLineWalker, [
      "globe-of-daylight",
      "see-aura",
      // level 1 short by one; level 2 over by one
      "befuddle",
      "chameleon",
      "levitation",
      "turn-dead",
      "armor-of-ithan",
      "energy-bolt",
      "impervious-to-fire",
      "carpet-of-adhesion",
      "charismatic-aura",
      "electric-arc",
    ]);
    expect(errors).toContainEqual(expect.stringContaining("Spell level 1: pick 3 (picked 2)"));
    expect(errors).toContainEqual(expect.stringContaining("Spell level 2: pick 3 (picked 4)"));
  });

  test("spells outside the eligible levels are rejected", () => {
    const errors = validateInitialSpells(leyLineWalker, [...legalSpells.slice(0, 11), "fireball"]);
    expect(errors).toContainEqual(expect.stringContaining('"fireball" is not part of the initial'));
  });
});

describe("secondarySkillPlan", () => {
  test("LLW gets 6 secondary picks from the eligible pool", () => {
    const plan = secondarySkillPlan(leyLineWalker);
    expect(plan.count).toBe(6);
    expect(plan.options.map((s) => s.id)).toContain("carpentry");
    expect(plan.notes.join(" ")).toContain("Secondary Skills");
  });

  test("an O.C.C. with secondary skills but no related rules pools the whole catalog", () => {
    const occ = occSchema.parse({
      source: { book: "Test Fixture", page: 1 },
      id: "test-secondary-only",
      name: "Test Secondary Only",
      category: "Test",
      alignment: "Any",
      attributeRequirements: [],
      secondarySkills: { count: 3 },
    });
    const plan = secondarySkillPlan(occ);
    expect(plan.count).toBe(3);
    expect(plan.options.length).toBeGreaterThan(0);
  });
});

describe("content-bug fail-fasts and edge counts", () => {
  const baseOcc = {
    source: { book: "Test Fixture", page: 1 },
    id: "test-occ",
    name: "Test O.C.C.",
    category: "Test",
    alignment: "Any",
    attributeRequirements: [],
  };

  test("a category choice with no catalog skills throws at plan time", () => {
    const occ = occSchema.parse({
      ...baseOcc,
      occSkills: [{ skill: "Medical", chooseFromCategory: "Medical", choose: 1 }],
    });
    expect(() => occSkillPlan(occ)).toThrow(/category "Medical".*no skills/);
  });

  test("a prefix choice matching nothing throws at plan time", () => {
    const occ = occSchema.parse({
      ...baseOcc,
      occSkills: [{ skill: "W.P.", skillPrefix: "W.P.", choose: 2 }],
    });
    expect(() => occSkillPlan(occ)).toThrow(/prefixed "W\.P\."/);
  });

  test("an upgrade costing more than the related grant errors instead of going negative", () => {
    const occ = occSchema.parse({
      ...baseOcc,
      occSkills: [
        {
          skill: "Hand to Hand: None",
          hthId: "none",
          upgrades: [{ to: "Basic", cost: { occRelatedSkills: 3 } }],
        },
      ],
      occRelatedSkills: { count: 2, categoryRules: [{ category: "Science", allowed: "any" }] },
    });
    const { errors } = assembleSkills(occ, {
      occChoices: {},
      related: [],
      secondary: [],
      hthId: "basic",
    });
    expect(errors).toContainEqual(expect.stringContaining("costs 3"));
    expect(errors.join("\n")).not.toContain("-1");
  });

  test("zoology can be taken twice (specialization) with distinct labels", () => {
    const { errors } = assembleSkills(leyLineWalker, {
      ...legalSelections,
      secondary: [
        ...legalSelections.secondary.slice(0, 4),
        { skillId: "zoology", label: "Birds" },
        { skillId: "zoology", label: "Reptiles" },
      ],
    });
    expect(errors).toEqual([]);
  });
});
