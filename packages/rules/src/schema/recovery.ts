import { z } from "zod";
import { sourceRefSchema } from "./attributes.ts";

/**
 * Book-default recovery rates. P.P.E. rates are *defaults*: an O.C.C. may
 * override them via its `ppe` block (`recoveryPerHourRest`,
 * `recoveryPerHourMeditation`, `supplementalOnLeyLinePerMelee`,
 * `supplementalAtNexusPerMelee`) — e.g. the Ley Line Walker rests faster and
 * draws double from ley lines.
 */
export const recoverySchema = z.object({
  ppe: z.object({
    source: sourceRefSchema,
    /** P.P.E. recovered per hour of ordinary rest or sleep. */
    perHourRest: z.number().nonnegative(),
    /** P.P.E. recovered per hour of meditation. */
    perHourMeditation: z.number().nonnegative(),
    /** Supplemental draw for practitioners of magic standing on a ley line. */
    leyLineDraw: z.object({
      perMeleeOnLine: z.number().nonnegative(),
      perMeleeAtNexus: z.number().nonnegative(),
      notes: z.string().optional(),
    }),
    notes: z.string().optional(),
  }),
  treatment: z.object({
    source: sourceRefSchema,
    nonProfessional: z.object({
      hitPointsPerDay: z.number().nonnegative(),
      sdcPerDay: z.number().nonnegative(),
    }),
    professional: z.object({
      hitPointsPerDayFirstTwoDays: z.number().nonnegative(),
      hitPointsPerDayAfter: z.number().nonnegative(),
      sdcPerDay: z.number().nonnegative(),
    }),
    notes: z.string().optional(),
  }),
});
export type Recovery = z.infer<typeof recoverySchema>;

/** How the character spends the recovery hours: ordinary rest/sleep, or meditation. */
export const restModeSchema = z.enum(["rest", "meditation"]);
export type RestMode = z.infer<typeof restModeSchema>;
