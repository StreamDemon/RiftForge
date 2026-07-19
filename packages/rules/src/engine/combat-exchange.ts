import combatExchangeRaw from "../content/combat/combat-exchange.json" with { type: "json" };
import { combatExchangeRulesSchema } from "../schema/combat-exchange.ts";

export const combatExchangeRules = combatExchangeRulesSchema.parse(combatExchangeRaw);
