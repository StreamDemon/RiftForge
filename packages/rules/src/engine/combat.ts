import type { AttributeCode } from "../schema/attributes.ts";
import {
  handToHandSchema,
  savingThrowsSchema,
  vitalsSchema,
  type HandToHandType,
} from "../schema/combat.ts";
import vitalsRaw from "../content/combat/vitals.json" with { type: "json" };
import handToHandRaw from "../content/combat/hand-to-hand.json" with { type: "json" };
import savingThrowsRaw from "../content/combat/saving-throws.json" with { type: "json" };
import { deriveAttributeBonuses } from "./attributes.ts";
import { diceAverage, diceMax, diceMin, rollDice, type Rng } from "./dice.ts";

export const vitals = vitalsSchema.parse(vitalsRaw);
export const handToHand = handToHandSchema.parse(handToHandRaw);
export const savingThrows = savingThrowsSchema.parse(savingThrowsRaw);

const hthById = new Map<string, HandToHandType>(handToHand.types.map((t) => [t.id, t]));

export function getHandToHand(id: string): HandToHandType | undefined {
  return hthById.get(id);
}

/** Look up a Hand-to-Hand type, throwing on an unknown/unmodeled id. */
function requireHandToHand(id: string): HandToHandType {
  const t = hthById.get(id);
  if (!t) {
    throw new Error(
      `Unknown Hand-to-Hand type: "${id}". Known types: ${[...hthById.keys()].join(", ")}.`,
    );
  }
  return t;
}

export interface StatRange {
  min: number;
  max: number;
  average: number;
}

/** Hit Point range for a character of the given P.E. and experience level. */
export function hitPointsRange(pe: number, level: number): StatRange {
  const { baseBonusFormula, perLevelFormula, perLevelStartsAt } = vitals.hitPoints;
  // one roll per level from `perLevelStartsAt` up to `level` (matches rollHitPoints)
  const perLevelRolls = Math.max(0, level - perLevelStartsAt + 1);
  return {
    min: pe + diceMin(baseBonusFormula) + perLevelRolls * diceMin(perLevelFormula),
    max: pe + diceMax(baseBonusFormula) + perLevelRolls * diceMax(perLevelFormula),
    average: pe + diceAverage(baseBonusFormula) + perLevelRolls * diceAverage(perLevelFormula),
  };
}

/** Roll concrete Hit Points for a character of the given P.E. and level. */
export function rollHitPoints(pe: number, level: number, rng: Rng = Math.random): number {
  let hp = pe + rollDice(vitals.hitPoints.baseBonusFormula, rng);
  for (let l = vitals.hitPoints.perLevelStartsAt; l <= level; l++) {
    hp += rollDice(vitals.hitPoints.perLevelFormula, rng);
  }
  return hp;
}

export function physicalSdcRange(): StatRange {
  const f = vitals.physicalSdc.baseFormula;
  return { min: diceMin(f), max: diceMax(f), average: diceAverage(f) };
}

export function rollPhysicalSdc(rng: Rng = Math.random): number {
  return rollDice(vitals.physicalSdc.baseFormula, rng);
}

/** Negative-H.P. threshold a character can survive to (coma until then, dead below). */
export function comaDeathFloor(pe: number): number {
  return -pe;
}

/** A character's live damage pools: what's left of S.D.C. and Hit Points. */
export interface VitalsPool {
  sdc: number;
  hitPoints: number;
}

export type LifeState = "alive" | "coma" | "dead";

export interface BodyDamageResult {
  before: VitalsPool;
  after: VitalsPool;
  rawHitPoints: number;
  lifeState: LifeState;
}

/**
 * Deal damage to the pools: S.D.C. absorbs first — "all the S.D.C. of a living
 * thing must be reduced to zero before the Hit Points can be affected by
 * normal attacks" (RUE p.347) — then the overflow comes off Hit Points, which
 * stop at the coma/death floor (0 down to the floor is the coma band; below
 * it, dead — RUE p.287, floor = `comaDeathFloor(pe)`).
 */
export function applyBodyDamage(
  pool: VitalsPool,
  damage: number,
  comaDeathFloor: number,
): BodyDamageResult {
  if (!Number.isInteger(damage) || damage < 0) {
    throw new Error(`Damage must be a non-negative integer, got ${damage}.`);
  }
  const sdcDamage = Math.min(pool.sdc, damage);
  const rawHitPoints = pool.hitPoints - (damage - sdcDamage);
  const lifeState = rawHitPoints < comaDeathFloor ? "dead" : rawHitPoints <= 0 ? "coma" : "alive";
  const after = {
    sdc: pool.sdc - sdcDamage,
    hitPoints: Math.max(comaDeathFloor, rawHitPoints),
  };
  return { before: pool, after, rawHitPoints, lifeState };
}

export function applyDamage(pool: VitalsPool, damage: number, floor: number): VitalsPool {
  return applyBodyDamage(pool, damage, floor).after;
}

/** Total attacks per melee for a Hand-to-Hand type at a given level. */
export function attacksPerMelee(hthId: string, level: number): number {
  const t = requireHandToHand(hthId);
  let attacks = t.baseAttacks;
  for (const lv of t.levels) {
    if (lv.level <= level && lv.addAttacks) attacks += lv.addAttacks;
  }
  return attacks;
}

export type CombatBonuses = Record<string, number>;

/** Accumulated Hand-to-Hand combat bonuses (strike/parry/dodge/...) at a level. */
export function hthBonuses(hthId: string, level: number): CombatBonuses {
  const out: CombatBonuses = {};
  const t = requireHandToHand(hthId);
  for (const lv of t.levels) {
    if (lv.level > level || !lv.bonuses) continue;
    for (const [k, v] of Object.entries(lv.bonuses)) {
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

export interface SaveTarget {
  target?: number;
  targetRange?: { min: number; max: number };
}

/** The d20 target to save against a given effect (e.g. "curses", "magic"). */
export function savingThrowTarget(kind: string): SaveTarget | undefined {
  const e = savingThrows.targets.find((t) => t.kind === kind);
  if (!e) return undefined;
  return { target: e.target, targetRange: e.targetRange };
}

/** Save-vs-psionics target for a character of the given psychic class. */
export function psionicsSaveTarget(saverClass: string): number | undefined {
  return savingThrows.psionics.bySaverClass.find((s) => s.saverClass === saverClass)?.target;
}

export interface CombatProfileInput {
  attributes: Partial<Record<AttributeCode, number>>;
  hthType: string;
  level: number;
}

export interface CombatProfile {
  attacksPerMelee: number;
  handToHandBonuses: CombatBonuses;
  handToHandType: string;
  hasHandToHandTraining: boolean;
  hasAutoDodge: boolean;
  strike: number;
  parry: number;
  dodge: number;
  rangedDodge: number;
  rangedAutoDodge: number;
  damageBonus: number;
  initiative: number;
  autoDodge: number;
  strikeThrown: number;
  strikeGuns: number;
  saveVsHorrorFactor: number;
  criticalStrikeOn: number;
  saveBonuses: {
    psionic: number;
    insanity: number;
    comaDeathPct: number;
    magic: number;
    poison: number;
  };
}

function hthCriticalStrikeOn(hthId: string, level: number): number {
  const t = requireHandToHand(hthId);
  let threshold = 20;
  for (const lv of t.levels) {
    if (lv.level <= level && lv.criticalStrikeOn !== undefined) {
      threshold = Math.min(threshold, lv.criticalStrikeOn);
    }
  }
  return threshold;
}

/**
 * Combine attribute-derived bonuses with a Hand-to-Hand progression into the
 * combat numbers a sheet rolls with. (O.C.C.-specific save bonuses are layered
 * on during full character assembly.)
 */
export function combatProfile(input: CombatProfileInput): CombatProfile {
  const attr = deriveAttributeBonuses(input.attributes);
  const hth = hthBonuses(input.hthType, input.level);
  const sum = (a: number | undefined, b: number | undefined): number => (a ?? 0) + (b ?? 0);
  const strike = sum(attr.strike, hth.strike);
  const hasAutoDodge = hth.autoDodge !== undefined;
  const rangedDodge = attr.dodge ?? 0;
  return {
    attacksPerMelee: attacksPerMelee(input.hthType, input.level),
    handToHandBonuses: hth,
    handToHandType: input.hthType,
    hasHandToHandTraining: input.hthType !== "none",
    hasAutoDodge,
    strike,
    parry: sum(attr.parry, hth.parry),
    dodge: sum(attr.dodge, hth.dodge),
    rangedDodge,
    rangedAutoDodge: hasAutoDodge ? rangedDodge : 0,
    damageBonus: sum(attr.hthDamage, hth.damage),
    initiative: hth.initiative ?? 0,
    autoDodge: hth.autoDodge === undefined ? 0 : sum(attr.dodge, hth.autoDodge),
    strikeThrown: strike + (hth.strikeThrown ?? 0),
    // RUE p.360: P.P. and general H2H bonuses do not apply to modern weapons.
    strikeGuns: hth.strikeGuns ?? 0,
    saveVsHorrorFactor: hth.saveVsHorrorFactor ?? 0,
    criticalStrikeOn: hthCriticalStrikeOn(input.hthType, input.level),
    saveBonuses: {
      psionic: attr.saveVsPsionic ?? 0,
      insanity: attr.saveVsInsanity ?? 0,
      comaDeathPct: attr.saveVsComaDeath ?? 0,
      magic: attr.saveVsMagic ?? 0,
      poison: attr.saveVsPoison ?? 0,
    },
  };
}
