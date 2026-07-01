import { z } from "zod";

/** How a target resists a spell, per the spell's "Saving Throw" line. */
export const savingThrowKindSchema = z.enum([
  "none",
  "standard",
  "dodge",
  "horrorFactor",
  "special",
]);
export type SavingThrowKind = z.infer<typeof savingThrowKindSchema>;

/** A single magic spell (invocation). */
export const spellSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Spell level (1-15). */
  level: z.number().int().min(1).max(15),
  /** P.P.E. cost to cast. */
  ppe: z.number().int().nonnegative(),
  /** Range as printed (e.g. "150 feet", "Self", "Touch"). */
  range: z.string().min(1),
  /** Duration as printed (e.g. "Instant", "12 melees per level"). */
  duration: z.string().min(1),
  savingThrow: savingThrowKindSchema,
  /** Clarifier for the save (e.g. "dodge of 18 or higher"). */
  savingThrowNote: z.string().optional(),
  /** Damage expression as printed, if the spell deals damage. */
  damage: z.string().optional(),
  description: z.string().optional(),
  page: z.number().int().positive(),
});
export type Spell = z.infer<typeof spellSchema>;

export const spellBookSchema = z.object({
  book: z.string().min(1),
  /** Base Spell Strength: the d20 number a victim must roll to save vs magic (RUE p.187). */
  spellStrengthBase: z.number().int().positive(),
  /** Save target vs ritual magic (RUE p.187). */
  ritualSaveTarget: z.number().int().positive(),
  spells: z.array(spellSchema),
});
export type SpellBook = z.infer<typeof spellBookSchema>;
