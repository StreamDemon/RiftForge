/**
 * Gameplay dice rolls for the live sheet: d20 checks (saves, strike/parry/
 * dodge), percentile checks (skills, coma/death), and damage. Pure functions
 * over an injectable RNG, so they run server-side (Convex) or in the client.
 */
import { parseDice, rollDie, type DiceFormula, type Rng } from "./dice.ts";
import type { SheetSave } from "./character.ts";

/** A d20 roll with a flat bonus, optionally judged against a target number. */
export interface D20Roll {
  /** The natural die result, 1-20. */
  die: number;
  bonus: number;
  /** die + bonus. */
  total: number;
  /** The number to meet or beat, when known. */
  target?: number;
  /** `total >= target`; only set when a target is known. */
  success?: boolean;
  naturalTwenty: boolean;
  naturalOne: boolean;
}

/** Roll 1d20 + `bonus`, judging success when a `target` is given. */
export function rollD20(bonus = 0, target?: number, rng: Rng = Math.random): D20Roll {
  const die = rollDie(20, rng);
  const total = die + bonus;
  return {
    die,
    bonus,
    total,
    target,
    success: target === undefined ? undefined : total >= target,
    naturalTwenty: die === 20,
    naturalOne: die === 1,
  };
}

/**
 * Roll a saving throw from the sheet. The save's own fixed target is used when
 * it has one; pass `target` for situational targets (e.g. save vs magic, where
 * the target is the attacker's spell strength). Percentile saves (coma/death)
 * are a different mechanic — use {@link rollPercentile} against the survival
 * chance instead.
 */
export function rollSave(save: SheetSave, opts: { target?: number; rng?: Rng } = {}): D20Roll {
  if (save.percent) {
    throw new Error("Percentile saves roll d100, not d20 — use rollPercentile.");
  }
  return rollD20(save.bonus, opts.target ?? save.target, opts.rng ?? Math.random);
}

/** Roll d100 (1-100), for skill checks and percentile saves. */
export function rollPercentile(rng: Rng = Math.random): number {
  return rollDie(100, rng);
}

/** A percentile skill check: success means rolling the skill value or under. */
export interface SkillCheckRoll {
  /** The d100 result, 1-100. */
  roll: number;
  /** The skill percentage rolled against. */
  value: number;
  success: boolean;
}

/** Roll d100 against a skill percentage (roll <= value succeeds). */
export function rollSkillCheck(value: number, rng: Rng = Math.random): SkillCheckRoll {
  const roll = rollPercentile(rng);
  return { roll, value, success: roll <= value };
}

/** A dice-formula roll broken down per die, for display. */
export interface DetailedRoll {
  /** Individual die results, before multiplier/modifier. */
  dice: number[];
  /** The formula's full result, matching `rollDice`. */
  total: number;
}

/** Roll a formula keeping the individual die results (same math as `rollDice`). */
export function rollDiceDetailed(f: DiceFormula | string, rng: Rng = Math.random): DetailedRoll {
  const d = typeof f === "string" ? parseDice(f) : f;
  const dice: number[] = [];
  for (let i = 0; i < d.count; i++) dice.push(rollDie(d.sides, rng));
  const sum = dice.reduce((a, b) => a + b, 0);
  return { dice, total: sum * d.multiplier + d.modifier };
}

/** A damage roll: the weapon/spell formula plus the character's damage bonus. */
export interface DamageRoll extends DetailedRoll {
  /** Flat bonus added on top of the formula (e.g. the sheet's `damageBonus`). */
  bonus: number;
}

/** Roll damage for a formula, adding a flat bonus (total includes it). */
export function rollDamage(f: DiceFormula | string, bonus = 0, rng: Rng = Math.random): DamageRoll {
  const detailed = rollDiceDetailed(f, rng);
  return { ...detailed, total: detailed.total + bonus, bonus };
}
