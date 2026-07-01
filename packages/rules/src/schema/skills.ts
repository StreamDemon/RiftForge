import { z } from "zod";

/**
 * A single skill's rules. A skill's proficiency at level L is:
 *   min(maxPercent, baseSkill + O.C.C. bonus + I.Q. bonus + category bonus
 *                   + perLevel * (L - 1))
 * Some skills list two percentages (e.g. History, Track & Trap Animals) — the
 * second is carried in `baseSkill2` and grows at the same per-level rate.
 */
export const skillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** RUE skill category, e.g. "Wilderness", "Technical", "Communication". */
  category: z.string(),
  /** Base skill percentage at level 1 (before any bonuses). */
  baseSkill: z.number().int(),
  /** Second base percentage for two-value skills. */
  baseSkill2: z.number().int().optional(),
  /** Percent gained per experience level (0 for fixed skills). */
  perLevel: z.number().int(),
  /** True for flat skills that never grow with level (e.g. Native Tongue 98%). */
  fixed: z.boolean().optional(),
  /** Prerequisite skill ids/names, if any. */
  requires: z.array(z.string()).optional(),
  note: z.string().optional(),
  /** Printed page in the source book. */
  page: z.number().int().positive(),
});
export type Skill = z.infer<typeof skillSchema>;

export const skillCatalogSchema = z.object({
  book: z.string().min(1),
  /** Hard ceiling any skill percentage is capped at (98% in RUE). */
  maxPercent: z.number().int(),
  skills: z.array(skillSchema),
});
export type SkillCatalog = z.infer<typeof skillCatalogSchema>;
