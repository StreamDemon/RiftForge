import { occSchema, type Occ } from "../schema/occ.ts";
import leyLineWalkerRaw from "../content/occ/ley-line-walker.json" with { type: "json" };
import { diceAverage, diceMax, diceMin, rollDice, type Rng } from "./dice.ts";

/** The Ley Line Walker O.C.C. (RUE pp.113-116), validated at load. */
export const leyLineWalker: Occ = occSchema.parse(leyLineWalkerRaw);

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
 * The level-1 permanent P.P.E. an O.C.C. grants, as a range, given the
 * character's P.E. attribute. Returns zeros for O.C.C.s without P.P.E.
 */
export function basePpeRange(occ: Occ, peAttribute: number): PpeRange {
  if (!occ.ppe) return { min: 0, max: 0, average: 0 };
  const add = occ.ppe.addPeAttribute ? peAttribute : 0;
  return {
    min: diceMin(occ.ppe.baseFormula) + add,
    max: diceMax(occ.ppe.baseFormula) + add,
    average: diceAverage(occ.ppe.baseFormula) + add,
  };
}

/** Roll a concrete level-1 permanent P.P.E. total for a character. */
export function rollBasePpe(occ: Occ, peAttribute: number, rng: Rng = Math.random): number {
  if (!occ.ppe) return 0;
  const add = occ.ppe.addPeAttribute ? peAttribute : 0;
  return rollDice(occ.ppe.baseFormula, rng) + add;
}
