import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
  rolled: v.optional(
    v.object({
      hitPoints: v.optional(v.number()),
      sdc: v.optional(v.number()),
      ppe: v.optional(v.number()),
    }),
  ),
  /** Live resource state (damage taken, P.P.E. spent); absent = at maximum. */
  current: v.optional(
    v.object({
      hitPoints: v.optional(v.number()),
      sdc: v.optional(v.number()),
      ppe: v.optional(v.number()),
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
});
