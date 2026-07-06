import type { Occ } from "../schema/occ.ts";
import { recoverySchema, type RestMode } from "../schema/recovery.ts";
import recoveryRaw from "../content/combat/recovery.json" with { type: "json" };

export const recovery = recoverySchema.parse(recoveryRaw);

/** Elapsed time is GM-adjudicated *input* (hours rested, melees on the line,
 * days treated) — it must be a whole, non-negative count. */
function requireCount(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, got ${value}.`);
  }
}

/**
 * P.P.E. recovered per hour of rest or meditation (RUE p.186: ~5 resting,
 * 10 meditating), honoring the O.C.C.'s own printed rates when it has them
 * (e.g. the Ley Line Walker rests at 7/15).
 */
export function ppeRecoveryRate(mode: RestMode, occ?: Occ): number {
  return mode === "meditation"
    ? (occ?.ppe?.recoveryPerHourMeditation ?? recovery.ppe.perHourMeditation)
    : (occ?.ppe?.recoveryPerHourRest ?? recovery.ppe.perHourRest);
}

/**
 * Raw P.P.E. recovered over `hours` of rest or meditation. Unclamped — the
 * "never above the permanent base" rule lives where live pools are written
 * (the backend's heal path), like all clamping.
 */
export function restRecovery(hours: number, mode: RestMode, occ?: Occ): number {
  requireCount("hours", hours);
  return hours * ppeRecoveryRate(mode, occ);
}

/**
 * Supplemental P.P.E. a practitioner of magic draws per melee round while
 * standing on a ley line (or at a nexus), honoring the O.C.C. override —
 * the Ley Line Walker draws double (RUE p.186).
 */
export function leyLineDrawRate(atNexus: boolean, occ?: Occ): number {
  return atNexus
    ? (occ?.ppe?.supplementalAtNexusPerMelee ?? recovery.ppe.leyLineDraw.perMeleeAtNexus)
    : (occ?.ppe?.supplementalOnLeyLinePerMelee ?? recovery.ppe.leyLineDraw.perMeleeOnLine);
}

/** Raw P.P.E. drawn over `melees` rounds on a ley line or at a nexus. Unclamped. */
export function leyLineDraw(melees: number, atNexus: boolean, occ?: Occ): number {
  requireCount("melees", melees);
  return melees * leyLineDrawRate(atNexus, occ);
}

export interface TreatmentRecovery {
  hitPoints: number;
  sdc: number;
}

/**
 * Raw H.P./S.D.C. recovered over `days` of treatment (RUE p.354). Professional
 * care ramps — 2 H.P. per day for the first two days of the course, then 4 —
 * so *which* days these are matters: `daysAlreadyTreated` says how far into
 * the course the character already is. Non-professional care is flat
 * (2 H.P. / 4 S.D.C. per day). Unclamped, like the other rates.
 */
export function treatmentRecovery(
  days: number,
  professional: boolean,
  daysAlreadyTreated = 0,
): TreatmentRecovery {
  requireCount("days", days);
  requireCount("daysAlreadyTreated", daysAlreadyTreated);
  const t = recovery.treatment;
  if (!professional) {
    return {
      hitPoints: days * t.nonProfessional.hitPointsPerDay,
      sdc: days * t.nonProfessional.sdcPerDay,
    };
  }
  // How many of these days fall inside the two-day ramp-up window.
  const rampDays = Math.max(0, Math.min(2 - daysAlreadyTreated, days));
  const hitPoints =
    rampDays * t.professional.hitPointsPerDayFirstTwoDays +
    (days - rampDays) * t.professional.hitPointsPerDayAfter;
  return { hitPoints, sdc: days * t.professional.sdcPerDay };
}
