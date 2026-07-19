import {
  attackerCombatStateToken,
  combatContextSchema,
  defenderCombatStateToken,
  deriveAttackProfile,
  deriveDefenseOptions,
  deriveProtection,
  deriveSheet,
  evaluateDeclaration,
  rollD20,
  type AttackProfile,
  type Character,
  type CharacterSheet,
  type CombatContext,
  type CombatExchangeErrorCode,
} from "@riftforge/rules";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { expectedItemValidator, loadCharacter, requireItemAt } from "./character_state";
import { combatContextValidator } from "./combat_values";

const TARGET_LIMIT = 50;
const FEED_LIMIT = 20;

function combatFailure(code: CombatExchangeErrorCode, message: string): never {
  throw new ConvexError({ code, message });
}

function requireCombatReady(
  sheet: CharacterSheet,
  code: "attackerNotReady" | "defenderNotReady",
): void {
  if (sheet.vitals.sdc.rolled === undefined || sheet.vitals.hitPoints.rolled === undefined) {
    combatFailure(code, "Roll both S.D.C. and Hit Points before entering combat.");
  }
}

function parseDeclaredContext(
  attack: Extract<AttackProfile, { supported: true }>,
  input: unknown,
): CombatContext {
  const parsed = combatContextSchema.safeParse(input);
  if (!parsed.success) {
    const missingReason = parsed.error.issues.some((issue) =>
      issue.path.includes("strikeModifierReason"),
    );
    combatFailure(
      missingReason ? "modifierReasonRequired" : "invalidContext",
      missingReason
        ? "A reason is required for a nonzero strike modifier."
        : "The declared combat context is invalid.",
    );
  }
  if (parsed.data.kind !== attack.kind) {
    combatFailure("invalidContext", "The declared context does not match the weapon mode.");
  }
  return parsed.data;
}

export const declareAttack = mutation({
  args: {
    attackerId: v.id("characters"),
    defenderId: v.id("characters"),
    weaponIndex: v.number(),
    expect: expectedItemValidator,
    context: combatContextValidator,
  },
  handler: async (ctx, args) => {
    if (args.attackerId === args.defenderId) {
      combatFailure("selfTarget", "A character cannot target itself with a hostile exchange.");
    }

    let attacker: Character;
    let defender: Character;
    try {
      [attacker, defender] = await Promise.all([
        loadCharacter(ctx, args.attackerId),
        loadCharacter(ctx, args.defenderId),
      ]);
    } catch {
      combatFailure("characterMissing", "The attacker or defender no longer exists.");
    }

    const attackerSheet = deriveSheet(attacker);
    const defenderSheet = deriveSheet(defender);
    requireCombatReady(attackerSheet, "attackerNotReady");
    requireCombatReady(defenderSheet, "defenderNotReady");

    try {
      requireItemAt(attacker, args.weaponIndex, args.expect);
    } catch {
      combatFailure("weaponMissingOrChanged", "The selected weapon instance changed.");
    }

    const attack = deriveAttackProfile(attackerSheet, args.weaponIndex);
    if (!attack.supported) {
      combatFailure(
        attack.reason,
        attack.reason === "unsupportedMdWeapon"
          ? "M.D. weapons require the full M.D.C. combat follow-up."
          : "The selected item is not a supported weapon mode.",
      );
    }
    const context = parseDeclaredContext(attack, args.context);
    const protection = deriveProtection(defenderSheet);
    if (protection.kind === "mdcArmor") {
      combatFailure(
        "unsupportedMdcProtection",
        "M.D.C. protection requires the full M.D.C. combat follow-up.",
      );
    }

    const defenseOptions = deriveDefenseOptions(defenderSheet, attack, context);
    const attackerStateToken = attackerCombatStateToken(attackerSheet, args.weaponIndex);
    const defenderStateToken = defenderCombatStateToken(defenderSheet);

    const strikeModifier = context.strikeModifier ?? 0;
    const strikeRoll = rollD20(attack.strikeBonus + strikeModifier, attack.minimumStrikeTotal);
    const declaration = evaluateDeclaration(strikeRoll, attack.minimumStrikeTotal);
    const { supported: _supported, weapon, ...attackSnapshot } = attack;
    const base = {
      attackerId: args.attackerId,
      defenderId: args.defenderId,
      attackerName: attackerSheet.name,
      defenderName: defenderSheet.name,
      weapon,
      attack: attackSnapshot,
      context,
      attackerStateToken,
      defenderStateToken,
      strikeRoll,
    };
    const exchangeId = await ctx.db.insert(
      "combatExchanges",
      declaration.status === "miss"
        ? {
            ...base,
            status: "resolved" as const,
            resolution: {
              outcome: "miss" as const,
              reason: declaration.reason,
              critical: false as const,
              damageMultiplier: 1 as const,
            },
          }
        : { ...base, status: "pendingDefense" as const, defenseOptions },
    );
    return (await ctx.db.get(exchangeId))!;
  },
});

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
