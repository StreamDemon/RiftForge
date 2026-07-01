import { z } from "zod";

/** A skill the character has taken, with the O.C.C./category bonuses that apply. */
export const characterSkillSchema = z.object({
  skillId: z.string().min(1),
  occBonus: z.number().int().optional(),
  categoryBonus: z.number().int().optional(),
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

/**
 * A built character — the player's *choices*. Derived stats (bonuses, attacks,
 * save targets, resolved skill %s, spell strength, …) are computed by
 * `deriveSheet`, never stored. Optional `rolled` values pin the dice results
 * that would otherwise be shown as a range.
 */
export const characterSchema = z.object({
  name: z.string().min(1),
  occId: z.string().min(1),
  level: z.number().int().positive(),
  attributes: characterAttributesSchema,
  /** Hand-to-Hand combat type id (e.g. "basic"). */
  hthType: z.string().min(1),
  skills: z.array(characterSkillSchema).default([]),
  spellIds: z.array(z.string().min(1)).default([]),
  rolled: z
    .object({
      hitPoints: z.number().int().positive().optional(),
      sdc: z.number().int().nonnegative().optional(),
      ppe: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
export type Character = z.infer<typeof characterSchema>;
