import { z } from "zod";
import { parseDice, type DiceFormula } from "../engine/dice.ts";
import { damageTypeSchema } from "./damage.ts";
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

export const spellDamageSelectionSchema = z.enum(["single", "casterChoice", "environment"]);
export type SpellDamageSelection = z.infer<typeof spellDamageSelectionSchema>;

export const spellDamageEnvironmentSchema = z.enum(["normal", "leyLine", "nexus"]);
export type SpellDamageEnvironment = z.infer<typeof spellDamageEnvironmentSchema>;

export const spellDamageScalingSchema = z.object({
  formula: diceFormulaSchema,
  startsAtLevel: z.number().int().positive(),
  everyLevels: z.number().int().positive(),
});
export type SpellDamageScaling = z.infer<typeof spellDamageScalingSchema>;

export const adjustableDiceCountSchema = z.object({
  minimum: z.number().int().positive(),
  step: z.number().int().positive(),
});
export type AdjustableDiceCount = z.infer<typeof adjustableDiceCountSchema>;

export const spellDamageOptionalBonusSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  amount: z.number().int().positive(),
});
export type SpellDamageOptionalBonus = z.infer<typeof spellDamageOptionalBonusSchema>;

export const spellDamageVariantSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    type: damageTypeSchema,
    base: diceFormulaSchema.optional(),
    scaling: spellDamageScalingSchema.optional(),
    environment: spellDamageEnvironmentSchema.optional(),
    adjustableDiceCount: adjustableDiceCountSchema.optional(),
    optionalBonuses: z.array(spellDamageOptionalBonusSchema).optional(),
    note: z.string().min(1).optional(),
  })
  .superRefine((variant, ctx) => {
    if (variant.base === undefined && variant.scaling === undefined) {
      ctx.addIssue({ code: "custom", message: "A damage variant needs base or scaling damage." });
    }
    const bonusIds = variant.optionalBonuses?.map((bonus) => bonus.id) ?? [];
    if (new Set(bonusIds).size !== bonusIds.length) {
      ctx.addIssue({ code: "custom", message: "Optional damage bonus ids must be unique." });
    }
    if (variant.adjustableDiceCount !== undefined) {
      if (variant.base === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "Adjustable damage requires a base dice formula.",
        });
        return;
      }
      const formulas = [variant.base, variant.scaling?.formula].filter(
        (formula): formula is string => formula !== undefined,
      );
      let parsed: DiceFormula[];
      try {
        parsed = formulas.map(parseDice);
      } catch {
        // `diceFormulaSchema` reports the malformed formula on its own path.
        return;
      }
      const [first] = parsed;
      const safelyReducible =
        first !== undefined &&
        parsed.every(
          (formula) =>
            formula.count > 0 &&
            formula.sides === first.sides &&
            formula.multiplier === 1 &&
            formula.modifier === 0,
        );
      if (!safelyReducible) {
        ctx.addIssue({
          code: "custom",
          message: "Adjustable damage requires unmodified dice with matching sides.",
        });
      } else {
        const { minimum, step } = variant.adjustableDiceCount;
        if (minimum > first.count) {
          ctx.addIssue({
            code: "custom",
            message: "Adjustable minimum cannot exceed the base dice count.",
          });
        } else if ((first.count - minimum) % step !== 0) {
          ctx.addIssue({
            code: "custom",
            message: "Adjustable base dice count must align with its minimum and step.",
          });
        }
        const scaling = parsed[1];
        if (scaling !== undefined && scaling.count % step !== 0) {
          ctx.addIssue({
            code: "custom",
            message: "Adjustable scaling dice count must preserve the declared step grid.",
          });
        }
      }
    }
  });
export type SpellDamageVariant = z.infer<typeof spellDamageVariantSchema>;

export const spellDamageEffectSchema = z
  .object({
    selection: spellDamageSelectionSchema,
    variants: z.array(spellDamageVariantSchema).min(1),
  })
  .superRefine((effect, ctx) => {
    const ids = effect.variants.map((variant) => variant.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "Damage variant ids must be unique." });
    }
    if (effect.selection === "single" && effect.variants.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "A single damage effect needs exactly one variant.",
      });
    }
    if (effect.selection === "casterChoice" && effect.variants.length < 2) {
      ctx.addIssue({
        code: "custom",
        message: "Caster-choice damage needs at least two variants.",
      });
    }
    if (effect.selection !== "environment") {
      if (effect.variants.some((variant) => variant.environment !== undefined)) {
        ctx.addIssue({
          code: "custom",
          message: "Only environment-selected damage may declare environments.",
        });
      }
      return;
    }
    const environments = effect.variants.map((variant) => variant.environment);
    if (environments.some((environment) => environment === undefined)) {
      ctx.addIssue({ code: "custom", message: "Every environment variant needs an environment." });
      return;
    }
    if (new Set(environments).size !== environments.length) {
      ctx.addIssue({ code: "custom", message: "Damage environments must be unique." });
    }
    const required = new Set<SpellDamageEnvironment>(["normal", "leyLine", "nexus"]);
    if (
      environments.length !== required.size ||
      environments.some((value) => !required.has(value!))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Environment damage needs exactly normal, leyLine, and nexus variants.",
      });
    }
  });
export type SpellDamageEffect = z.infer<typeof spellDamageEffectSchema>;

/** A single magic spell (invocation). */
export const spellSchema = z
  .object({
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
    /** Finite, rollable damage structure; printed `damage` remains display authority. */
    damageEffect: spellDamageEffectSchema.optional(),
    /** Structured healing effect, if the spell restores H.P./S.D.C.
     * (None in the level 1-4 catalog; arrives with the level 5-15 spells.) */
    healing: spellHealingSchema.optional(),
    description: z.string().optional(),
    page: z.number().int().positive(),
  })
  .superRefine((spell, ctx) => {
    if (spell.damageEffect !== undefined && spell.damage === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["damage"],
        message: "Structured damage requires authoritative printed damage prose.",
      });
    }
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
