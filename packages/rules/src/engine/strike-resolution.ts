import strikeResolutionRaw from "../content/combat/strike-resolution.json" with { type: "json" };
import { combatResolutionRulesSchema } from "../schema/strike-resolution.ts";

/** Page-stamped strike constants, validated when the rules package loads. */
export const combatResolutionRules = combatResolutionRulesSchema.parse(strikeResolutionRaw);
