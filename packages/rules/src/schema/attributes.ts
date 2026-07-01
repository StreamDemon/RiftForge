import { z } from "zod";

/**
 * The eight Rifts attributes, in book order (Rifts Ultimate Edition, p.279+):
 * I.Q., M.E., M.A., P.S., P.P., P.E., P.B., Spd.
 */
export const ATTRIBUTE_CODES = ["IQ", "ME", "MA", "PS", "PP", "PE", "PB", "Spd"] as const;

export const attributeCodeSchema = z.enum(ATTRIBUTE_CODES);
export type AttributeCode = z.infer<typeof attributeCodeSchema>;

/** Where a piece of rules content was transcribed from, for traceability. */
export const sourceRefSchema = z.object({
  book: z.string().min(1),
  page: z.number().int().positive(),
  table: z.string().optional(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

/**
 * A single bonus track that scales with an attribute's value.
 *
 * One row of the Attribute Bonus Chart. `byValue` tabulates the bonus for each
 * attribute value the chart covers (16..30 in RUE); `appliesTo` names the
 * canonical derived-stat target(s) the bonus feeds — e.g. P.P.'s "parry and
 * dodge" row applies to both `parry` and `dodge`.
 */
export const attributeEffectSchema = z.object({
  /** Stable id, unique within the attribute (e.g. "strike", "saveVsInsanity"). */
  id: z.string().min(1),
  /** Human-readable label, as printed in the book. */
  label: z.string().min(1),
  /** `flat` = a raw +N modifier; `percent` = a percentage value/target. */
  unit: z.enum(["flat", "percent"]),
  /** Canonical derived-stat target(s) this effect feeds. */
  appliesTo: z.array(z.string().min(1)).min(1),
  /** Attribute value (as a string key) -> bonus. Tabulated across the chart's range. */
  byValue: z.record(z.string().regex(/^\d+$/), z.number()),
});
export type AttributeEffect = z.infer<typeof attributeEffectSchema>;

export const attributeDefinitionSchema = z.object({
  code: attributeCodeSchema,
  /** Full attribute name, e.g. "Physical Prowess". */
  name: z.string().min(1),
  effects: z.array(attributeEffectSchema),
});
export type AttributeDefinition = z.infer<typeof attributeDefinitionSchema>;

/** The whole Attribute Bonus Chart as structured, validated data. */
export const attributeBonusChartSchema = z.object({
  source: sourceRefSchema,
  /** Below this value an attribute grants no bonus (16 in RUE). */
  minValueForBonus: z.number().int(),
  /** Highest value the chart tabulates (30 in RUE); above it, the
   * "Attributes Beyond Thirty" rules apply and are handled separately. */
  maxTabulatedValue: z.number().int(),
  attributes: z.array(attributeDefinitionSchema),
});
export type AttributeBonusChart = z.infer<typeof attributeBonusChartSchema>;
