import { convexTest } from "convex-test";
import { describe, expect, test } from "vite-plus/test";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = {
  ...import.meta.glob("../convex/*.ts"),
  ...import.meta.glob("../convex/_generated/*.js"),
};

const character = {
  name: "Vesper",
  occId: "ley-line-walker",
  level: 1,
  attributes: { IQ: 18, ME: 16, MA: 12, PS: 16, PP: 20, PE: 14, PB: 11, Spd: 12 },
  hthType: "basic",
  psychicClass: "ordinary" as const,
  skills: [],
  spellIds: [],
};

function exchangeBase(attackerId: Id<"characters">, defenderId: Id<"characters">, serial: number) {
  return {
    attackerId,
    defenderId,
    attackerName: `Attacker ${serial}`,
    defenderName: `Defender ${serial}`,
    weapon: {
      index: 0,
      itemId: "survival-knife",
      name: "Survival Knife",
      category: "knife" as const,
    },
    attack: {
      kind: "melee" as const,
      minimumStrikeTotal: 5,
      strikeBonus: 3,
      strikeBonusSources: [{ source: "attribute" as const, label: "P.P.", value: 3 }],
      proficiencyBonus: 0,
      damageFormula: "1D6",
      damageBonus: 1,
      criticalOn: 20,
      damageType: "sdc" as const,
    },
    context: {
      kind: "melee" as const,
      defenderAware: true,
      parryMode: "standard" as const,
    },
    attackerStateToken: `attacker-${serial}`,
    defenderStateToken: `defender-${serial}`,
    strikeRoll: {
      die: 10,
      bonus: 3,
      total: 13,
      naturalTwenty: false,
      naturalOne: false,
    },
  };
}

describe("combat target selector", () => {
  test("excludes self, stays bounded, and safely classifies readiness and protection", async () => {
    const t = convexTest(schema, modules);

    for (let index = 0; index < 52; index += 1) {
      await t.mutation(api.characters.create, {
        ...character,
        name: `Filler ${index}`,
        rolled: { hitPoints: 18, sdc: 20 },
      });
    }
    const unreadyId = await t.mutation(api.characters.create, {
      ...character,
      name: "Unready",
    });
    const armoredId = await t.mutation(api.characters.create, {
      ...character,
      name: "Armored",
      rolled: { hitPoints: 18, sdc: 20 },
      items: [{ itemId: "gladiator", worn: true }],
    });
    const depletedId = await t.mutation(api.characters.create, {
      ...character,
      name: "Depleted",
      rolled: { hitPoints: 18, sdc: 20 },
      items: [{ itemId: "gladiator", worn: true }],
      current: { armor: 0 },
    });
    const attackerId = await t.mutation(api.characters.create, {
      ...character,
      name: "Attacker",
      rolled: { hitPoints: 18, sdc: 20 },
    });

    const targets = await t.query(api.combat.targets, { attackerId });

    expect(targets).toHaveLength(49);
    expect(targets).not.toContainEqual(expect.objectContaining({ id: attackerId }));
    expect(targets).toContainEqual({
      id: unreadyId,
      name: "Unready",
      ready: false,
      protection: "none",
      disabledReason: "defenderNotReady",
    });
    expect(targets).toContainEqual({
      id: armoredId,
      name: "Armored",
      ready: true,
      protection: "mdcArmor",
      disabledReason: "unsupportedMdcProtection",
    });
    expect(targets).toContainEqual({
      id: depletedId,
      name: "Depleted",
      ready: true,
      protection: "none",
    });
  });
});

describe("combat exchange feeds", () => {
  test("start empty", async () => {
    const t = convexTest(schema, modules);
    const characterId = await t.mutation(api.characters.create, character);

    expect(await t.query(api.combat.incoming, { defenderId: characterId })).toEqual([]);
    expect(await t.query(api.combat.outgoing, { attackerId: characterId })).toEqual([]);
    expect(await t.query(api.combat.recent, { characterId })).toEqual([]);
  });

  test("return at most 20 newest pending or recent exchanges without duplicates", async () => {
    const t = convexTest(schema, modules);
    const characterId = await t.mutation(api.characters.create, character);

    await t.run(async (ctx) => {
      for (let index = 0; index < 25; index += 1) {
        await ctx.db.insert("combatExchanges", {
          ...exchangeBase(characterId, characterId, index),
          status: "pendingDefense",
          defenseOptions: [{ kind: "none", bonus: 0, actionCost: 0, explanation: "No defense." }],
        });
      }
      await ctx.db.insert("combatExchanges", {
        ...exchangeBase(characterId, characterId, 25),
        status: "cancelled",
        cancelledAt: Date.now(),
      });
    });

    const incoming = await t.query(api.combat.incoming, { defenderId: characterId });
    const outgoing = await t.query(api.combat.outgoing, { attackerId: characterId });
    const recent = await t.query(api.combat.recent, { characterId });

    expect(incoming).toHaveLength(20);
    expect(outgoing).toHaveLength(20);
    expect(incoming.every((exchange) => exchange.status === "pendingDefense")).toBe(true);
    expect(outgoing.every((exchange) => exchange.status === "pendingDefense")).toBe(true);
    expect(recent).toHaveLength(20);
    expect(new Set(recent.map((exchange) => exchange._id)).size).toBe(20);
    expect(recent[0]?.status).toBe("cancelled");
    expect(recent.map((exchange) => exchange._creationTime)).toEqual(
      recent.map((exchange) => exchange._creationTime).toSorted((a, b) => b - a),
    );
  });
});
