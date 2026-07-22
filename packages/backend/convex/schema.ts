import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { combatExchangeValidator } from "./combat_values";

/**
 * Convex validators mirroring `characterSchema` from @riftforge/rules.
 * The table stores the player's *choices* (a parsed `Character`); derived
 * stats are computed by `deriveSheet` at query time and never stored.
 * Writes revalidate through the zod schema, so these validators only need
 * to pin the shape — the rules layer owns the semantic constraints.
 */
export const characterFields = {
  name: v.string(),
  occId: v.string(),
  /** Optional only for documents created before species identity existed. */
  speciesId: v.optional(v.string()),
  alignmentId: v.optional(v.string()),
  level: v.number(),
  attributes: v.object({
    IQ: v.number(),
    ME: v.number(),
    MA: v.number(),
    PS: v.number(),
    PP: v.number(),
    PE: v.number(),
    PB: v.number(),
    Spd: v.number(),
  }),
  hthType: v.string(),
  psychicClass: v.union(
    v.literal("masterPsychic"),
    v.literal("majorOrMinorPsychic"),
    v.literal("ordinary"),
  ),
  skills: v.array(
    v.object({
      skillId: v.string(),
      occBonus: v.optional(v.number()),
      categoryBonus: v.optional(v.number()),
      overrideValue: v.optional(v.number()),
      label: v.optional(v.string()),
    }),
  ),
  spellIds: v.array(v.string()),
  /** Owned items (one entry per physical instance, with per-instance state).
   * Optional in storage: characters stored before the inventory existed have
   * none; the rules layer defaults it to []. */
  items: v.optional(
    v.array(
      v.object({
        itemId: v.string(),
        worn: v.optional(v.boolean()),
        rolledMdc: v.optional(v.number()),
      }),
    ),
  ),
  rolled: v.optional(
    v.object({
      hitPoints: v.optional(v.number()),
      sdc: v.optional(v.number()),
      ppe: v.optional(v.number()),
    }),
  ),
  /** Live resource state (damage taken, P.P.E. spent, treatment-course
   * position); absent = at maximum / no course underway. */
  current: v.optional(
    v.object({
      hitPoints: v.optional(v.number()),
      sdc: v.optional(v.number()),
      ppe: v.optional(v.number()),
      armor: v.optional(v.number()),
      treatmentDays: v.optional(v.number()),
      lifeState: v.optional(v.literal("dead")),
    }),
  ),
  narrative: v.optional(
    v.object({
      epithet: v.optional(v.string()),
      appearance: v.optional(
        v.object({
          height: v.optional(v.string()),
          weight: v.optional(v.string()),
          age: v.optional(v.string()),
          eyes: v.optional(v.string()),
          origin: v.optional(v.string()),
          disposition: v.optional(v.string()),
        }),
      ),
      traits: v.optional(v.array(v.string())),
      backstory: v.optional(v.string()),
    }),
  ),
};

export default defineSchema({
  characters: defineTable(characterFields),
  combatExchanges: defineTable(combatExchangeValidator)
    .index("by_defender_and_status", ["defenderId", "status"])
    .index("by_attacker_and_status", ["attackerId", "status"])
    .index("by_defender", ["defenderId"])
    .index("by_attacker", ["attackerId"]),
});
