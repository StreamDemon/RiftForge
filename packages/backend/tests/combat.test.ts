import {
  attackerCombatStateToken,
  defenderCombatStateToken,
  deriveSheet,
  type Character,
  type CombatExchangeErrorCode,
} from "@riftforge/rules";
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vite-plus/test";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = {
  ...import.meta.glob("../convex/*.ts"),
  ...import.meta.glob("../convex/_generated/*.js"),
};

const character: Character = {
  name: "Vesper",
  occId: "ley-line-walker",
  level: 1,
  attributes: { IQ: 18, ME: 16, MA: 12, PS: 16, PP: 20, PE: 14, PB: 11, Spd: 12 },
  hthType: "basic",
  psychicClass: "ordinary" as const,
  skills: [],
  spellIds: [],
  items: [],
};

const ready = { hitPoints: 18, sdc: 20 };
const meleeContext = {
  kind: "melee" as const,
  defenderAware: true,
  parryMode: "standard" as const,
};

function testDb() {
  return convexTest(schema, modules);
}

type TestDb = ReturnType<typeof testDb>;

async function createCharacter(t: TestDb, overrides: Partial<Character> = {}) {
  return t.mutation(api.characters.create, { ...character, ...overrides });
}

async function exchangeCount(t: TestDb): Promise<number> {
  return t.run(async (ctx) => (await ctx.db.query("combatExchanges").collect()).length);
}

async function expectCombatFailure(
  promise: Promise<unknown>,
  code: CombatExchangeErrorCode,
  message: string,
): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toMatchObject({ name: "ConvexError" });
  const rawData = (error as { data: unknown }).data;
  const data = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
  expect(data).toEqual({ code, message });
}

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

describe("combat attack declaration", () => {
  test("rejects self-targeting with stable error data and inserts nothing", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });

    await expectCombatFailure(
      t.mutation(api.combat.declareAttack, {
        attackerId,
        defenderId: attackerId,
        weaponIndex: 0,
        expect: { itemId: "survival-knife" },
        context: meleeContext,
      }),
      "selfTarget",
      "A character cannot target itself with a hostile exchange.",
    );
    expect(await exchangeCount(t)).toBe(0);
  });

  test("requires both attacker and defender to have rolled Hit Points and S.D.C.", async () => {
    const t = testDb();
    const unreadyAttackerId = await createCharacter(t, {
      name: "Unready attacker",
      items: [{ itemId: "survival-knife" }],
    });
    const readyDefenderId = await createCharacter(t, {
      name: "Ready defender",
      rolled: ready,
    });

    await expectCombatFailure(
      t.mutation(api.combat.declareAttack, {
        attackerId: unreadyAttackerId,
        defenderId: readyDefenderId,
        weaponIndex: 0,
        expect: { itemId: "survival-knife" },
        context: meleeContext,
      }),
      "attackerNotReady",
      "Roll both S.D.C. and Hit Points before entering combat.",
    );

    const readyAttackerId = await createCharacter(t, {
      name: "Ready attacker",
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const unreadyDefenderId = await createCharacter(t, { name: "Unready defender" });
    await expectCombatFailure(
      t.mutation(api.combat.declareAttack, {
        attackerId: readyAttackerId,
        defenderId: unreadyDefenderId,
        weaponIndex: 0,
        expect: { itemId: "survival-knife" },
        context: meleeContext,
      }),
      "defenderNotReady",
      "Roll both S.D.C. and Hit Points before entering combat.",
    );
    expect(await exchangeCount(t)).toBe(0);
  });

  test("requires the indexed weapon instance to match the expected manifest entry", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });

    await expectCombatFailure(
      t.mutation(api.combat.declareAttack, {
        attackerId,
        defenderId,
        weaponIndex: 0,
        expect: { itemId: "hand-axe" },
        context: meleeContext,
      }),
      "weaponMissingOrChanged",
      "The selected weapon instance changed.",
    );
    expect(await exchangeCount(t)).toBe(0);
  });

  test("refuses nonweapons as unsupported weapon modes without inserting", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "canteen" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });

    await expectCombatFailure(
      t.mutation(api.combat.declareAttack, {
        attackerId,
        defenderId,
        weaponIndex: 0,
        expect: { itemId: "canteen" },
        context: meleeContext,
      }),
      "unsupportedWeaponMode",
      "The selected item is not a supported weapon mode.",
    );
    expect(await exchangeCount(t)).toBe(0);
  });

  test("refuses M.D. weapons before any exchange is inserted", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "wilks-320-laser-pistol" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const random = vi.spyOn(Math, "random");

    await expectCombatFailure(
      t.mutation(api.combat.declareAttack, {
        attackerId,
        defenderId,
        weaponIndex: 0,
        expect: { itemId: "wilks-320-laser-pistol" },
        context: {
          kind: "ranged",
          defenderAware: true,
          rangeBand: "normal",
        },
      }),
      "unsupportedMdWeapon",
      "M.D. weapons require the full M.D.C. combat follow-up.",
    );
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    expect(await exchangeCount(t)).toBe(0);
  });

  test("refuses nondepleted M.D.C. protection before any exchange is inserted", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "gladiator", worn: true }],
    });
    const random = vi.spyOn(Math, "random");

    await expectCombatFailure(
      t.mutation(api.combat.declareAttack, {
        attackerId,
        defenderId,
        weaponIndex: 0,
        expect: { itemId: "survival-knife" },
        context: meleeContext,
      }),
      "unsupportedMdcProtection",
      "M.D.C. protection requires the full M.D.C. combat follow-up.",
    );
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    expect(await exchangeCount(t)).toBe(0);
  });

  test("maps context kind mismatches and invalid modifiers to stable errors without inserting", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });

    await expectCombatFailure(
      t.mutation(api.combat.declareAttack, {
        attackerId,
        defenderId,
        weaponIndex: 0,
        expect: { itemId: "survival-knife" },
        context: {
          kind: "ranged",
          defenderAware: true,
          rangeBand: "normal",
        },
      }),
      "invalidContext",
      "The declared context does not match the weapon mode.",
    );
    await expectCombatFailure(
      t.mutation(api.combat.declareAttack, {
        attackerId,
        defenderId,
        weaponIndex: 0,
        expect: { itemId: "survival-knife" },
        context: {
          ...meleeContext,
          strikeModifier: 101,
          strikeModifierReason: "Outside the allowed range",
        },
      }),
      "invalidContext",
      "The declared combat context is invalid.",
    );
    await expectCombatFailure(
      t.mutation(api.combat.declareAttack, {
        attackerId,
        defenderId,
        weaponIndex: 0,
        expect: { itemId: "survival-knife" },
        context: { ...meleeContext, strikeModifier: 1 },
      }),
      "modifierReasonRequired",
      "A reason is required for a nonzero strike modifier.",
    );
    expect(await exchangeCount(t)).toBe(0);
  });

  test("persists an immediate resolved miss from a server-owned roll", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      name: "Attacker",
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { name: "Defender", rolled: ready });

    const exchange = await t.mutation(api.combat.declareAttack, {
      attackerId,
      defenderId,
      weaponIndex: 0,
      expect: { itemId: "survival-knife" },
      context: {
        ...meleeContext,
        strikeModifier: -100,
        strikeModifierReason: "Guaranteed test miss",
      },
    });

    expect(exchange.status).toBe("resolved");
    if (exchange.status !== "resolved") throw new Error("Expected a resolved declaration.");
    expect(exchange.resolution).toEqual({
      outcome: "miss",
      reason: exchange.strikeRoll.die === 1 ? "naturalOne" : "belowMinimum",
      critical: false,
      damageMultiplier: 1,
    });
    expect(exchange.strikeRoll.die).toBeGreaterThanOrEqual(1);
    expect(exchange.strikeRoll.die).toBeLessThanOrEqual(20);
    expect(Number.isInteger(exchange.strikeRoll.die)).toBe(true);
    expect(exchange.strikeRoll).toMatchObject({
      bonus: -97,
      total: exchange.strikeRoll.die - 97,
      target: 5,
      success: false,
      naturalTwenty: exchange.strikeRoll.die === 20,
      naturalOne: exchange.strikeRoll.die === 1,
    });
    expect(await t.run((ctx) => ctx.db.get(exchange._id))).toEqual(exchange);
  });

  test("persists a pending declaration with exact snapshots, tokens, and explicit no-defense", async () => {
    const t = testDb();
    const attacker: Character = {
      ...character,
      name: "Attacker",
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    };
    const defender: Character = { ...character, name: "Defender", rolled: ready };
    const attackerId = await createCharacter(t, attacker);
    const defenderId = await createCharacter(t, defender);
    const context = {
      ...meleeContext,
      strikeModifier: 100,
      strikeModifierReason: "Guaranteed test declaration",
    };

    const exchange = await t.mutation(api.combat.declareAttack, {
      attackerId,
      defenderId,
      weaponIndex: 0,
      expect: { itemId: "survival-knife" },
      context,
    });

    const { _id, _creationTime, strikeRoll, ...snapshot } = exchange;
    expect(_id).toBeTruthy();
    expect(_creationTime).toBeGreaterThan(0);
    expect(snapshot).toEqual({
      attackerId,
      defenderId,
      attackerName: "Attacker",
      defenderName: "Defender",
      weapon: {
        index: 0,
        itemId: "survival-knife",
        name: "Survival Knife",
        category: "knife",
      },
      attack: {
        kind: "melee",
        minimumStrikeTotal: 5,
        strikeBonus: 3,
        strikeBonusSources: [
          { source: "attribute", label: "P.P.", value: 3 },
          { source: "handToHand", label: "Hand-to-Hand", value: 0 },
        ],
        proficiencyBonus: 0,
        damageFormula: "1D6",
        damageBonus: 1,
        criticalOn: 20,
        damageType: "sdc",
      },
      context,
      attackerStateToken: attackerCombatStateToken(deriveSheet(attacker), 0),
      defenderStateToken: defenderCombatStateToken(deriveSheet(defender)),
      status: "pendingDefense",
      defenseOptions: [
        { kind: "parry", bonus: 3, actionCost: 0, explanation: "Parry the melee weapon." },
        {
          kind: "dodge",
          bonus: 3,
          actionCost: 1,
          explanation: "Dodge; costs one action for table tracking.",
        },
        { kind: "none", bonus: 0, actionCost: 0, explanation: "Take the hit." },
      ],
    });
    expect(strikeRoll.die).toBeGreaterThanOrEqual(1);
    expect(strikeRoll.die).toBeLessThanOrEqual(20);
    expect(Number.isInteger(strikeRoll.die)).toBe(true);
    expect(strikeRoll).toEqual({
      die: strikeRoll.die,
      bonus: 103,
      total: strikeRoll.die + 103,
      target: 5,
      success: true,
      naturalTwenty: strikeRoll.die === 20,
      naturalOne: strikeRoll.die === 1,
    });
  });

  test("does not accept client-authored roll or result fields", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });

    await expect(
      t.mutation(api.combat.declareAttack, {
        attackerId,
        defenderId,
        weaponIndex: 0,
        expect: { itemId: "survival-knife" },
        context: meleeContext,
        // @ts-expect-error Client-authored rolls are intentionally absent from declareAttack args.
        strikeRoll: {
          die: 20,
          bonus: 1000,
          total: 1020,
          target: 5,
          success: true,
          naturalTwenty: true,
          naturalOne: false,
        },
      }),
    ).rejects.toThrow(/strikeRoll|extra/i);
    await expect(
      t.mutation(api.combat.declareAttack, {
        attackerId,
        defenderId,
        weaponIndex: 0,
        expect: { itemId: "survival-knife" },
        context: meleeContext,
        // @ts-expect-error Client-authored results are intentionally absent from declareAttack args.
        result: { status: "pendingDefense" },
      }),
    ).rejects.toThrow(/result|extra/i);
    expect(await exchangeCount(t)).toBe(0);
  });
});
