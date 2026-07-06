import { z } from "zod";
import { diceFormulaSchema } from "./dice.ts";

/** Who a healing spell can restore, per its printed "Range" line. */
export const healingTargetKindSchema = z.enum(["self", "touch", "ranged"]);
export type HealingTargetKind = z.infer<typeof healingTargetKindSchema>;

/**
 * Structured healing effect. The printed `damage` stays a display string, but
 * healing must be *applied* by the engine (rolled server-side, landed through
 * the clamped heal path), so its dice are structured and load-validated.
 */
export const spellHealingSchema = z
  .object({
    /** Hit Points restored (dice formula, e.g. "2D6"). */
    hitPoints: diceFormulaSchema.optional(),
    /** S.D.C. restored (dice formula). */
    sdc: diceFormulaSchema.optional(),
    target: healingTargetKindSchema,
    /** The spell restores ONE of the declared pools per cast, caster's
     * choice — e.g. Light Healing's "1D6 S.D.C. or 1D4 Hit Points". */
    exclusive: z.boolean().optional(),
    /** The spell cannot be cast on the caster (e.g. Light Healing). */
    othersOnly: z.boolean().optional(),
    /** Complete restoration: both pools return to their maximums, no dice
     * (Restoration, RUE p.224). Mutually exclusive with dice pools. */
    full: z.boolean().optional(),
  })
  .refine((h) => h.full === true || h.hitPoints !== undefined || h.sdc !== undefined, {
    message: "A healing effect must restore hitPoints, sdc, or be a full restoration.",
  })
  .refine((h) => h.exclusive !== true || (h.hitPoints !== undefined && h.sdc !== undefined), {
    message: "An exclusive healing effect needs both pools to choose between.",
  })
  .refine((h) => h.full !== true || (h.hitPoints === undefined && h.sdc === undefined), {
    message: "A full restoration cannot also declare dice pools.",
  })
  .refine((h) => !(h.othersOnly === true && h.target === "self"), {
    message: "An others-only healing effect cannot target self — it would be uncastable.",
  });
export type SpellHealing = z.infer<typeof spellHealingSchema>;

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
  /** The numeric P.P.E. cost that casting/affordability checks charge. For
   * variable or conditional printed costs this is the book's headline number
   * — see `ppeNote` for the full printed rule (which may go lower OR higher). */
  ppe: z.number().int().nonnegative(),
  /** Printed cost rule when the P.P.E. cost is variable or conditional
   * (e.g. "Two P.P.E. per five pounds", "half for Ley Line Walkers"). */
  ppeNote: z.string().optional(),
  /** Range as printed (e.g. "150 feet", "Self", "Touch"). */
  range: z.string().min(1),
  /** Duration as printed (e.g. "Instant", "12 melees per level"). */
  duration: z.string().min(1),
  savingThrow: savingThrowKindSchema,
  /** Clarifier for the save (e.g. "dodge of 18 or higher"). */
  savingThrowNote: z.string().optional(),
  /** Damage expression as printed, if the spell deals damage. */
  damage: z.string().optional(),
  /** Structured healing effect, if the spell restores H.P./S.D.C.
   * (None in the level 1-4 catalog; arrives with the level 5-15 spells.) */
  healing: spellHealingSchema.optional(),
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
