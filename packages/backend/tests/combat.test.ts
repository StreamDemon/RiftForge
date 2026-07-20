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

async function getCharacter(t: TestDb, id: Id<"characters">) {
  return t.run((ctx) => ctx.db.get(id));
}

async function declarePending(
  t: TestDb,
  attackerId: Id<"characters">,
  defenderId: Id<"characters">,
  context: {
    kind: "melee";
    defenderAware: boolean;
    parryMode: "unavailable" | "standard" | "bareHanded";
  } = meleeContext,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const exchange = await t.mutation(api.combat.declareAttack, {
      attackerId,
      defenderId,
      weaponIndex: 0,
      expect: { itemId: "survival-knife" },
      context: {
        ...context,
        strikeModifier: 100,
        strikeModifierReason: "Guaranteed test declaration",
      },
    });
    if (exchange.status === "pendingDefense") return exchange;
  }
  throw new Error("Could not obtain a pending combat declaration.");
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

async function combatFailureData(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toMatchObject({ name: "ConvexError" });
  const rawData = (error as { data: unknown }).data;
  return (typeof rawData === "string" ? JSON.parse(rawData) : rawData) as {
    code: CombatExchangeErrorCode;
    message: string;
  };
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

    const exchange = await declarePending(t, attackerId, defenderId);

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

describe("combat response and cancellation", () => {
  test("take-the-hit rolls damage server-side and atomically records body pool changes", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      name: "Attacker",
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, {
      name: "Defender",
      rolled: ready,
      current: { sdc: 1, hitPoints: 18 },
    });
    const pending = await declarePending(t, attackerId, defenderId);

    const resolved = await t.mutation(api.combat.respondToAttack, {
      exchangeId: pending._id,
      response: { kind: "none" },
    });

    expect(resolved.status).toBe("resolved");
    if (resolved.status !== "resolved" || resolved.resolution.outcome !== "hit") {
      throw new Error("Expected an unopposed hit.");
    }
    expect(resolved.resolution).toMatchObject({
      outcome: "hit",
      reason: "unopposed",
      response: { kind: "none", totalBonus: 0 },
      damageRoll: { bonus: 1 },
      route: {
        kind: "body",
        body: { before: { sdc: 1, hitPoints: 18 } },
      },
    });
    expect(resolved.resolution.damageRoll.dice).toHaveLength(1);
    expect(resolved.resolution.damageRoll.dice[0]).toBeGreaterThanOrEqual(1);
    expect(resolved.resolution.damageRoll.dice[0]).toBeLessThanOrEqual(6);
    expect(resolved.resolution.damageRoll.total).toBe(resolved.resolution.damageRoll.dice[0]! + 1);
    expect(resolved.resolution.route.body.after.sdc).toBe(0);
    expect(resolved.resolution.route.body.after.hitPoints).toBeLessThan(18);
    expect((await getCharacter(t, defenderId))?.current).toMatchObject(
      resolved.resolution.route.body.after,
    );
    expect(await t.run((ctx) => ctx.db.get(pending._id))).toEqual(resolved);
    expect("defenseOptions" in resolved).toBe(false);
  });

  test("a server-rolled natural-20 defense changes no pools", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.999_999);
    try {
      const t = testDb();
      const attackerId = await createCharacter(t, {
        rolled: ready,
        items: [{ itemId: "survival-knife" }],
      });
      const defenderId = await createCharacter(t, {
        rolled: ready,
        current: { sdc: 17, hitPoints: 16 },
      });
      const pending = await declarePending(t, attackerId, defenderId);
      const before = await getCharacter(t, defenderId);

      const resolved = await t.mutation(api.combat.respondToAttack, {
        exchangeId: pending._id,
        response: {
          kind: "parry",
          defenseModifier: 100,
          defenseModifierReason: "Guaranteed test defense",
        },
      });

      expect(resolved.status).toBe("resolved");
      if (resolved.status !== "resolved") throw new Error("Expected a resolved exchange.");
      expect(resolved.resolution).toMatchObject({
        outcome: "defended",
        reason: "parried",
        response: { kind: "parry", defenseModifier: 100 },
        defenseRoll: { die: 20, target: pending.strikeRoll.total, success: true },
      });
      expect(await getCharacter(t, defenderId)).toEqual(before);
      expect("defenseOptions" in resolved).toBe(false);
    } finally {
      random.mockRestore();
    }
  });

  test.each([
    ["standard parry", "basic", 1, "standard", "parry", 3],
    ["bare-handed parry", "basic", 1, "bareHanded", "parry", 0],
    ["dodge", "basic", 1, "standard", "dodge", 3],
    ["automatic dodge", "commando", 15, "standard", "autoDodge", 8],
  ] as const)(
    "authorizes %s only from freshly derived defense options",
    async (_label, hthType, level, parryMode, kind, bonus) => {
      const random = vi.spyOn(Math, "random").mockReturnValue(0.999_999);
      try {
        const t = testDb();
        const attackerId = await createCharacter(t, {
          rolled: ready,
          items: [{ itemId: "survival-knife" }],
        });
        const defenderId = await createCharacter(t, { rolled: ready, hthType, level });
        const pending = await declarePending(t, attackerId, defenderId, {
          kind: "melee",
          defenderAware: true,
          parryMode,
        });

        const resolved = await t.mutation(api.combat.respondToAttack, {
          exchangeId: pending._id,
          response: {
            kind,
            defenseModifier: 100,
            defenseModifierReason: "Guaranteed test defense",
          },
        });

        expect(resolved.status).toBe("resolved");
        if (resolved.status !== "resolved") throw new Error("Expected a resolved exchange.");
        expect(resolved.resolution).toMatchObject({
          outcome: "defended",
          response: { kind, bonus, defenseModifier: 100, totalBonus: bonus + 100 },
        });
      } finally {
        random.mockRestore();
      }
    },
  );

  test("stales changed stored options and rejects missing modifier reasons without dice or writes", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const unavailable = await declarePending(t, attackerId, defenderId, {
      kind: "melee",
      defenderAware: false,
      parryMode: "unavailable",
    });
    const missingReason = await declarePending(t, attackerId, defenderId);
    await t.run(async (ctx) => {
      await ctx.db.patch(unavailable._id, {
        defenseOptions: [
          {
            kind: "autoDodge",
            bonus: 999,
            actionCost: 0,
            explanation: "Client-replayed stored option that is not authoritative.",
          },
          ...unavailable.defenseOptions,
        ],
      });
    });
    const characterBefore = await getCharacter(t, defenderId);
    const unavailableBefore = await t.run((ctx) => ctx.db.get(unavailable._id));
    const missingBefore = await t.run((ctx) => ctx.db.get(missingReason._id));
    const random = vi.spyOn(Math, "random");

    let stale;
    try {
      stale = await t.mutation(api.combat.respondToAttack, {
        exchangeId: unavailable._id,
        response: { kind: "autoDodge" },
      });
      await expectCombatFailure(
        t.mutation(api.combat.respondToAttack, {
          exchangeId: missingReason._id,
          response: { kind: "dodge", defenseModifier: 1 },
        }),
        "modifierReasonRequired",
        "A reason is required for a nonzero defense modifier.",
      );
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
    if (stale === undefined) throw new Error("Expected changed stored options to finalize stale.");
    expect(stale).toMatchObject({ status: "stale", reason: "combatStateChanged" });
    expect("defenseOptions" in stale).toBe(false);
    expect(await getCharacter(t, defenderId)).toEqual(characterBefore);
    expect(await t.run((ctx) => ctx.db.get(unavailable._id))).toEqual(stale);
    expect(await t.run((ctx) => ctx.db.get(unavailable._id))).not.toEqual(unavailableBefore);
    expect(await t.run((ctx) => ctx.db.get(missingReason._id))).toEqual(missingBefore);
  });

  test("cancellation replaces only a pending variant and every finalized variant is pending-only", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const cancelledPending = await declarePending(t, attackerId, defenderId);
    const resolvedPending = await declarePending(t, attackerId, defenderId);

    const cancelled = await t.mutation(api.combat.cancelAttack, {
      exchangeId: cancelledPending._id,
    });
    expect(cancelled).toMatchObject({ status: "cancelled" });
    expect("defenseOptions" in cancelled).toBe(false);

    await expectCombatFailure(
      t.mutation(api.combat.respondToAttack, {
        exchangeId: cancelledPending._id,
        response: { kind: "none" },
      }),
      "exchangeNotPending",
      "The combat exchange is no longer pending.",
    );
    await expectCombatFailure(
      t.mutation(api.combat.cancelAttack, { exchangeId: cancelledPending._id }),
      "exchangeNotPending",
      "The combat exchange is no longer pending.",
    );

    const resolved = await t.mutation(api.combat.respondToAttack, {
      exchangeId: resolvedPending._id,
      response: { kind: "none" },
    });
    expect(resolved.status).toBe("resolved");
    await expectCombatFailure(
      t.mutation(api.combat.respondToAttack, {
        exchangeId: resolvedPending._id,
        response: { kind: "none" },
      }),
      "exchangeNotPending",
      "The combat exchange is no longer pending.",
    );
    await expectCombatFailure(
      t.mutation(api.combat.cancelAttack, { exchangeId: resolvedPending._id }),
      "exchangeNotPending",
      "The combat exchange is no longer pending.",
    );
  });

  test("two concurrent responses have one winner and apply damage exactly once", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const pending = await declarePending(t, attackerId, defenderId);

    const results = await Promise.allSettled([
      t.mutation(api.combat.respondToAttack, {
        exchangeId: pending._id,
        response: { kind: "none" },
      }),
      t.mutation(api.combat.respondToAttack, {
        exchangeId: pending._id,
        response: { kind: "none" },
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const failure = await combatFailureData(Promise.reject(rejected[0]!.reason));
    expect(failure).toEqual({
      code: "exchangeNotPending",
      message: "The combat exchange is no longer pending.",
    });
    const winner = fulfilled[0]!.value;
    expect(winner.status).toBe("resolved");
    if (winner.status !== "resolved" || winner.resolution.outcome !== "hit") {
      throw new Error("Expected the winning response to hit.");
    }
    expect((await getCharacter(t, defenderId))?.current).toMatchObject(
      winner.resolution.route.body.after,
    );
    expect(await t.run((ctx) => ctx.db.get(pending._id))).toEqual(winner);
  });
});

describe("combat response stale-state finalization", () => {
  test("stales a legacy attack snapshot that differs from the current weapon profile", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const pending = await declarePending(t, attackerId, defenderId);
    await t.run((ctx) =>
      ctx.db.patch(pending._id, {
        attack: { ...pending.attack, damageFormula: "2D6", criticalOn: 19 },
      }),
    );
    const defenderBefore = await getCharacter(t, defenderId);
    const random = vi.spyOn(Math, "random");

    const outcome = await t
      .mutation(api.combat.respondToAttack, {
        exchangeId: pending._id,
        response: { kind: "none" },
      })
      .then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );
    const randomCalls = random.mock.calls.length;
    random.mockRestore();
    if (outcome.status === "rejected") throw outcome.reason;
    const stale = outcome.value;

    expect(randomCalls).toBe(0);
    expect(stale).toMatchObject({
      status: "stale",
      reason: "combatStateChanged",
      attack: { damageFormula: "2D6", criticalOn: 19 },
    });
    expect("defenseOptions" in stale).toBe(false);
    expect(await getCharacter(t, defenderId)).toEqual(defenderBefore);
  });

  test("stales changed ordered defense options before response authorization", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const pending = await declarePending(t, attackerId, defenderId);
    await t.run((ctx) =>
      ctx.db.patch(pending._id, {
        defenseOptions: [...pending.defenseOptions].reverse(),
      }),
    );
    const defenderBefore = await getCharacter(t, defenderId);
    const random = vi.spyOn(Math, "random");

    const outcome = await t
      .mutation(api.combat.respondToAttack, {
        exchangeId: pending._id,
        response: { kind: "autoDodge" },
      })
      .then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );
    const randomCalls = random.mock.calls.length;
    random.mockRestore();
    if (outcome.status === "rejected") throw outcome.reason;
    const stale = outcome.value;

    expect(randomCalls).toBe(0);
    expect(stale).toMatchObject({ status: "stale", reason: "combatStateChanged" });
    expect("defenseOptions" in stale).toBe(false);
    expect(await getCharacter(t, defenderId)).toEqual(defenderBefore);
  });

  test("stales a legacy context that no longer validates for the derived attack", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const pending = await declarePending(t, attackerId, defenderId);
    await t.run((ctx) =>
      ctx.db.patch(pending._id, {
        context: { kind: "ranged", defenderAware: true, rangeBand: "normal" },
      }),
    );
    const defenderBefore = await getCharacter(t, defenderId);
    const random = vi.spyOn(Math, "random");

    const outcome = await t
      .mutation(api.combat.respondToAttack, {
        exchangeId: pending._id,
        response: { kind: "none" },
      })
      .then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );
    const randomCalls = random.mock.calls.length;
    random.mockRestore();
    if (outcome.status === "rejected") throw outcome.reason;
    const stale = outcome.value;

    expect(randomCalls).toBe(0);
    expect(stale).toMatchObject({ status: "stale", reason: "combatStateChanged" });
    expect("defenseOptions" in stale).toBe(false);
    expect(await getCharacter(t, defenderId)).toEqual(defenderBefore);
  });

  test("stales an attack that can no longer derive a supported profile", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const pending = await declarePending(t, attackerId, defenderId);
    await t.run(async (ctx) => {
      await ctx.db.patch(attackerId, { items: [{ itemId: "wilks-320-laser-pistol" }] });
      const changed = await ctx.db.get(attackerId);
      if (changed === null) throw new Error("Expected the changed attacker to exist.");
      await ctx.db.patch(pending._id, {
        attackerStateToken: attackerCombatStateToken(deriveSheet(changed), 0),
      });
    });
    const defenderBefore = await getCharacter(t, defenderId);
    const random = vi.spyOn(Math, "random");

    const outcome = await t
      .mutation(api.combat.respondToAttack, {
        exchangeId: pending._id,
        response: { kind: "none" },
      })
      .then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );
    const randomCalls = random.mock.calls.length;
    random.mockRestore();
    if (outcome.status === "rejected") throw outcome.reason;
    const stale = outcome.value;

    expect(randomCalls).toBe(0);
    expect(stale).toMatchObject({ status: "stale", reason: "combatStateChanged" });
    expect("defenseOptions" in stale).toBe(false);
    expect(await getCharacter(t, defenderId)).toEqual(defenderBefore);
  });

  test.each([
    [
      "level",
      async (t: TestDb, id: Id<"characters">) => t.run((ctx) => ctx.db.patch(id, { level: 2 })),
    ],
    [
      "Hand-to-Hand profile",
      async (t: TestDb, id: Id<"characters">) =>
        t.run((ctx) => ctx.db.patch(id, { hthType: "none" })),
    ],
    [
      "selected weapon",
      async (t: TestDb, id: Id<"characters">) =>
        t.run((ctx) => ctx.db.patch(id, { items: [{ itemId: "hand-axe" }] })),
    ],
  ] as const)("marks a changed attacker %s stale before response dice", async (_label, change) => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const pending = await declarePending(t, attackerId, defenderId);
    const defenderBefore = await getCharacter(t, defenderId);
    await change(t, attackerId);
    const random = vi.spyOn(Math, "random");

    const stale = await t.mutation(api.combat.respondToAttack, {
      exchangeId: pending._id,
      response: { kind: "dodge" },
    });

    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    expect(stale).toMatchObject({ status: "stale", reason: "combatStateChanged" });
    expect("defenseOptions" in stale).toBe(false);
    expect(await getCharacter(t, defenderId)).toEqual(defenderBefore);
    await expectCombatFailure(
      t.mutation(api.combat.respondToAttack, {
        exchangeId: pending._id,
        response: { kind: "none" },
      }),
      "exchangeNotPending",
      "The combat exchange is no longer pending.",
    );
    await expectCombatFailure(
      t.mutation(api.combat.cancelAttack, { exchangeId: pending._id }),
      "exchangeNotPending",
      "The combat exchange is no longer pending.",
    );
  });

  test.each([
    [
      "body pools",
      async (t: TestDb, id: Id<"characters">) =>
        t.run((ctx) => ctx.db.patch(id, { current: { sdc: 19, hitPoints: 18 } })),
    ],
    [
      "defense profile",
      async (t: TestDb, id: Id<"characters">) =>
        t.run((ctx) => ctx.db.patch(id, { hthType: "none" })),
    ],
    [
      "worn armor",
      async (t: TestDb, id: Id<"characters">) =>
        t.run((ctx) =>
          ctx.db.patch(id, {
            items: [{ itemId: "gladiator", worn: true }],
            current: { armor: 0 },
          }),
        ),
    ],
  ] as const)(
    "marks changed defender %s stale without additional damage",
    async (_label, change) => {
      const t = testDb();
      const attackerId = await createCharacter(t, {
        rolled: ready,
        items: [{ itemId: "survival-knife" }],
      });
      const defenderId = await createCharacter(t, { rolled: ready });
      const pending = await declarePending(t, attackerId, defenderId);
      await change(t, defenderId);
      const defenderAfterChange = await getCharacter(t, defenderId);
      const random = vi.spyOn(Math, "random");

      const stale = await t.mutation(api.combat.respondToAttack, {
        exchangeId: pending._id,
        response: { kind: "none" },
      });

      expect(random).not.toHaveBeenCalled();
      random.mockRestore();
      expect(stale).toMatchObject({ status: "stale", reason: "combatStateChanged" });
      expect(await getCharacter(t, defenderId)).toEqual(defenderAfterChange);
    },
  );

  test("marks a changed worn-armor pool stale before protection revalidation", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "gladiator", worn: true }],
      current: { armor: 0 },
    });
    const pending = await declarePending(t, attackerId, defenderId);
    await t.run((ctx) => ctx.db.patch(defenderId, { current: { armor: 1 } }));
    const defenderAfterChange = await getCharacter(t, defenderId);
    const random = vi.spyOn(Math, "random");

    const stale = await t.mutation(api.combat.respondToAttack, {
      exchangeId: pending._id,
      response: { kind: "none" },
    });

    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    expect(stale).toMatchObject({ status: "stale", reason: "combatStateChanged" });
    expect(await getCharacter(t, defenderId)).toEqual(defenderAfterChange);
  });

  test("narrative changes on either character do not stale a valid response", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const pending = await declarePending(t, attackerId, defenderId);
    await t.run(async (ctx) => {
      await ctx.db.patch(attackerId, { narrative: { epithet: "The Declarant" } });
      await ctx.db.patch(defenderId, { narrative: { backstory: "Changed after declaration." } });
    });

    const resolved = await t.mutation(api.combat.respondToAttack, {
      exchangeId: pending._id,
      response: { kind: "none" },
    });

    expect(resolved.status).toBe("resolved");
    expect((await getCharacter(t, attackerId))?.narrative).toEqual({ epithet: "The Declarant" });
    expect((await getCharacter(t, defenderId))?.narrative).toEqual({
      backstory: "Changed after declaration.",
    });
  });

  test("unrelated P.P.E. and inventory changes survive a valid response", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: { ...ready, ppe: 100 },
      current: { ppe: 90 },
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, {
      rolled: { ...ready, ppe: 100 },
      current: { ppe: 80 },
    });
    const pending = await declarePending(t, attackerId, defenderId);
    await t.run(async (ctx) => {
      await ctx.db.patch(attackerId, {
        current: { ppe: 89 },
        items: [{ itemId: "survival-knife" }, { itemId: "canteen" }],
      });
      await ctx.db.patch(defenderId, {
        current: { ppe: 79 },
        items: [{ itemId: "canteen" }],
      });
    });

    const resolved = await t.mutation(api.combat.respondToAttack, {
      exchangeId: pending._id,
      response: { kind: "none" },
    });

    expect(resolved.status).toBe("resolved");
    expect((await getCharacter(t, attackerId))?.current?.ppe).toBe(89);
    expect((await getCharacter(t, attackerId))?.items?.at(-1)?.itemId).toBe("canteen");
    expect((await getCharacter(t, defenderId))?.current?.ppe).toBe(79);
    expect((await getCharacter(t, defenderId))?.items).toEqual([{ itemId: "canteen" }]);
  });

  test("one resolved hit stales a second exchange declared against the prior body pools", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const first = await declarePending(t, attackerId, defenderId);
    const second = await declarePending(t, attackerId, defenderId);

    const resolved = await t.mutation(api.combat.respondToAttack, {
      exchangeId: first._id,
      response: { kind: "none" },
    });
    expect(resolved.status).toBe("resolved");
    const afterFirst = await getCharacter(t, defenderId);
    const random = vi.spyOn(Math, "random");

    const stale = await t.mutation(api.combat.respondToAttack, {
      exchangeId: second._id,
      response: { kind: "none" },
    });

    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    expect(stale).toMatchObject({ status: "stale", reason: "combatStateChanged" });
    expect(await getCharacter(t, defenderId)).toEqual(afterFirst);
  });
});

describe("combat missing-state errors", () => {
  test("response and cancellation use a stable code for a deleted exchange", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const pending = await declarePending(t, attackerId, defenderId);
    await t.run((ctx) => ctx.db.delete(pending._id));

    await expectCombatFailure(
      t.mutation(api.combat.respondToAttack, {
        exchangeId: pending._id,
        response: { kind: "none" },
      }),
      "exchangeNotPending",
      "The combat exchange no longer exists.",
    );
    await expectCombatFailure(
      t.mutation(api.combat.cancelAttack, { exchangeId: pending._id }),
      "exchangeNotPending",
      "The combat exchange no longer exists.",
    );
  });

  test("response uses a stable code and preserves pending state when a combatant is missing", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const pending = await declarePending(t, attackerId, defenderId);
    await t.run((ctx) => ctx.db.delete(attackerId));

    await expectCombatFailure(
      t.mutation(api.combat.respondToAttack, {
        exchangeId: pending._id,
        response: { kind: "none" },
      }),
      "characterMissing",
      "The attacker or defender no longer exists.",
    );
    expect(await t.run((ctx) => ctx.db.get(pending._id))).toEqual(pending);
    expect(await getCharacter(t, defenderId)).not.toBeNull();
  });

  test("all character-scoped combat queries reject a deleted character with stable data", async () => {
    const t = testDb();
    const characterId = await createCharacter(t);
    await t.run((ctx) => ctx.db.delete(characterId));

    for (const query of [
      t.query(api.combat.targets, { attackerId: characterId }),
      t.query(api.combat.incoming, { defenderId: characterId }),
      t.query(api.combat.outgoing, { attackerId: characterId }),
      t.query(api.combat.recent, { characterId }),
    ]) {
      await expectCombatFailure(query, "characterMissing", "The character no longer exists.");
    }
  });
});
