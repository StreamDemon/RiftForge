import { z } from "zod";

/** A skill the character has taken, with the O.C.C./category bonuses that apply. */
export const characterSkillSchema = z.object({
  skillId: z.string().min(1),
  occBonus: z.number().int().optional(),
  categoryBonus: z.number().int().optional(),
  /** O.C.C.-granted flat value that replaces the computed percentage
   * (e.g. Ley Line Walker: Language: Native Tongue at 98%). */
  overrideValue: z.number().int().positive().optional(),
  /** Distinguishes repeated picks of a repeatable skill (e.g. which language). */
  label: z.string().min(1).optional(),
});
export type CharacterSkill = z.infer<typeof characterSkillSchema>;

/** The eight rolled attributes (I.Q., M.E., M.A., P.S., P.P., P.E., P.B., Spd). */
export const characterAttributesSchema = z.object({
  IQ: z.number().int().positive(),
  ME: z.number().int().positive(),
  MA: z.number().int().positive(),
  PS: z.number().int().positive(),
  PP: z.number().int().positive(),
  PE: z.number().int().positive(),
  PB: z.number().int().positive(),
  Spd: z.number().int().positive(),
});
export type CharacterAttributes = z.infer<typeof characterAttributesSchema>;

/** Psychic aptitude, which sets the save-vs-psionics target (RUE p.346/348). */
export const psychicClassSchema = z.enum(["masterPsychic", "majorOrMinorPsychic", "ordinary"]);
export type PsychicClass = z.infer<typeof psychicClassSchema>;

/**
 * A built character — the player's *choices*. Derived stats (bonuses, attacks,
 * save targets, resolved skill %s, spell strength, …) are computed by
 * `deriveSheet`, never stored. Optional `rolled` values pin the dice results
 * that would otherwise be shown as a range.
 */
export const characterSchema = z.object({
  name: z.string().min(1),
  occId: z.string().min(1),
  /** One of the seven canonical alignments (RUE pp.289-292). Optional because
   * characters stored before the alignment step existed have none; resolved
   * (and unknown ids rejected) in `deriveSheet`, like occ/skill/spell ids. */
  alignmentId: z.string().min(1).optional(),
  level: z.number().int().positive(),
  attributes: characterAttributesSchema,
  /** Hand-to-Hand combat type id (e.g. "basic"). */
  hthType: z.string().min(1),
  /** The character's psychic aptitude (sets the save-vs-psionics target). */
  psychicClass: psychicClassSchema.default("ordinary"),
  /** Duplicate skillIds are checked in `deriveSheet`, where the catalog's
   * per-skill `repeatable` flag is available (schemas can't see content). */
  skills: z.array(characterSkillSchema).default([]),
  spellIds: z
    .array(z.string().min(1))
    .refine((arr) => new Set(arr).size === arr.length, {
      message: "A spell cannot be known twice (duplicate spellId).",
    })
    .default([]),
  rolled: z
    .object({
      hitPoints: z.number().int().positive().optional(),
      sdc: z.number().int().nonnegative().optional(),
      ppe: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
/** A fully-resolved character (defaulted fields present) — e.g. after parsing/from storage. */
export type Character = z.infer<typeof characterSchema>;
/** Character input for `deriveSheet` — defaulted fields (psychicClass/skills/spellIds) may be omitted. */
export type CharacterInput = z.input<typeof characterSchema>;
