import { describe, expect, test } from "vite-plus/test";
import { spellDamageEffectSchema } from "../src/index.ts";

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
