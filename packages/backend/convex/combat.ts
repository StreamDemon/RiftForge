import { deriveProtection, deriveSheet } from "@riftforge/rules";
import { v } from "convex/values";
import { query } from "./_generated/server";

const TARGET_LIMIT = 50;
const FEED_LIMIT = 20;

export const targets = query({
  args: { attackerId: v.id("characters") },
  handler: async (ctx, { attackerId }) => {
    const docs = await ctx.db.query("characters").order("desc").take(TARGET_LIMIT);
    return docs
      .filter((doc) => doc._id !== attackerId)
      .map((doc) => {
        const sheet = deriveSheet(doc);
        const ready =
          sheet.vitals.sdc.rolled !== undefined && sheet.vitals.hitPoints.rolled !== undefined;
        const protection = deriveProtection(sheet);
        return {
          id: doc._id,
          name: sheet.name,
          ready,
          protection: protection.kind,
          ...(ready
            ? protection.kind === "mdcArmor"
              ? { disabledReason: "unsupportedMdcProtection" as const }
              : {}
            : { disabledReason: "defenderNotReady" as const }),
        };
      });
  },
});

export const incoming = query({
  args: { defenderId: v.id("characters") },
  handler: (ctx, { defenderId }) =>
    ctx.db
      .query("combatExchanges")
      .withIndex("by_defender_and_status", (q) =>
        q.eq("defenderId", defenderId).eq("status", "pendingDefense"),
      )
      .order("desc")
      .take(FEED_LIMIT),
});

export const outgoing = query({
  args: { attackerId: v.id("characters") },
  handler: (ctx, { attackerId }) =>
    ctx.db
      .query("combatExchanges")
      .withIndex("by_attacker_and_status", (q) =>
        q.eq("attackerId", attackerId).eq("status", "pendingDefense"),
      )
      .order("desc")
      .take(FEED_LIMIT),
});

export const recent = query({
  args: { characterId: v.id("characters") },
  handler: async (ctx, { characterId }) => {
    const [attacks, defenses] = await Promise.all([
      ctx.db
        .query("combatExchanges")
        .withIndex("by_attacker", (q) => q.eq("attackerId", characterId))
        .order("desc")
        .take(FEED_LIMIT),
      ctx.db
        .query("combatExchanges")
        .withIndex("by_defender", (q) => q.eq("defenderId", characterId))
        .order("desc")
        .take(FEED_LIMIT),
    ]);
    return [...new Map([...attacks, ...defenses].map((doc) => [doc._id, doc])).values()]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, FEED_LIMIT);
  },
});
