import { describe, expect, test } from "vite-plus/test";
import {
  deriveSpellDamage,
  getSpell,
  spellBook,
  spellDamageEffectSchema,
  spellSchema,
  type Spell,
  type SpellDamageEffect,
  type SpellHealing,
} from "../src/index.ts";

const fixed = { id: "default", type: "md", base: "2D6" } as const;

describe("spellDamageEffectSchema", () => {
  test("accepts fixed, scaling, choice, environment, and adjustable effects", () => {
    const effects = [
      { selection: "single", variants: [fixed] },
      {
        selection: "single",
        variants: [
          {
            id: "default",
            type: "md",
            base: "2D6",
            scaling: { formula: "1D6", startsAtLevel: 3, everyLevels: 2 },
            adjustableDiceCount: { minimum: 1, step: 1 },
            optionalBonuses: [{ id: "doublePpe", label: "Double P.P.E.", amount: 20 }],
          },
        ],
      },
      {
        selection: "casterChoice",
        variants: [fixed, { ...fixed, id: "fire", label: "Fire" }],
      },
      {
        selection: "environment",
        variants: [
          { ...fixed, id: "normal", environment: "normal" },
          { ...fixed, id: "line", environment: "leyLine" },
          { ...fixed, id: "nexus", environment: "nexus" },
        ],
      },
    ] as const;

    for (const effect of effects) {
      expect(spellDamageEffectSchema.safeParse(effect).success).toBe(true);
    }
  });

  test.each([
    ["empty effect", { selection: "single", variants: [] }],
    ["duplicate variant ids", { selection: "casterChoice", variants: [fixed, fixed] }],
    ["variant without damage", { selection: "single", variants: [{ id: "default", type: "md" }] }],
    [
      "non-positive scaling start",
      {
        selection: "single",
        variants: [
          {
            id: "default",
            type: "md",
            scaling: { formula: "1D6", startsAtLevel: 0, everyLevels: 1 },
          },
        ],
      },
    ],
    [
      "non-positive scaling interval",
      {
        selection: "single",
        variants: [
          {
            id: "default",
            type: "md",
            scaling: { formula: "1D6", startsAtLevel: 1, everyLevels: 0 },
          },
        ],
      },
    ],
    [
      "environment field on single",
      { selection: "single", variants: [{ ...fixed, environment: "normal" }] },
    ],
    [
      "single with two variants",
      { selection: "single", variants: [fixed, { ...fixed, id: "two" }] },
    ],
    ["choice with one variant", { selection: "casterChoice", variants: [fixed] }],
    [
      "duplicate environments",
      {
        selection: "environment",
        variants: [
          { ...fixed, id: "normal-a", environment: "normal" },
          { ...fixed, id: "normal-b", environment: "normal" },
          { ...fixed, id: "nexus", environment: "nexus" },
        ],
      },
    ],
    [
      "incomplete environments",
      {
        selection: "environment",
        variants: [
          { ...fixed, id: "normal", environment: "normal" },
          { ...fixed, id: "line", environment: "leyLine" },
        ],
      },
    ],
    [
      "missing environment",
      {
        selection: "environment",
        variants: [
          { ...fixed, id: "normal", environment: "normal" },
          { ...fixed, id: "line" },
          { ...fixed, id: "nexus", environment: "nexus" },
        ],
      },
    ],
    [
      "duplicate optional bonuses",
      {
        selection: "single",
        variants: [
          {
            ...fixed,
            optionalBonuses: [
              { id: "boost", label: "Boost", amount: 10 },
              { id: "boost", label: "Boost again", amount: 20 },
            ],
          },
        ],
      },
    ],
    [
      "non-positive optional bonus",
      {
        selection: "single",
        variants: [{ ...fixed, optionalBonuses: [{ id: "boost", label: "Boost", amount: 0 }] }],
      },
    ],
    [
      "adjustable without base damage",
      {
        selection: "single",
        variants: [
          {
            id: "default",
            type: "md",
            scaling: { formula: "1D6", startsAtLevel: 3, everyLevels: 2 },
            adjustableDiceCount: { minimum: 1, step: 1 },
          },
        ],
      },
    ],
    [
      "adjustable constant",
      {
        selection: "single",
        variants: [
          { id: "default", type: "md", base: "20", adjustableDiceCount: { minimum: 1, step: 1 } },
        ],
      },
    ],
    [
      "adjustable multiplied dice",
      {
        selection: "single",
        variants: [
          {
            id: "default",
            type: "md",
            base: "1D6*10",
            adjustableDiceCount: { minimum: 1, step: 1 },
          },
        ],
      },
    ],
    [
      "adjustable modified dice",
      {
        selection: "single",
        variants: [
          {
            id: "default",
            type: "md",
            base: "2D6+1",
            adjustableDiceCount: { minimum: 1, step: 1 },
          },
        ],
      },
    ],
    [
      "adjustable mismatched sides",
      {
        selection: "single",
        variants: [
          {
            id: "default",
            type: "md",
            base: "2D6",
            scaling: { formula: "1D4", startsAtLevel: 3, everyLevels: 2 },
            adjustableDiceCount: { minimum: 1, step: 1 },
          },
        ],
      },
    ],
    [
      "adjustable minimum above base dice count",
      {
        selection: "single",
        variants: [
          {
            id: "default",
            type: "md",
            base: "2D6",
            adjustableDiceCount: { minimum: 3, step: 1 },
          },
        ],
      },
    ],
  ])("rejects %s", (_label, effect) => {
    expect(spellDamageEffectSchema.safeParse(effect).success).toBe(false);
  });

  test("reports malformed adjustable dice as a schema failure instead of throwing", () => {
    const effect = {
      selection: "single",
      variants: [
        {
          id: "default",
          type: "md",
          base: "not dice",
          adjustableDiceCount: { minimum: 1, step: 1 },
        },
      ],
    };

    expect(() => spellDamageEffectSchema.safeParse(effect)).not.toThrow();
    expect(spellDamageEffectSchema.safeParse(effect).success).toBe(false);
  });
});

function expectCorrespondence<T>(
  rows: readonly { id: string; prose: string; structured: T }[],
  proseOf: (spell: Spell) => string | undefined,
  structuredOf: (spell: Spell) => T | undefined,
): void {
  for (const row of rows) {
    const spell = getSpell(row.id);
    expect(spell, row.id).toBeDefined();
    expect(proseOf(spell!), `${row.id} prose`).toBe(row.prose);
    expect(structuredOf(spell!), `${row.id} structure`).toEqual(row.structured);
  }
}

const structuredDamageRows: readonly {
  id: string;
  prose: string;
  structured: SpellDamageEffect;
}[] = [
  {
    id: "energy-bolt",
    prose: "4D6 S.D.C. (6D6 on a ley line, 8D6 at a nexus)",
    structured: {
      selection: "environment",
      variants: [
        { id: "normal", label: "Normal", type: "sdc", base: "4D6", environment: "normal" },
        { id: "leyLine", label: "Ley Line", type: "sdc", base: "6D6", environment: "leyLine" },
        { id: "nexus", label: "Nexus", type: "sdc", base: "8D6", environment: "nexus" },
      ],
    },
  },
  {
    id: "ignite-fire",
    prose: "2D6 S.D.C. per melee (clothes/hair, after first 2 melees)",
    structured: {
      selection: "single",
      variants: [
        { id: "default", type: "sdc", base: "2D6", note: "Per melee after the first two melees." },
      ],
    },
  },
  {
    id: "electric-arc",
    prose: "2D6 M.D.",
    structured: { selection: "single", variants: [{ id: "default", type: "md", base: "2D6" }] },
  },
  {
    id: "fire-bolt",
    prose: "4D6 M.D. or 1D6x10 S.D.C. (caster's choice)",
    structured: {
      selection: "casterChoice",
      variants: [
        { id: "megaDamage", label: "Mega-Damage", type: "md", base: "4D6" },
        { id: "structuralDamage", label: "S.D.C.", type: "sdc", base: "1D6*10" },
      ],
    },
  },
  {
    id: "circle-of-flame",
    prose: "6D6 S.D.C. to anybody passing through",
    structured: {
      selection: "single",
      variants: [
        { id: "default", type: "sdc", base: "6D6", note: "One passage through the circle." },
      ],
    },
  },
  {
    id: "call-lightning",
    prose: "1D6 M.D. per level of the spell caster",
    structured: {
      selection: "single",
      variants: [
        {
          id: "default",
          type: "md",
          scaling: { formula: "1D6", startsAtLevel: 1, everyLevels: 1 },
        },
      ],
    },
  },
  {
    id: "fire-ball",
    prose: "1D4 M.D. per level of the spell caster",
    structured: {
      selection: "single",
      variants: [
        {
          id: "default",
          type: "md",
          scaling: { formula: "1D4", startsAtLevel: 1, everyLevels: 1 },
        },
      ],
    },
  },
  {
    id: "ballistic-fire",
    prose: "1D6 M.D. per fiery missile",
    structured: {
      selection: "single",
      variants: [{ id: "default", type: "md", base: "1D6", note: "One fiery missile." }],
    },
  },
  {
    id: "lightblade",
    prose: "1D4x10 +1 M.D. point per level of experience",
    structured: {
      selection: "single",
      variants: [
        {
          id: "default",
          type: "md",
          base: "1D4*10",
          scaling: { formula: "1", startsAtLevel: 1, everyLevels: 1 },
        },
      ],
    },
  },
  {
    id: "ley-line-tendril-bolts",
    prose: "2D6 M.D. at level one, +1D6 M.D. per two additional levels",
    structured: {
      selection: "single",
      variants: [
        {
          id: "default",
          type: "md",
          base: "2D6",
          scaling: { formula: "1D6", startsAtLevel: 3, everyLevels: 2 },
          adjustableDiceCount: { minimum: 1, step: 1 },
          optionalBonuses: [{ id: "doublePpe", label: "Double P.P.E.", amount: 20 }],
          note: "One bolt; the caster may regulate damage in 1D6 increments.",
        },
      ],
    },
  },
  {
    id: "lightning-arc",
    prose: "4D6 +2 M.D. per level of experience",
    structured: {
      selection: "single",
      variants: [
        {
          id: "default",
          type: "md",
          base: "4D6",
          scaling: { formula: "2", startsAtLevel: 1, everyLevels: 1 },
        },
      ],
    },
  },
  {
    id: "shockwave",
    prose: "1D4 M.D. per level plus knockdown",
    structured: {
      selection: "single",
      variants: [
        {
          id: "default",
          type: "md",
          scaling: { formula: "1D4", startsAtLevel: 1, everyLevels: 1 },
          note: "Damage only; knockdown remains in printed prose.",
        },
      ],
    },
  },
  {
    id: "dragon-fire",
    prose: "1D4x10 M.D.",
    structured: { selection: "single", variants: [{ id: "default", type: "md", base: "1D4*10" }] },
  },
  {
    id: "meteor",
    prose: "1D6x10 M.D. to a 40 ft (12.2 m) radius, +2 M.D. per level of the spell caster",
    structured: {
      selection: "single",
      variants: [
        {
          id: "default",
          type: "md",
          base: "1D6*10",
          scaling: { formula: "2", startsAtLevel: 1, everyLevels: 1 },
          note: "One target in the 40 ft (12.2 m) radius.",
        },
      ],
    },
  },
  {
    id: "firequake",
    prose: "Varies; jets of flame do 5D6 M.D. on a failed dodge",
    structured: {
      selection: "single",
      variants: [
        { id: "flameJet", label: "Flame jet", type: "md", base: "5D6", note: "On a failed dodge." },
      ],
    },
  },
];

const specialOnlyDamageIds = [
  "fist-of-fury",
  "house-of-glass",
  "lifeblast",
  "agony",
  "life-drain",
  "desiccate-the-supernatural",
  "deathword",
] as const;

const healingRows: readonly { id: string; prose: string; structured: SpellHealing }[] = [
  {
    id: "light-healing",
    prose:
      "Channels healing energy by touch: restores 1D6 S.D.C. or 1D4 Hit Points (not both). Cannot be used on oneself.",
    structured: {
      hitPoints: "1D4",
      sdc: "1D6",
      target: "touch",
      exclusive: true,
      othersOnly: true,
    },
  },
  {
    id: "heal-wounds",
    prose:
      "Instantly heals minor physical wounds (cuts, gashes, bullet wounds, burns): restores 3D6 S.D.C. and 1D6 Hit Points.",
    structured: { hitPoints: "1D6", sdc: "3D6", target: "touch" },
  },
  {
    id: "heal-self",
    prose:
      "A minute of meditative chant washes the mage with mystic energy: restores 3D6 S.D.C. and 1D6 Hit Points, healing cuts, bruises, and broken bones.",
    structured: { hitPoints: "1D6", sdc: "3D6", target: "self" },
  },
  {
    id: "greater-healing",
    prose:
      "Instantly heals external and internal injuries: restores up to 2D4x10 S.D.C. and 6D6 Hit Points; never above the target's original maximums.",
    structured: { hitPoints: "6D6", sdc: "2D4*10", target: "touch", othersOnly: true },
  },
  {
    id: "restoration",
    prose:
      "Instantly and completely heals all wounds — full S.D.C. and Hit Points, mended bones, even severed limbs restored (within 48 hours).",
    structured: { full: true, target: "touch" },
  },
];

describe("spell content prose/structure correspondence", () => {
  test("pins every finite damage expression beside its exact display prose", () => {
    expectCorrespondence(
      structuredDamageRows,
      (spell) => spell.damage,
      (spell) => spell.damageEffect,
    );
  });

  test("pins every healing structure beside its exact display description", () => {
    expectCorrespondence(
      healingRows,
      (spell) => spell.description,
      (spell) => spell.healing,
    );
  });

  test("classifies every current spell with damage prose exactly once", () => {
    const structuredIds = structuredDamageRows.map((row) => row.id);
    expect(structuredIds.filter((id) => specialOnlyDamageIds.includes(id as never))).toEqual([]);
    expect([...structuredIds, ...specialOnlyDamageIds].sort()).toEqual(
      spellBook.spells
        .filter((spell) => spell.damage !== undefined)
        .map((spell) => spell.id)
        .sort(),
    );
    for (const id of specialOnlyDamageIds) expect(getSpell(id)?.damageEffect, id).toBeUndefined();
  });
});

function requireSpell(id: string): Spell {
  const spell = getSpell(id);
  if (!spell) throw new Error(`Missing test spell ${id}.`);
  return spell;
}

describe("deriveSpellDamage", () => {
  test("returns undefined for a spell without finite structured damage", () => {
    expect(
      deriveSpellDamage(requireSpell("globe-of-daylight"), { casterLevel: 1 }),
    ).toBeUndefined();
  });

  test("requires and resolves environment context", () => {
    const spell = requireSpell("energy-bolt");
    expect(() => deriveSpellDamage(spell, { casterLevel: 1 })).toThrow(/environment/i);
    expect(() =>
      deriveSpellDamage(spell, { casterLevel: 1, environment: "rift" as never }),
    ).toThrow(/environment/i);
    expect(deriveSpellDamage(spell, { casterLevel: 1, environment: "normal" })).toMatchObject({
      variantId: "normal",
      type: "sdc",
      displayFormula: "4D6",
      bonus: 0,
    });
    expect(deriveSpellDamage(spell, { casterLevel: 1, environment: "leyLine" })).toMatchObject({
      variantId: "leyLine",
      displayFormula: "6D6",
    });
    expect(deriveSpellDamage(spell, { casterLevel: 1, environment: "nexus" })).toMatchObject({
      variantId: "nexus",
      displayFormula: "8D6",
    });
    expect(() =>
      deriveSpellDamage(spell, { casterLevel: 1, environment: "normal", variantId: "normal" }),
    ).toThrow(/variantId.*environment/i);
  });

  test("requires and resolves a caster choice", () => {
    const spell = requireSpell("fire-bolt");
    expect(() => deriveSpellDamage(spell, { casterLevel: 1 })).toThrow(/variantId/i);
    expect(() => deriveSpellDamage(spell, { casterLevel: 1, variantId: "cold" })).toThrow(
      /unknown.*variant/i,
    );
    expect(deriveSpellDamage(spell, { casterLevel: 1, variantId: "megaDamage" })).toMatchObject({
      variantId: "megaDamage",
      type: "md",
      displayFormula: "4D6",
    });
    expect(
      deriveSpellDamage(spell, { casterLevel: 1, variantId: "structuralDamage" }),
    ).toMatchObject({ variantId: "structuralDamage", type: "sdc", displayFormula: "1D6*10" });
  });

  test("expands per-level and delayed every-two-level scaling without RNG", () => {
    expect(deriveSpellDamage(requireSpell("call-lightning"), { casterLevel: 3 })).toMatchObject({
      components: [
        {
          formula: "1D6",
          repetitions: 3,
          parsed: { count: 1, sides: 6, multiplier: 1, modifier: 0 },
        },
      ],
      displayFormula: "1D6 + 1D6 + 1D6",
    });
    for (const [level, maximumDiceCount] of [
      [1, 2],
      [2, 2],
      [3, 3],
      [4, 3],
      [5, 4],
    ] as const) {
      expect(
        deriveSpellDamage(requireSpell("ley-line-tendril-bolts"), { casterLevel: level }),
      ).toMatchObject({ maximumDiceCount, selectedDiceCount: maximumDiceCount });
    }
    expect(deriveSpellDamage(requireSpell("lightning-arc"), { casterLevel: 3 })).toMatchObject({
      components: [
        { formula: "4D6", repetitions: 1 },
        { formula: "2", repetitions: 3 },
      ],
      displayFormula: "4D6 + 2 + 2 + 2",
    });
  });

  test("regulates Tendril dice and attaches only explicitly selected bonuses", () => {
    const spell = requireSpell("ley-line-tendril-bolts");
    expect(deriveSpellDamage(spell, { casterLevel: 5, diceCount: 1 })).toMatchObject({
      components: [
        {
          formula: "1D6",
          repetitions: 1,
          parsed: { count: 1, sides: 6, multiplier: 1, modifier: 0 },
        },
      ],
      maximumDiceCount: 4,
      selectedDiceCount: 1,
      optionalBonuses: [],
      bonus: 0,
      displayFormula: "1D6",
    });
    expect(
      deriveSpellDamage(spell, {
        casterLevel: 5,
        diceCount: 3,
        optionalBonusIds: ["doublePpe"],
      }),
    ).toMatchObject({
      components: [{ formula: "3D6", repetitions: 1 }],
      maximumDiceCount: 4,
      selectedDiceCount: 3,
      optionalBonuses: [{ id: "doublePpe", label: "Double P.P.E.", amount: 20 }],
      bonus: 20,
      displayFormula: "3D6 + 20",
    });
    expect(() => deriveSpellDamage(spell, { casterLevel: 5, diceCount: 0 })).toThrow(/diceCount/i);
    expect(() => deriveSpellDamage(spell, { casterLevel: 5, diceCount: 5 })).toThrow(/maximum/i);
    expect(() => deriveSpellDamage(spell, { casterLevel: 5, diceCount: 2.5 })).toThrow(/integer/i);
    expect(() =>
      deriveSpellDamage(spell, { casterLevel: 5, optionalBonusIds: ["overcharge"] }),
    ).toThrow(/unknown.*bonus/i);
    expect(() =>
      deriveSpellDamage(spell, {
        casterLevel: 5,
        optionalBonusIds: ["doublePpe", "doublePpe"],
      }),
    ).toThrow(/duplicate.*bonus/i);
  });

  test("rejects invalid levels and choices that contradict the selection mode", () => {
    expect(() => deriveSpellDamage(requireSpell("fire-ball"), { casterLevel: 0 })).toThrow(
      /casterLevel.*positive/i,
    );
    expect(() => deriveSpellDamage(requireSpell("fire-ball"), { casterLevel: 1.5 })).toThrow(
      /casterLevel.*integer/i,
    );
    expect(() =>
      deriveSpellDamage(requireSpell("fire-ball"), { casterLevel: 1, environment: "normal" }),
    ).toThrow(/environment.*single/i);
    expect(() =>
      deriveSpellDamage(requireSpell("fire-ball"), { casterLevel: 1, diceCount: 1 }),
    ).toThrow(/not adjustable/i);
    const stepped = spellSchema.parse({
      id: "stepped-test",
      name: "Stepped Test",
      level: 1,
      ppe: 1,
      range: "Self",
      duration: "Instant",
      savingThrow: "none",
      damage: "Up to 5D6 M.D. in two-die steps",
      damageEffect: {
        selection: "single",
        variants: [
          {
            id: "default",
            type: "md",
            base: "5D6",
            adjustableDiceCount: { minimum: 1, step: 2 },
          },
        ],
      },
      page: 1,
    });
    expect(() => deriveSpellDamage(stepped, { casterLevel: 1, diceCount: 2 })).toThrow(
      /steps of 2/i,
    );
    expect(deriveSpellDamage(stepped, { casterLevel: 1, diceCount: 3 })).toMatchObject({
      selectedDiceCount: 3,
      displayFormula: "3D6",
    });
  });
});
