import {
  ATTRIBUTE_CODES,
  attributeBonusChartSchema,
  type AttributeBonusChart,
  type AttributeCode,
  type AttributeDefinition,
  type AttributeEffect,
} from "../schema/attributes.ts";
import rawChart from "../content/attribute-bonuses.json" with { type: "json" };
import { rollDie, type Rng } from "./dice.ts";

/**
 * The Attribute Bonus Chart (Rifts Ultimate Edition, p.281), validated at load.
 * A mis-transcribed cell (wrong type, missing field) throws here — at import
 * time — so bad data can never reach the app.
 */
export const attributeBonusChart: AttributeBonusChart = attributeBonusChartSchema.parse(rawChart);

const byCode: Map<AttributeCode, AttributeDefinition> = new Map(
  attributeBonusChart.attributes.map((a) => [a.code, a]),
);

/**
 * A map of canonical derived-stat target -> summed bonus,
 * e.g. `{ strike: 3, parry: 3, dodge: 3 }`.
 */
export type DerivedBonuses = Record<string, number>;

/** True when a value exceeds the chart and needs the (not-yet-modeled)
 * "Attributes Beyond Thirty" rules. */
export function isBeyondChart(value: number): boolean {
  return value > attributeBonusChart.maxTabulatedValue;
}

/**
 * Look up one effect's bonus for a given attribute value.
 * Returns 0 below the bonus threshold; clamps to the chart's top row above it
 * (until the "Beyond Thirty" rules are modeled — see {@link isBeyondChart}).
 */
export function effectBonus(effect: AttributeEffect, value: number): number {
  if (value < attributeBonusChart.minValueForBonus) return 0;
  const clamped = Math.min(value, attributeBonusChart.maxTabulatedValue);
  return effect.byValue[String(clamped)] ?? 0;
}

/** Every modifier the chart contributes for a single attribute's value. */
export function bonusesForAttribute(code: AttributeCode, value: number): DerivedBonuses {
  const out: DerivedBonuses = {};
  const def = byCode.get(code);
  if (!def) return out;
  for (const effect of def.effects) {
    const bonus = effectBonus(effect, value);
    if (bonus === 0) continue;
    for (const target of effect.appliesTo) {
      out[target] = (out[target] ?? 0) + bonus;
    }
  }
  return out;
}

/**
 * Derive the full set of attribute-driven modifiers for a character's eight
 * attributes. Shared targets are summed across attributes.
 */
export function deriveAttributeBonuses(
  attributes: Partial<Record<AttributeCode, number>>,
): DerivedBonuses {
  const out: DerivedBonuses = {};
  for (const [code, value] of Object.entries(attributes)) {
    if (value == null) continue;
    for (const [target, bonus] of Object.entries(
      bonusesForAttribute(code as AttributeCode, value),
    )) {
      out[target] = (out[target] ?? 0) + bonus;
    }
  }
  return out;
}

/** One attribute's initial generation roll, with the dice kept for display. */
export interface AttributeRoll {
  total: number;
  /** Every die in roll order: the three base D6s, then any exceptional bonus dice. */
  dice: number[];
  /** True when the base 3D6 came up 16-18 and earned a bonus die. */
  exceptional: boolean;
}

/**
 * Roll one attribute per character creation Step 1 (RUE p.279): 3D6, and if
 * the initial three dice total 16, 17, or 18 the attribute is *exceptional* —
 * roll one additional 1D6. If that bonus die comes up a 6 (a rarity), roll yet
 * another 1D6, then stop; no further dice regardless of the second bonus die.
 */
export function rollAttribute(rng: Rng = Math.random): AttributeRoll {
  const dice = [rollDie(6, rng), rollDie(6, rng), rollDie(6, rng)];
  const base = dice[0]! + dice[1]! + dice[2]!;
  const exceptional = base >= 16;
  if (exceptional) {
    const bonus = rollDie(6, rng);
    dice.push(bonus);
    if (bonus === 6) dice.push(rollDie(6, rng));
  }
  return { total: dice.reduce((sum, d) => sum + d, 0), dice, exceptional };
}

/** Roll all eight attributes in book order (I.Q. first — RUE p.279). */
export function rollAttributes(rng: Rng = Math.random): Record<AttributeCode, AttributeRoll> {
  const out = {} as Record<AttributeCode, AttributeRoll>;
  for (const code of ATTRIBUTE_CODES) {
    out[code] = rollAttribute(rng);
  }
  return out;
}
