import {
  attributeBonusChartSchema,
  type AttributeBonusChart,
  type AttributeCode,
  type AttributeDefinition,
  type AttributeEffect,
} from "../schema/attributes.ts";
import rawChart from "../content/attribute-bonuses.json" with { type: "json" };

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
