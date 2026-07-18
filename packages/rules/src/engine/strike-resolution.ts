import strikeResolutionRaw from "../content/combat/strike-resolution.json" with { type: "json" };
import { damageTypeSchema, type DamageType } from "../schema/damage.ts";
import {
  combatResolutionRulesSchema,
  defenseKindSchema,
  type DefenseKind,
} from "../schema/strike-resolution.ts";
import type { D20Roll } from "./rolls.ts";

/** Page-stamped strike constants, validated when the rules package loads. */
export const combatResolutionRules = combatResolutionRulesSchema.parse(strikeResolutionRaw);

export interface StrikeDefense {
  kind: DefenseKind;
  roll: D20Roll;
}

export interface ResolveStrikeInput {
  strike: D20Roll;
  defense?: StrikeDefense;
  allowedDefenses: readonly DefenseKind[];
  damageType: DamageType;
  criticalOn?: number;
}

export type StrikeOutcome = "hit" | "miss" | "defended";
export type StrikeReason =
  | "naturalOne"
  | "belowMinimum"
  | "parried"
  | "dodged"
  | "unopposed"
  | "strikeWon";

export interface StrikeResolution {
  outcome: StrikeOutcome;
  reason: StrikeReason;
  critical: boolean;
  damageMultiplier: 1 | 2;
  damageType: DamageType;
}

function assertCompletedD20(label: string, roll: D20Roll): void {
  if (!Number.isInteger(roll.die)) {
    throw new Error(`${label} die must be an integer from 1 to 20, got ${roll.die}.`);
  }
  if (roll.die < 1 || roll.die > 20) {
    throw new Error(`${label} die must be from 1 to 20, got ${roll.die}.`);
  }
  if (!Number.isFinite(roll.bonus)) {
    throw new Error(`${label} bonus must be finite, got ${roll.bonus}.`);
  }
  if (!Number.isFinite(roll.total) || roll.total !== roll.die + roll.bonus) {
    throw new Error(
      `${label} total must equal die + bonus (${roll.die + roll.bonus}), got ${roll.total}.`,
    );
  }
}

function failed(
  outcome: "miss" | "defended",
  reason: StrikeReason,
  damageType: DamageType,
): StrikeResolution {
  return { outcome, reason, critical: false, damageMultiplier: 1, damageType };
}

function successful(
  reason: "unopposed" | "strikeWon",
  strikeDie: number,
  criticalOn: number,
  damageType: DamageType,
): StrikeResolution {
  const critical = strikeDie >= criticalOn;
  return {
    outcome: "hit",
    reason,
    critical,
    damageMultiplier: critical ? combatResolutionRules.naturalTwentyDamageMultiplier : 1,
    damageType,
  };
}

/** Resolve a completed strike against an optional caller-authorized defense. */
export function resolveStrike(input: ResolveStrikeInput): StrikeResolution {
  assertCompletedD20("Strike", input.strike);
  const damageType = damageTypeSchema.parse(input.damageType);
  const allowedDefenses = input.allowedDefenses.map((kind) => defenseKindSchema.parse(kind));
  const criticalOn = input.criticalOn ?? 20;
  if (!Number.isInteger(criticalOn)) {
    throw new Error(`criticalOn must be an integer from 2 to 20, got ${criticalOn}.`);
  }
  if (criticalOn < 2 || criticalOn > 20) {
    throw new Error(`criticalOn must be from 2 to 20, got ${criticalOn}.`);
  }

  let defense: StrikeDefense | undefined;
  if (input.defense !== undefined) {
    const kind = defenseKindSchema.parse(input.defense.kind);
    assertCompletedD20("Defense", input.defense.roll);
    if (!allowedDefenses.includes(kind)) {
      throw new Error(`${kind} is not allowed for this strike.`);
    }
    defense = { kind, roll: input.defense.roll };
  }

  const strikeNaturalOne = input.strike.die === 1;
  const strikeNaturalTwenty = input.strike.die === 20;
  if (strikeNaturalOne) return failed("miss", "naturalOne", damageType);
  if (input.strike.total <= combatResolutionRules.automaticMissAtOrBelow) {
    return failed("miss", "belowMinimum", damageType);
  }
  if (defense === undefined) {
    return successful("unopposed", input.strike.die, criticalOn, damageType);
  }

  const defendedReason = defense.kind === "parry" ? "parried" : "dodged";
  if (defense.roll.die === 20) return failed("defended", defendedReason, damageType);
  if (strikeNaturalTwenty) {
    return successful("strikeWon", input.strike.die, criticalOn, damageType);
  }
  if (defense.roll.total >= input.strike.total) {
    return failed("defended", defendedReason, damageType);
  }
  return successful("strikeWon", input.strike.die, criticalOn, damageType);
}
