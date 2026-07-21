import {
  attackerCombatStateToken,
  defenderCombatStateToken,
  deriveAttackProfile,
  deriveSheet,
  itemCatalog,
  type Character,
  type CombatContext,
  type CombatExchangeErrorCode,
} from "@riftforge/rules";
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vite-plus/test";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
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

async function declarePendingAtTotal(
  t: TestDb,
  attackerId: Id<"characters">,
  defenderId: Id<"characters">,
  weaponItemId: string,
  strikeTotal: number,
  context: CombatContext,
) {
  const attacker = await getCharacter(t, attackerId);
  if (attacker === null) throw new Error("Expected the attacker to exist.");
  const attack = deriveAttackProfile(deriveSheet(attacker), 0);
  if (!attack.supported) throw new Error("Expected a supported attack fixture.");
  const strikeModifier = strikeTotal - attack.strikeBonus - 10;
  const random = vi.spyOn(Math, "random").mockReturnValue(0.475);
  try {
    const exchange = await t.mutation(api.combat.declareAttack, {
      attackerId,
      defenderId,
      weaponIndex: 0,
      expect: { itemId: weaponItemId },
      context: {
        ...context,
        ...(strikeModifier === 0
          ? {}
          : {
              strikeModifier,
              strikeModifierReason: "Exact integration-test strike total",
            }),
      },
    });
    if (exchange.status !== "pendingDefense") {
      throw new Error(`Expected a pending declaration at strike total ${strikeTotal}.`);
    }
    expect(exchange.strikeRoll).toMatchObject({ die: 10, total: strikeTotal });
    return exchange;
  } finally {
    random.mockRestore();
  }
}

async function respondWithDamage(
  t: TestDb,
  exchangeId: Id<"combatExchanges">,
  die: number,
  sides: number,
) {
  const random = vi.spyOn(Math, "random").mockReturnValue((die - 0.5) / sides);
  try {
    return await t.mutation(api.combat.respondToAttack, {
      exchangeId,
      response: { kind: "none" },
    });
  } finally {
    random.mockRestore();
  }
}

async function withCatalogFixture<T>(
  itemId: string,
  configure: (item: Record<string, unknown>) => void,
  run: () => Promise<T>,
): Promise<T> {
  const item = itemCatalog.items.find((candidate) => candidate.id === itemId);
  if (item === undefined) throw new Error(`Missing catalog fixture ${itemId}.`);
  const mutable = item as unknown as Record<string, unknown>;
  const original = structuredClone(mutable);
  try {
    configure(mutable);
    return await run();
  } finally {
    for (const key of Object.keys(mutable)) delete mutable[key];
    Object.assign(mutable, original);
    expect(mutable).toEqual(original);
  }
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

type ResolvedExchange = Extract<Doc<"combatExchanges">, { status: "resolved" }>;
type HitResolution = Extract<ResolvedExchange["resolution"], { outcome: "hit" }>;
type StoredDamageRoute = HitResolution["route"];
type StoredAttackSnapshot = Pick<ResolvedExchange, "attack" | "context" | "weapon">;

async function insertResolvedRoute(
  t: TestDb,
  characterId: Id<"characters">,
  serial: number,
  route: StoredDamageRoute,
  snapshot?: StoredAttackSnapshot,
) {
  const base = exchangeBase(characterId, characterId, serial);
  return t.run((ctx) =>
    ctx.db.insert("combatExchanges", {
      ...base,
      ...snapshot,
      status: "resolved",
      resolution: {
        outcome: "hit",
        reason: "unopposed",
        response: {
          kind: "none",
          bonus: 0,
          actionCost: 0,
          explanation: "No defense.",
          defenseModifier: 0,
          totalBonus: 0,
        },
        critical: false,
        damageMultiplier: 1,
        damageRoll: { dice: [4], total: 4, bonus: 0 },
        totalDamage: 4,
        route,
      },
    }),
  );
}

async function readStoredRoute(t: TestDb, exchangeId: Id<"combatExchanges">) {
  const exchange = await t.run((ctx) => ctx.db.get(exchangeId));
  if (exchange?.status !== "resolved" || exchange.resolution.outcome !== "hit") {
    throw new Error("Expected a stored resolved hit exchange.");
  }
  return exchange.resolution.route;
}

describe("combat persistence compatibility", () => {
  const unchangedBody = {
    before: { sdc: 20, hitPoints: 18 },
    after: { sdc: 20, hitPoints: 18 },
  };
  const mdcArmor = {
    kind: "mdcArmor" as const,
    itemId: "explorer-armor",
    name: "Explorer Armor",
    before: 10,
    after: 6,
  };

  test.each([
    [
      "legacy armor",
      {
        kind: "armor",
        armor: { before: 30, after: 26 },
        body: unchangedBody,
      },
    ],
    [
      "legacy body",
      {
        kind: "body",
        body: {
          before: { sdc: 3, hitPoints: 18 },
          after: { sdc: 0, hitPoints: 17 },
        },
      },
    ],
    [
      "v2 stopped",
      {
        routingVersion: 2,
        kind: "stopped",
        reason: "intactMdcImpervious",
        nativeDamage: { type: "sdc", value: 99 },
        armor: { ...mdcArmor, after: 10 },
        body: unchangedBody,
      },
    ],
    [
      "v2 armor",
      {
        routingVersion: 2,
        kind: "armor",
        nativeDamage: { type: "md", value: 4 },
        armor: mdcArmor,
        body: unchangedBody,
        finalBlastAbsorbed: false,
      },
    ],
    [
      "v2 body",
      {
        routingVersion: 2,
        kind: "body",
        nativeDamage: { type: "md", value: 1 },
        convertedDamage: { type: "sdc", value: 100 },
        armor: { ...mdcArmor, before: 0, after: 0 },
        body: {
          before: { sdc: 20, hitPoints: 18 },
          after: { sdc: 0, hitPoints: -10 },
        },
        lifeState: { before: "alive", after: "coma" },
      },
    ],
    [
      "v2 fatal",
      {
        routingVersion: 2,
        kind: "fatal",
        nativeDamage: { type: "sdc", value: 30 },
        body: {
          before: { sdc: 0, hitPoints: 10 },
          after: { sdc: 0, hitPoints: -11 },
        },
        lifeState: { before: "coma", after: "dead" },
      },
    ],
  ] satisfies ReadonlyArray<readonly [string, StoredDamageRoute]>)(
    "inserts and reads the $0 route unchanged",
    async (_label, route) => {
      const t = testDb();
      const characterId = await createCharacter(t);

      const exchangeId = await insertResolvedRoute(t, characterId, 1, route);

      expect(await readStoredRoute(t, exchangeId)).toEqual(route);
    },
  );

  test("inserts and reads an M.D. attack snapshot with its v2 route unchanged", async () => {
    const t = testDb();
    const characterId = await createCharacter(t);
    const route = {
      routingVersion: 2,
      kind: "armor",
      nativeDamage: { type: "md", value: 4 },
      armor: mdcArmor,
      body: unchangedBody,
      finalBlastAbsorbed: false,
    } satisfies StoredDamageRoute;
    const snapshot = {
      weapon: {
        index: 0,
        itemId: "wilks-320-laser-pistol",
        name: "Wilk's 320 Laser Pistol",
        category: "energyPistol",
      },
      attack: {
        kind: "ranged",
        minimumStrikeTotal: 8,
        strikeBonus: 0,
        strikeBonusSources: [{ source: "proficiency", label: "Modern W.P.", value: 0 }],
        proficiencyBonus: 0,
        damageFormula: "1D6",
        damageBonus: 0,
        criticalOn: 20,
        damageType: "md",
      },
      context: { kind: "ranged", defenderAware: true, rangeBand: "normal" },
    } satisfies StoredAttackSnapshot;

    const exchangeId = await insertResolvedRoute(t, characterId, 3, route, snapshot);
    const exchange = await t.run((ctx) => ctx.db.get(exchangeId));

    expect(exchange?.attack.damageType).toBe("md");
    expect(await readStoredRoute(t, exchangeId)).toEqual(route);
  });

  test.each([
    [
      "v2 route without native damage",
      {
        routingVersion: 2,
        kind: "stopped",
        reason: "depletedMdcShell",
        armor: { ...mdcArmor, before: 0, after: 0 },
        body: unchangedBody,
      },
    ],
    [
      "fatal route ending in coma",
      {
        routingVersion: 2,
        kind: "fatal",
        nativeDamage: { type: "sdc", value: 30 },
        body: {
          before: { sdc: 0, hitPoints: 10 },
          after: { sdc: 0, hitPoints: -10 },
        },
        lifeState: { before: "alive", after: "coma" },
      },
    ],
    [
      "legacy route with v2-only fields",
      {
        kind: "armor",
        nativeDamage: { type: "sdc", value: 4 },
        armor: { before: 30, after: 26 },
        body: unchangedBody,
      },
    ],
  ] as const)("rejects a $0", async (_label, route) => {
    const t = testDb();
    const characterId = await createCharacter(t);

    await expect(
      insertResolvedRoute(t, characterId, 2, route as unknown as StoredDamageRoute),
    ).rejects.toThrow();
  });

  test("stores the optional dead marker in character current state", async () => {
    const t = testDb();
    const current = { hitPoints: -11, sdc: 0, lifeState: "dead" as const };

    const characterId = await t.run((ctx) =>
      ctx.db.insert("characters", { ...character, current }),
    );

    expect((await getCharacter(t, characterId))?.current).toEqual(current);
  });
});

describe("combat target selector", () => {
  test("excludes self, stays bounded, and exposes exact combat readiness and protection", async () => {
    const t = convexTest(schema, modules);

    for (let index = 0; index < 52; index += 1) {
      await t.mutation(api.characters.create, {
        ...character,
        name: `Filler ${index}`,
        rolled: { hitPoints: 18, sdc: 20 },
      });
    }
    const sdcId = await t.mutation(api.characters.create, {
      ...character,
      name: "S.D.C. target",
      rolled: ready,
    });
    const unreadyBodyId = await t.mutation(api.characters.create, {
      ...character,
      name: "Unready body",
    });
    const intactMdcId = await t.mutation(api.characters.create, {
      ...character,
      name: "Intact M.D.C.",
      rolled: ready,
      items: [{ itemId: "llw-concealed-light", worn: true, rolledMdc: 39 }],
    });
    const depletedMdcId = await t.mutation(api.characters.create, {
      ...character,
      name: "Depleted M.D.C.",
      rolled: ready,
      items: [{ itemId: "llw-concealed-light", worn: true, rolledMdc: 39 }],
      current: { armor: 0 },
    });
    const unreadyArmorId = await t.mutation(api.characters.create, {
      ...character,
      name: "Unready armor",
      items: [{ itemId: "llw-concealed-light", worn: true }],
    });
    const deadId = await t.mutation(api.characters.create, {
      ...character,
      name: "Dead",
      rolled: ready,
      items: [{ itemId: "llw-concealed-light", worn: true }],
      current: { hitPoints: -14, sdc: 0, lifeState: "dead" },
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
      id: sdcId,
      name: "S.D.C. target",
      ready: true,
      lifeState: "alive",
      protection: { kind: "none" },
    });
    expect(targets).toContainEqual({
      id: unreadyBodyId,
      name: "Unready body",
      ready: false,
      lifeState: "alive",
      protection: { kind: "none" },
      disabledReason: "defenderNotReady",
    });
    expect(targets).toContainEqual({
      id: intactMdcId,
      name: "Intact M.D.C.",
      ready: true,
      lifeState: "alive",
      protection: {
        kind: "mdcArmor",
        itemId: "llw-concealed-light",
        name: "Ley Line Walker Concealed Armor (Light)",
        max: 39,
        current: 39,
      },
    });
    expect(targets).toContainEqual({
      id: depletedMdcId,
      name: "Depleted M.D.C.",
      ready: true,
      lifeState: "alive",
      protection: {
        kind: "mdcArmor",
        itemId: "llw-concealed-light",
        name: "Ley Line Walker Concealed Armor (Light)",
        max: 39,
        current: 0,
      },
    });
    expect(targets).toContainEqual({
      id: unreadyArmorId,
      name: "Unready armor",
      ready: false,
      lifeState: "alive",
      protection: {
        kind: "mdcArmor",
        itemId: "llw-concealed-light",
        name: "Ley Line Walker Concealed Armor (Light)",
      },
      disabledReason: "armorNotReady",
    });
    expect(targets).toContainEqual({
      id: deadId,
      name: "Dead",
      ready: true,
      lifeState: "dead",
      protection: {
        kind: "mdcArmor",
        itemId: "llw-concealed-light",
        name: "Ley Line Walker Concealed Armor (Light)",
      },
      disabledReason: "combatantDead",
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

  test.each([
    ["energy pistol", "wilks-320-laser-pistol", "energyPistol", "1D6"],
    ["energy rifle", "wilks-447-laser-rifle", "energyRifle", "3D6"],
  ] as const)(
    "persists a legal M.D. $0 declaration after exactly one strike roll",
    async (_label, itemId, category, damageFormula) => {
      const t = testDb();
      const attacker: Character = {
        ...character,
        name: "M.D. attacker",
        rolled: ready,
        items: [{ itemId }],
      };
      const defender: Character = { ...character, name: "M.D. defender", rolled: ready };
      const attackerId = await createCharacter(t, attacker);
      const defenderId = await createCharacter(t, defender);
      const random = vi.spyOn(Math, "random").mockReturnValue(0.5);

      const exchange = await t.mutation(api.combat.declareAttack, {
        attackerId,
        defenderId,
        weaponIndex: 0,
        expect: { itemId },
        context: {
          kind: "ranged",
          defenderAware: true,
          rangeBand: "normal",
        },
      });

      expect(random).toHaveBeenCalledTimes(1);
      random.mockRestore();
      expect(exchange).toMatchObject({
        attackerId,
        defenderId,
        weapon: { index: 0, itemId, category },
        attack: { kind: "ranged", damageFormula, damageType: "md" },
        attackerStateToken: attackerCombatStateToken(deriveSheet(attacker), 0),
        defenderStateToken: defenderCombatStateToken(deriveSheet(defender)),
        strikeRoll: { die: 11, target: 8 },
        status: "pendingDefense",
      });
      expect(await exchangeCount(t)).toBe(1);
    },
  );

  test("allows intact and depleted M.D.C. protection at declaration", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const intactDefenderId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "gladiator", worn: true }],
    });
    const depletedDefenderId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "gladiator", worn: true }],
      current: { armor: 0 },
    });
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);

    try {
      for (const defenderId of [intactDefenderId, depletedDefenderId]) {
        await t.mutation(api.combat.declareAttack, {
          attackerId,
          defenderId,
          weaponIndex: 0,
          expect: { itemId: "survival-knife" },
          context: meleeContext,
        });
      }

      expect(random).toHaveBeenCalledTimes(2);
    } finally {
      random.mockRestore();
    }
    expect(await exchangeCount(t)).toBe(2);
  });

  test.each(["attacker", "defender"] as const)(
    "rejects a dead %s before dice or insertion",
    async (deadRole) => {
      const t = testDb();
      const liveAttackerId = await createCharacter(t, {
        rolled: ready,
        items: [{ itemId: "survival-knife" }],
      });
      const deadId = await createCharacter(t, {
        rolled: ready,
        items:
          deadRole === "attacker"
            ? [{ itemId: "survival-knife" }]
            : [{ itemId: "llw-concealed-light", worn: true }],
        current: { hitPoints: -14, sdc: 0, lifeState: "dead" },
      });
      const liveDefenderId = await createCharacter(t, { rolled: ready });
      const random = vi.spyOn(Math, "random");

      try {
        await expectCombatFailure(
          t.mutation(api.combat.declareAttack, {
            attackerId: deadRole === "attacker" ? deadId : liveAttackerId,
            defenderId: deadRole === "defender" ? deadId : liveDefenderId,
            weaponIndex: 0,
            expect: { itemId: "survival-knife" },
            context: meleeContext,
          }),
          "combatantDead",
          "Dead combatants cannot enter combat.",
        );
        expect(random).not.toHaveBeenCalled();
      } finally {
        random.mockRestore();
      }
      expect(await exchangeCount(t)).toBe(0);
    },
  );

  test("rejects missing M.D.C. armor capacity before dice or insertion", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "llw-concealed-light", worn: true }],
    });
    const random = vi.spyOn(Math, "random");

    try {
      await expectCombatFailure(
        t.mutation(api.combat.declareAttack, {
          attackerId,
          defenderId,
          weaponIndex: 0,
          expect: { itemId: "survival-knife" },
          context: meleeContext,
        }),
        "armorNotReady",
        "Roll the worn M.D.C. armor capacity before entering combat.",
      );
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
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

describe("atomic tiered combat response persistence", () => {
  test.each([
    [99, "stopped", 10],
    [100, "armor", 9],
  ] as const)(
    "routes %i S.D.C. atomically against intact M.D.C. armor as %s",
    async (damage, expectedKind, expectedArmor) =>
      withCatalogFixture(
        "survival-knife",
        (item) => {
          const priorDamage = item.damage as Record<string, unknown>;
          item.damage = { ...priorDamage, formula: "1D100", type: "sdc" };
        },
        async () => {
          const t = testDb();
          const attackerId = await createCharacter(t, {
            rolled: ready,
            attributes: { ...character.attributes, PS: 10 },
            items: [{ itemId: "survival-knife" }],
          });
          const defenderId = await createCharacter(t, {
            rolled: ready,
            items: [{ itemId: "gladiator", worn: true }],
            current: { armor: 10 },
          });
          const pending = await declarePendingAtTotal(
            t,
            attackerId,
            defenderId,
            "survival-knife",
            10,
            meleeContext,
          );

          const resolved = await respondWithDamage(t, pending._id, damage, 100);

          if (resolved.status !== "resolved" || resolved.resolution.outcome !== "hit") {
            throw new Error("Expected an intact-armor hit to resolve.");
          }
          expect(resolved.resolution.totalDamage).toBe(damage);
          expect(resolved.resolution.route).toEqual(
            expectedKind === "stopped"
              ? {
                  routingVersion: 2,
                  kind: "stopped",
                  reason: "intactMdcImpervious",
                  nativeDamage: { type: "sdc", value: damage },
                  armor: {
                    kind: "mdcArmor",
                    itemId: "gladiator",
                    name: "Gladiator Full Environmental Body Armor",
                    before: 10,
                    after: 10,
                  },
                  body: {
                    before: { sdc: 20, hitPoints: 18 },
                    after: { sdc: 20, hitPoints: 18 },
                  },
                }
              : {
                  routingVersion: 2,
                  kind: "armor",
                  nativeDamage: { type: "sdc", value: damage },
                  convertedDamage: { type: "md", value: 1 },
                  armor: {
                    kind: "mdcArmor",
                    itemId: "gladiator",
                    name: "Gladiator Full Environmental Body Armor",
                    before: 10,
                    after: 9,
                  },
                  body: {
                    before: { sdc: 20, hitPoints: 18 },
                    after: { sdc: 20, hitPoints: 18 },
                  },
                  finalBlastAbsorbed: false,
                },
          );
          expect((await getCharacter(t, defenderId))?.current).toEqual({
            armor: expectedArmor,
          });
        },
      ),
  );

  test("an armor-destroying M.D. blast patches armor only", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "wilks-320-laser-pistol" }],
    });
    const defenderId = await createCharacter(t, {
      rolled: { ...ready, ppe: 100 },
      items: [{ itemId: "gladiator", worn: true }],
      current: { armor: 1, sdc: 17, hitPoints: 16, ppe: 79 },
    });
    const pending = await declarePendingAtTotal(
      t,
      attackerId,
      defenderId,
      "wilks-320-laser-pistol",
      12,
      { kind: "ranged", defenderAware: true, rangeBand: "normal" },
    );

    const resolved = await respondWithDamage(t, pending._id, 6, 6);

    if (resolved.status !== "resolved" || resolved.resolution.outcome !== "hit") {
      throw new Error("Expected the destroying M.D. blast to resolve.");
    }
    expect(resolved.resolution.totalDamage).toBe(6);
    expect(resolved.resolution.route).toEqual({
      routingVersion: 2,
      kind: "armor",
      nativeDamage: { type: "md", value: 6 },
      armor: {
        kind: "mdcArmor",
        itemId: "gladiator",
        name: "Gladiator Full Environmental Body Armor",
        before: 1,
        after: 0,
      },
      body: {
        before: { sdc: 17, hitPoints: 16 },
        after: { sdc: 17, hitPoints: 16 },
      },
      finalBlastAbsorbed: true,
    });
    expect((await getCharacter(t, defenderId))?.current).toEqual({
      armor: 0,
      sdc: 17,
      hitPoints: 16,
      ppe: 79,
    });
  });

  test.each([
    [7, "stopped", 20],
    [8, "body", 15],
  ] as const)(
    "routes an S.D.C. strike total of %i against a depleted M.D.C. shell as %s",
    async (strikeTotal, expectedKind, expectedSdc) => {
      const t = testDb();
      const attackerId = await createCharacter(t, {
        rolled: ready,
        attributes: { ...character.attributes, PS: 10 },
        items: [{ itemId: "survival-knife" }],
      });
      const defenderId = await createCharacter(t, {
        rolled: ready,
        items: [{ itemId: "gladiator", worn: true }],
        current: { armor: 0 },
      });
      const pending = await declarePendingAtTotal(
        t,
        attackerId,
        defenderId,
        "survival-knife",
        strikeTotal,
        meleeContext,
      );

      const resolved = await respondWithDamage(t, pending._id, 5, 6);

      if (resolved.status !== "resolved" || resolved.resolution.outcome !== "hit") {
        throw new Error("Expected the depleted-shell S.D.C. hit to resolve.");
      }
      expect(resolved.resolution.totalDamage).toBe(5);
      expect(resolved.resolution.route).toEqual(
        expectedKind === "stopped"
          ? {
              routingVersion: 2,
              kind: "stopped",
              reason: "depletedMdcShell",
              nativeDamage: { type: "sdc", value: 5 },
              armor: {
                kind: "mdcArmor",
                itemId: "gladiator",
                name: "Gladiator Full Environmental Body Armor",
                before: 0,
                after: 0,
              },
              body: {
                before: { sdc: 20, hitPoints: 18 },
                after: { sdc: 20, hitPoints: 18 },
              },
            }
          : {
              routingVersion: 2,
              kind: "body",
              nativeDamage: { type: "sdc", value: 5 },
              armor: {
                kind: "mdcArmor",
                itemId: "gladiator",
                name: "Gladiator Full Environmental Body Armor",
                before: 0,
                after: 0,
              },
              body: {
                before: { sdc: 20, hitPoints: 18 },
                after: { sdc: 15, hitPoints: 18 },
              },
              lifeState: { before: "alive", after: "alive" },
            },
      );
      expect((await getCharacter(t, defenderId))?.current).toEqual(
        expectedKind === "stopped" ? { armor: 0 } : { armor: 0, sdc: expectedSdc, hitPoints: 18 },
      );
    },
  );

  test("converts M.D. into body damage through a depleted M.D.C. shell", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "wilks-320-laser-pistol" }],
    });
    const defenderId = await createCharacter(t, {
      rolled: { hitPoints: 18, sdc: 120 },
      items: [{ itemId: "gladiator", worn: true }],
      current: { armor: 0 },
    });
    const pending = await declarePendingAtTotal(
      t,
      attackerId,
      defenderId,
      "wilks-320-laser-pistol",
      8,
      { kind: "ranged", defenderAware: true, rangeBand: "normal" },
    );

    const resolved = await respondWithDamage(t, pending._id, 1, 6);

    if (resolved.status !== "resolved" || resolved.resolution.outcome !== "hit") {
      throw new Error("Expected M.D. to pass through the depleted shell.");
    }
    expect(resolved.resolution.totalDamage).toBe(1);
    expect(resolved.resolution.route).toEqual({
      routingVersion: 2,
      kind: "body",
      nativeDamage: { type: "md", value: 1 },
      convertedDamage: { type: "sdc", value: 100 },
      armor: {
        kind: "mdcArmor",
        itemId: "gladiator",
        name: "Gladiator Full Environmental Body Armor",
        before: 0,
        after: 0,
      },
      body: {
        before: { sdc: 120, hitPoints: 18 },
        after: { sdc: 20, hitPoints: 18 },
      },
      lifeState: { before: "alive", after: "alive" },
    });
    expect((await getCharacter(t, defenderId))?.current).toEqual({
      armor: 0,
      sdc: 20,
      hitPoints: 18,
    });
  });

  test.each([
    [12, "armor", 0, 120],
    [13, "body", 10, 20],
  ] as const)(
    "routes M.D. at strike total %i against S.D.C. armor by A.R. as %s",
    async (strikeTotal, expectedKind, expectedArmor, expectedSdc) =>
      withCatalogFixture(
        "gladiator",
        (item) => {
          delete item.mdc;
          item.ar = 12;
          item.sdc = 50;
        },
        async () => {
          const t = testDb();
          const attackerId = await createCharacter(t, {
            rolled: ready,
            items: [{ itemId: "wilks-320-laser-pistol" }],
          });
          const defenderId = await createCharacter(t, {
            rolled: { hitPoints: 18, sdc: 120 },
            items: [{ itemId: "gladiator", worn: true }],
            current: { armor: 10 },
          });
          const pending = await declarePendingAtTotal(
            t,
            attackerId,
            defenderId,
            "wilks-320-laser-pistol",
            strikeTotal,
            { kind: "ranged", defenderAware: true, rangeBand: "normal" },
          );

          const resolved = await respondWithDamage(t, pending._id, 1, 6);

          if (resolved.status !== "resolved" || resolved.resolution.outcome !== "hit") {
            throw new Error("Expected the M.D. attack against S.D.C. armor to resolve.");
          }
          expect(resolved.resolution.totalDamage).toBe(1);
          expect(resolved.resolution.route).toEqual(
            expectedKind === "armor"
              ? {
                  routingVersion: 2,
                  kind: "armor",
                  nativeDamage: { type: "md", value: 1 },
                  convertedDamage: { type: "sdc", value: 100 },
                  armor: {
                    kind: "sdcArmor",
                    itemId: "gladiator",
                    name: "Gladiator Full Environmental Body Armor",
                    before: 10,
                    after: 0,
                  },
                  body: {
                    before: { sdc: 120, hitPoints: 18 },
                    after: { sdc: 120, hitPoints: 18 },
                  },
                  finalBlastAbsorbed: true,
                }
              : {
                  routingVersion: 2,
                  kind: "body",
                  nativeDamage: { type: "md", value: 1 },
                  convertedDamage: { type: "sdc", value: 100 },
                  armor: {
                    kind: "sdcArmor",
                    itemId: "gladiator",
                    name: "Gladiator Full Environmental Body Armor",
                    before: 10,
                    after: 10,
                  },
                  body: {
                    before: { sdc: 120, hitPoints: 18 },
                    after: { sdc: 20, hitPoints: 18 },
                  },
                  lifeState: { before: "alive", after: "alive" },
                },
          );
          expect((await getCharacter(t, defenderId))?.current).toEqual(
            expectedKind === "armor"
              ? { armor: expectedArmor }
              : { armor: expectedArmor, sdc: expectedSdc, hitPoints: 18 },
          );
        },
      ),
  );

  test.each([
    [32, "body", "coma", undefined],
    [33, "fatal", "dead", "dead"],
  ] as const)(
    "persists native damage %i at the coma floor as %s",
    async (damage, expectedKind, afterLifeState, storedLifeState) =>
      withCatalogFixture(
        "survival-knife",
        (item) => {
          const priorDamage = item.damage as Record<string, unknown>;
          item.damage = { ...priorDamage, formula: "1D100", type: "sdc" };
        },
        async () => {
          const t = testDb();
          const attackerId = await createCharacter(t, {
            rolled: ready,
            attributes: { ...character.attributes, PS: 10 },
            items: [{ itemId: "survival-knife" }],
          });
          const defenderId = await createCharacter(t, {
            rolled: { hitPoints: 18, sdc: 0 },
          });
          const pending = await declarePendingAtTotal(
            t,
            attackerId,
            defenderId,
            "survival-knife",
            10,
            meleeContext,
          );

          const resolved = await respondWithDamage(t, pending._id, damage, 100);

          if (resolved.status !== "resolved" || resolved.resolution.outcome !== "hit") {
            throw new Error("Expected the coma-floor attack to resolve.");
          }
          expect(resolved.resolution.damageRoll).toEqual({
            dice: [damage],
            bonus: 0,
            total: damage,
          });
          expect(resolved.resolution.totalDamage).toBe(damage);
          expect(resolved.resolution.route).toEqual({
            routingVersion: 2,
            kind: expectedKind,
            nativeDamage: { type: "sdc", value: damage },
            body: {
              before: { sdc: 0, hitPoints: 18 },
              after: { sdc: 0, hitPoints: -14 },
            },
            lifeState: { before: "alive", after: afterLifeState },
          });
          expect((await getCharacter(t, defenderId))?.current).toEqual({
            sdc: 0,
            hitPoints: -14,
            ...(storedLifeState === undefined ? {} : { lifeState: storedLifeState }),
          });
        },
      ),
  );
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

  test("rejects a nonzero take-the-hit modifier before dice or writes", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      name: "Attacker",
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { name: "Defender", rolled: ready });
    const pending = await declarePending(t, attackerId, defenderId);
    const defenderBefore = await getCharacter(t, defenderId);
    const exchangeBefore = await t.run((ctx) => ctx.db.get(pending._id));
    const random = vi.spyOn(Math, "random");

    try {
      await expectCombatFailure(
        t.mutation(api.combat.respondToAttack, {
          exchangeId: pending._id,
          response: {
            kind: "none",
            defenseModifier: 1,
            defenseModifierReason: "GM ruling",
          },
        }),
        "illegalDefense",
        "The combat response is invalid.",
      );
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }

    expect(await getCharacter(t, defenderId)).toEqual(defenderBefore);
    expect(await t.run((ctx) => ctx.db.get(pending._id))).toEqual(exchangeBefore);
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

  test("cleanup cancellation remains legal when a pending combatant dies", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const pending = await declarePending(t, attackerId, defenderId);
    await t.run((ctx) =>
      ctx.db.patch(defenderId, {
        current: { sdc: 0, hitPoints: -14, lifeState: "dead" },
      }),
    );
    const deadBeforeCleanup = await getCharacter(t, defenderId);

    const cancelled = await t.mutation(api.combat.cancelAttack, {
      exchangeId: pending._id,
    });

    expect(cancelled).toMatchObject({ status: "cancelled" });
    expect(await getCharacter(t, defenderId)).toEqual(deadBeforeCleanup);
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
  test("stales defender death before response dice or character writes", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const pending = await declarePending(t, attackerId, defenderId);
    await t.run((ctx) =>
      ctx.db.patch(defenderId, {
        current: { sdc: 0, hitPoints: -14, lifeState: "dead" },
      }),
    );
    const deadBeforeResponse = await getCharacter(t, defenderId);
    const random = vi.spyOn(Math, "random");

    try {
      const stale = await t.mutation(api.combat.respondToAttack, {
        exchangeId: pending._id,
        response: { kind: "none" },
      });

      expect(random).not.toHaveBeenCalled();
      expect(stale).toMatchObject({ status: "stale", reason: "combatStateChanged" });
      expect(await getCharacter(t, defenderId)).toEqual(deadBeforeResponse);
    } finally {
      random.mockRestore();
    }
  });

  test("stales lost M.D.C. armor readiness before response dice or character writes", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "llw-concealed-light", worn: true, rolledMdc: 39 }],
      current: { armor: 39 },
    });
    const pending = await declarePending(t, attackerId, defenderId);
    await t.run((ctx) =>
      ctx.db.patch(defenderId, {
        items: [{ itemId: "llw-concealed-light", worn: true }],
        current: { sdc: 20, hitPoints: 18 },
      }),
    );
    const unreadyBeforeResponse = await getCharacter(t, defenderId);
    const random = vi.spyOn(Math, "random");

    try {
      const stale = await t.mutation(api.combat.respondToAttack, {
        exchangeId: pending._id,
        response: { kind: "none" },
      });

      expect(random).not.toHaveBeenCalled();
      expect(stale).toMatchObject({ status: "stale", reason: "combatStateChanged" });
      expect(await getCharacter(t, defenderId)).toEqual(unreadyBeforeResponse);
    } finally {
      random.mockRestore();
    }
  });

  test("stales a selected M.D. weapon change before response dice or character writes", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "wilks-320-laser-pistol" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const pending = await declarePendingAtTotal(
      t,
      attackerId,
      defenderId,
      "wilks-320-laser-pistol",
      12,
      { kind: "ranged", defenderAware: true, rangeBand: "normal" },
    );
    await t.run((ctx) =>
      ctx.db.patch(attackerId, {
        items: [{ itemId: "ng-33-laser-pistol" }],
      }),
    );
    const defenderBeforeResponse = await getCharacter(t, defenderId);
    const random = vi.spyOn(Math, "random");

    try {
      const stale = await t.mutation(api.combat.respondToAttack, {
        exchangeId: pending._id,
        response: { kind: "none" },
      });

      expect(random).not.toHaveBeenCalled();
      expect(stale).toMatchObject({ status: "stale", reason: "combatStateChanged" });
      expect(await getCharacter(t, defenderId)).toEqual(defenderBeforeResponse);
    } finally {
      random.mockRestore();
    }
  });

  test("safely stales legacy v1 combat tokens before response dice", async () => {
    const t = testDb();
    const attackerId = await createCharacter(t, {
      rolled: ready,
      items: [{ itemId: "survival-knife" }],
    });
    const defenderId = await createCharacter(t, { rolled: ready });
    const pending = await declarePending(t, attackerId, defenderId);
    await t.run((ctx) =>
      ctx.db.patch(pending._id, {
        attackerStateToken: pending.attackerStateToken.replace("attacker-v2", "attacker-v1"),
        defenderStateToken: pending.defenderStateToken.replace("defender-v2", "defender-v1"),
      }),
    );
    const defenderBeforeResponse = await getCharacter(t, defenderId);
    const random = vi.spyOn(Math, "random");

    try {
      const stale = await t.mutation(api.combat.respondToAttack, {
        exchangeId: pending._id,
        response: { kind: "none" },
      });

      expect(random).not.toHaveBeenCalled();
      expect(stale).toMatchObject({ status: "stale", reason: "combatStateChanged" });
      expect(await getCharacter(t, defenderId)).toEqual(defenderBeforeResponse);
    } finally {
      random.mockRestore();
    }
  });

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
