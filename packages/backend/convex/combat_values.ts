import { v } from "convex/values";

export const d20RollValidator = v.object({
  die: v.number(),
  bonus: v.number(),
  total: v.number(),
  target: v.optional(v.number()),
  success: v.optional(v.boolean()),
  naturalTwenty: v.boolean(),
  naturalOne: v.boolean(),
});

export const damageRollValidator = v.object({
  dice: v.array(v.number()),
  total: v.number(),
  bonus: v.number(),
});

export const combatContextValidator = v.union(
  v.object({
    kind: v.literal("melee"),
    defenderAware: v.boolean(),
    parryMode: v.union(v.literal("unavailable"), v.literal("standard"), v.literal("bareHanded")),
    strikeModifier: v.optional(v.number()),
    strikeModifierReason: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("ranged"),
    defenderAware: v.boolean(),
    rangeBand: v.union(v.literal("pointBlank"), v.literal("close"), v.literal("normal")),
    strikeModifier: v.optional(v.number()),
    strikeModifierReason: v.optional(v.string()),
  }),
);

export const combatResponseInputValidator = v.object({
  kind: v.union(v.literal("parry"), v.literal("dodge"), v.literal("autoDodge"), v.literal("none")),
  defenseModifier: v.optional(v.number()),
  defenseModifierReason: v.optional(v.string()),
});

export const defenseOptionValidator = v.object({
  kind: v.union(v.literal("parry"), v.literal("dodge"), v.literal("autoDodge"), v.literal("none")),
  bonus: v.number(),
  actionCost: v.union(v.literal(0), v.literal(1)),
  explanation: v.string(),
});

const authorizedResponseValidator = v.object({
  kind: v.union(v.literal("parry"), v.literal("dodge"), v.literal("autoDodge"), v.literal("none")),
  bonus: v.number(),
  actionCost: v.union(v.literal(0), v.literal(1)),
  explanation: v.string(),
  defenseModifier: v.number(),
  defenseModifierReason: v.optional(v.string()),
  totalBonus: v.number(),
});

const weaponCategoryValidator = v.union(
  v.literal("knife"),
  v.literal("axe"),
  v.literal("handgun"),
  v.literal("submachineGun"),
  v.literal("energyPistol"),
  v.literal("energyRifle"),
);

const modifierSourceValidator = v.object({
  source: v.union(v.literal("attribute"), v.literal("handToHand"), v.literal("proficiency")),
  label: v.string(),
  value: v.number(),
});

const exchangeBase = {
  attackerId: v.id("characters"),
  defenderId: v.id("characters"),
  attackerName: v.string(),
  defenderName: v.string(),
  weapon: v.object({
    index: v.number(),
    itemId: v.string(),
    name: v.string(),
    category: weaponCategoryValidator,
    worn: v.optional(v.boolean()),
    rolledMdc: v.optional(v.number()),
  }),
  attack: v.object({
    kind: v.union(v.literal("melee"), v.literal("ranged")),
    minimumStrikeTotal: v.number(),
    strikeBonus: v.number(),
    strikeBonusSources: v.array(modifierSourceValidator),
    proficiencyBonus: v.number(),
    damageFormula: v.string(),
    damageBonus: v.number(),
    criticalOn: v.number(),
    damageType: v.literal("sdc"),
  }),
  context: combatContextValidator,
  attackerStateToken: v.string(),
  defenderStateToken: v.string(),
  strikeRoll: d20RollValidator,
};

const routeValidator = v.union(
  v.object({
    kind: v.literal("armor"),
    armor: v.object({ before: v.number(), after: v.number() }),
    body: v.object({
      before: v.object({ sdc: v.number(), hitPoints: v.number() }),
      after: v.object({ sdc: v.number(), hitPoints: v.number() }),
    }),
  }),
  v.object({
    kind: v.literal("body"),
    armor: v.optional(v.object({ before: v.number(), after: v.number() })),
    body: v.object({
      before: v.object({ sdc: v.number(), hitPoints: v.number() }),
      after: v.object({ sdc: v.number(), hitPoints: v.number() }),
    }),
  }),
);

export const resolvedResultValidator = v.union(
  v.object({
    outcome: v.literal("miss"),
    reason: v.union(v.literal("naturalOne"), v.literal("belowMinimum")),
    critical: v.literal(false),
    damageMultiplier: v.literal(1),
  }),
  v.object({
    outcome: v.literal("defended"),
    reason: v.union(v.literal("parried"), v.literal("dodged")),
    response: authorizedResponseValidator,
    defenseRoll: d20RollValidator,
    critical: v.literal(false),
    damageMultiplier: v.literal(1),
  }),
  v.object({
    outcome: v.literal("hit"),
    reason: v.union(v.literal("unopposed"), v.literal("strikeWon")),
    response: authorizedResponseValidator,
    defenseRoll: v.optional(d20RollValidator),
    critical: v.boolean(),
    damageMultiplier: v.union(v.literal(1), v.literal(2)),
    damageRoll: damageRollValidator,
    totalDamage: v.number(),
    route: routeValidator,
  }),
);

export const combatExchangeValidator = v.union(
  v.object({
    ...exchangeBase,
    status: v.literal("pendingDefense"),
    defenseOptions: v.array(defenseOptionValidator),
  }),
  v.object({
    ...exchangeBase,
    status: v.literal("resolved"),
    resolution: resolvedResultValidator,
  }),
  v.object({
    ...exchangeBase,
    status: v.literal("cancelled"),
    cancelledAt: v.number(),
  }),
  v.object({
    ...exchangeBase,
    status: v.literal("stale"),
    staleAt: v.number(),
    reason: v.literal("combatStateChanged"),
  }),
);
