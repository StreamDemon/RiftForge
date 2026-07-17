import { z } from "zod";

export const defenseKindSchema = z.enum(["parry", "dodge", "autoDodge"]);
export type DefenseKind = z.infer<typeof defenseKindSchema>;

export const combatResolutionRulesSchema = z.object({
  book: z.string().min(1),
  page: z.number().int().positive(),
  meleeSeconds: z.number().int().positive(),
  automaticMissAtOrBelow: z.number().int().min(1).max(20),
  sdcPerMd: z.number().int().positive(),
  naturalTwentyDamageMultiplier: z.literal(2),
});
export type CombatResolutionRules = z.infer<typeof combatResolutionRulesSchema>;
