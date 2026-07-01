import { z } from "zod";
import { attributeCodeSchema, sourceRefSchema } from "./attributes.ts";

/** Hit Points and Physical S.D.C. generation rules. */
export const vitalsSchema = z.object({
  source: sourceRefSchema,
  hitPoints: z.object({
    /** Attribute whose value forms the H.P. base (P.E. in RUE). */
    baseAttribute: attributeCodeSchema,
    /** Dice added to the base attribute at level 1 (e.g. "1D6"). */
    baseBonusFormula: z.string(),
    /** Dice gained per level (e.g. "1D6"). */
    perLevelFormula: z.string(),
    perLevelStartsAt: z.number().int(),
    /** Attribute whose value sets the negative-H.P. coma/death floor. */
    comaDeathFloorAttribute: attributeCodeSchema,
    notes: z.string().optional(),
  }),
  physicalSdc: z.object({
    baseFormula: z.string(),
    notes: z.string().optional(),
  }),
});
export type Vitals = z.infer<typeof vitalsSchema>;

/** One experience level's accumulative Hand-to-Hand bonuses. */
export const handToHandLevelSchema = z.object({
  level: z.number().int(),
  /** Attacks at this level (informational; usually only on level 1). */
  attacks: z.number().int().optional(),
  /** Attacks added at this level. */
  addAttacks: z.number().int().optional(),
  nonCombatActions: z.number().int().optional(),
  addNonCombatActions: z.number().int().optional(),
  /** Combat-action bonuses added at this level (strike, parry, dodge, damage, ...). */
  bonuses: z.record(z.string(), z.number()).optional(),
  note: z.string().optional(),
});

export const handToHandTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseAttacks: z.number().int(),
  levels: z.array(handToHandLevelSchema),
});
export type HandToHandType = z.infer<typeof handToHandTypeSchema>;

export const handToHandSchema = z.object({
  source: sourceRefSchema,
  note: z.string().optional(),
  types: z.array(handToHandTypeSchema),
});
export type HandToHand = z.infer<typeof handToHandSchema>;

/** A save with a fixed target, or a range when it varies by source power. */
export const saveTargetSchema = z.object({
  kind: z.string(),
  label: z.string(),
  target: z.number().int().optional(),
  targetRange: z.object({ min: z.number().int(), max: z.number().int() }).optional(),
  note: z.string().optional(),
});

export const savingThrowsSchema = z.object({
  source: sourceRefSchema,
  targets: z.array(saveTargetSchema),
  acids: z.object({ save: z.boolean(), note: z.string().optional() }).optional(),
  /** Save vs psionics: the target depends on the SAVER's psychic class. */
  psionics: z.object({
    label: z.string(),
    note: z.string().optional(),
    bySaverClass: z.array(
      z.object({
        saverClass: z.string(),
        target: z.number().int(),
        examples: z.array(z.string()).optional(),
        note: z.string().optional(),
      }),
    ),
  }),
});
export type SavingThrows = z.infer<typeof savingThrowsSchema>;
