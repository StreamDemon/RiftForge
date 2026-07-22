import { occSchema, type Occ } from "../schema/occ.ts";
import leyLineWalkerRaw from "../content/occ/ley-line-walker.json" with { type: "json" };
import { diceAverage, diceMax, diceMin, rollDice, type Rng } from "./dice.ts";
import { getSpecies } from "./species.ts";

/** The Ley Line Walker O.C.C. (RUE pp.113-116), validated at load. */
export const leyLineWalker: Occ = occSchema.parse(leyLineWalkerRaw);

export function validateOccSpeciesReferences(occ: Occ): void {
  if (occ.speciesEligibility.kind === "any") return;
  for (const speciesId of occ.speciesEligibility.speciesIds) {
    if (getSpecies(speciesId) === undefined) {
      throw new Error(`O.C.C. "${occ.id}" references unknown species "${speciesId}".`);
    }
  }
}

validateOccSpeciesReferences(leyLineWalker);

/** All O.C.C.s currently modeled, keyed by id. */
export const occRegistry: Readonly<Record<string, Occ>> = {
  [leyLineWalker.id]: leyLineWalker,
};

export function getOcc(id: string): Occ | undefined {
  return occRegistry[id];
}

export interface PpeRange {
  min: number;
  max: number;
  average: number;
}

/**
 * The permanent P.P.E. an O.C.C. grants at a given level, as a range: the level-1
 * base plus the per-level gain for each level reached (matching `hitPointsRange`).
 * Returns zeros for O.C.C.s without P.P.E.
 */
export function ppeRange(occ: Occ, peAttribute: number, level: number): PpeRange {
  if (!occ.ppe) return { min: 0, max: 0, average: 0 };
  const add = occ.ppe.addPeAttribute ? peAttribute : 0;
  const { baseFormula, perLevelFormula, perLevelStartsAt } = occ.ppe;
  const perLevelGains = Math.max(0, level - perLevelStartsAt + 1);
  return {
    min: diceMin(baseFormula) + add + perLevelGains * diceMin(perLevelFormula),
    max: diceMax(baseFormula) + add + perLevelGains * diceMax(perLevelFormula),
    average: diceAverage(baseFormula) + add + perLevelGains * diceAverage(perLevelFormula),
  };
}

/** The level-1 permanent P.P.E. range (convenience wrapper over {@link ppeRange}). */
export function basePpeRange(occ: Occ, peAttribute: number): PpeRange {
  return ppeRange(occ, peAttribute, 1);
}

/**
 * Roll a concrete permanent P.P.E. total for a character at a given level:
 * the base formula plus one per-level roll for each level reached (the dice
 * counterpart of {@link ppeRange}). Returns 0 for O.C.C.s without P.P.E.
 */
export function rollPpe(
  occ: Occ,
  peAttribute: number,
  level: number,
  rng: Rng = Math.random,
): number {
  if (!occ.ppe) return 0;
  const add = occ.ppe.addPeAttribute ? peAttribute : 0;
  let ppe = rollDice(occ.ppe.baseFormula, rng) + add;
  for (let l = occ.ppe.perLevelStartsAt; l <= level; l++) {
    ppe += rollDice(occ.ppe.perLevelFormula, rng);
  }
  return ppe;
}

/** Roll a concrete level-1 permanent P.P.E. total for a character. */
export function rollBasePpe(occ: Occ, peAttribute: number, rng: Rng = Math.random): number {
  return rollPpe(occ, peAttribute, 1, rng);
}
