import { z } from "zod";
import { attributeCodeSchema, sourceRefSchema } from "./attributes.ts";
import { diceFormulaSchema } from "./dice.ts";

/** A minimum attribute a character must have to take this O.C.C. */
export const attributeRequirementSchema = z.object({
  code: attributeCodeSchema,
  min: z.number().int().positive(),
});

/** How this O.C.C. generates and recovers P.P.E. (Potential Psychic Energy). */
export const ppeSchema = z.object({
  /** Dice formula for permanent base P.P.E. at level 1 (e.g. "3D6*10+20"). */
  baseFormula: diceFormulaSchema,
  /** Whether the character's P.E. attribute number is added to the base. */
  addPeAttribute: z.boolean(),
  /** Dice formula gained per level (e.g. "3D6"). */
  perLevelFormula: diceFormulaSchema,
  /** First level at which the per-level P.P.E. is gained. */
  perLevelStartsAt: z.number().int().positive(),
  recoveryPerHourRest: z.number().nonnegative(),
  recoveryPerHourMeditation: z.number().nonnegative(),
  supplementalOnLeyLinePerMelee: z.number().nonnegative().optional(),
  supplementalAtNexusPerMelee: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

/** Rules for which spells this O.C.C. starts with and gains on level-up. */
export const spellKnowledgeSchema = z.object({
  initial: z.object({
    /** How many spells are chosen from each listed spell level. */
    fromEachLevel: z.number().int(),
    /** The spell levels a starting character draws from. */
    spellLevels: z.array(z.number().int()),
    total: z.number().int().optional(),
  }),
  perLevelUp: z
    .object({
      count: z.number().int(),
      /** A number, or "characterLevel" to cap at the caster's own level. */
      maxSpellLevel: z.union([z.number().int(), z.literal("characterLevel")]),
      note: z.string().optional(),
    })
    .optional(),
  startsWithRiftLeyLineMagic: z.boolean().optional(),
  notes: z.string().optional(),
});

/** A skill/save/other bonus granted by the O.C.C., optionally gated to levels. */
export const occBonusSchema = z
  .object({
    type: z.string(),
    target: z.string().optional(),
    value: z.number().optional(),
    atLevels: z.array(z.number().int()).optional(),
    detail: z.string().optional(),
    note: z.string().optional(),
  })
  .catchall(z.unknown());

/** Level at which a fixed number of extra skill picks are granted. */
const skillProgressionSchema = z.object({
  level: z.number().int(),
  count: z.number().int(),
});

export const occRelatedSkillsSchema = z.object({
  count: z.number().int(),
  constraints: z.array(z.object({ fromCategory: z.string(), min: z.number().int() })).optional(),
  progression: z.array(skillProgressionSchema).optional(),
  newSkillsStartAtLevel1: z.boolean().optional(),
  categoryRules: z
    .array(
      z.object({
        category: z.string(),
        /** Which skills of the category are permitted (free text for now). */
        allowed: z.string(),
        /** Flat percentage O.C.C. bonus applied to skills taken from it. */
        bonus: z.number().optional(),
      }),
    )
    .optional(),
});

export const secondarySkillsSchema = z.object({
  count: z.number().int(),
  progression: z.array(skillProgressionSchema).optional(),
  notes: z.string().optional(),
});

export const moneySchema = z.object({
  /** Dice formula for starting credits (e.g. "1D4*1000"). */
  credits: diceFormulaSchema,
  blackMarketItems: diceFormulaSchema.optional(),
});

/**
 * A skill granted directly by the O.C.C. Kept loose on purpose: entries name a
 * skill (or a category to choose from) plus O.C.C. bonuses and choice rules,
 * which the skills subsystem will resolve into concrete percentages later.
 */
export const occSkillGrantSchema = z.object({ skill: z.string() }).catchall(z.unknown());

/** A special O.C.C. ability. Rich/descriptive; only `name` is required. */
export const occAbilitySchema = z.object({ name: z.string() }).catchall(z.unknown());

export const speciesEligibilitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("any") }),
  z.object({
    kind: z.literal("oneOf"),
    speciesIds: z
      .array(z.string().min(1))
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "O.C.C. species eligibility cannot contain duplicate ids.",
      }),
  }),
]);
export type SpeciesEligibility = z.infer<typeof speciesEligibilitySchema>;

/** A full Occupational Character Class entry. */
export const occSchema = z
  .object({
    source: sourceRefSchema,
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.string(),
    description: z.string().optional(),
    alignment: z.string(),
    attributeRequirements: z.array(attributeRequirementSchema),
    speciesEligibility: speciesEligibilitySchema,
    racialRequirement: z.never().optional(),
    concealedBodyArmor: z.unknown().optional(),
    ppe: ppeSchema.optional(),
    spellKnowledge: spellKnowledgeSchema.optional(),
    abilities: z.array(occAbilitySchema).optional(),
    occSkills: z.array(occSkillGrantSchema).optional(),
    occRelatedSkills: occRelatedSkillsSchema.optional(),
    secondarySkills: secondarySkillsSchema.optional(),
    bonuses: z.array(occBonusSchema).optional(),
    standardEquipment: z.array(z.string()).optional(),
    weapons: z.string().optional(),
    vehicle: z.string().optional(),
    money: moneySchema.optional(),
    cybernetics: z.string().optional(),
  })
  .catchall(z.unknown());

export type AttributeRequirement = z.infer<typeof attributeRequirementSchema>;
export type Ppe = z.infer<typeof ppeSchema>;
export type SpellKnowledge = z.infer<typeof spellKnowledgeSchema>;
export type Occ = z.infer<typeof occSchema>;
