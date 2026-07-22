import { convexTest } from "convex-test";
import { describe, expect, test } from "vite-plus/test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = {
  ...import.meta.glob("../convex/*.ts"),
  ...import.meta.glob("../convex/_generated/*.js"),
};

/** The same level-1 Ley Line Walker the rules package pins in its tests. */
const vesper = {
  name: "Vesper",
  occId: "ley-line-walker",
  speciesId: "human",
  level: 1,
  attributes: { IQ: 18, ME: 16, MA: 12, PS: 16, PP: 20, PE: 14, PB: 11, Spd: 12 },
  hthType: "basic",
  psychicClass: "ordinary" as const,
  skills: [
    { skillId: "language-native-tongue", overrideValue: 98 },
    { skillId: "wilderness-survival", occBonus: 10 },
    { skillId: "math-basic", occBonus: 10 },
  ],
  spellIds: ["globe-of-daylight", "energy-bolt", "armor-of-ithan"],
};

describe("characters — a saved Ley Line Walker round-trips", () => {
  test("create requires and stores explicit Human identity", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.characters.create, vesper);
    expect(await t.query(api.characters.get, { id })).toMatchObject({ speciesId: "human" });
    expect(await t.query(api.characters.sheet, { id })).toMatchObject({
      species: { id: "human", name: "Human" },
    });

    const { speciesId: _speciesId, ...missing } = vesper;
    await expect(t.mutation(api.characters.create, missing as typeof vesper)).rejects.toThrow();
  });

  test("backend rejects unknown, unavailable, and attribute-ineligible writes", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.characters.create, { ...vesper, speciesId: "kryptonian" }),
    ).rejects.toThrow('Unknown species "kryptonian".');
    await expect(
      t.mutation(api.characters.create, { ...vesper, speciesId: "psi-stalker" }),
    ).rejects.toThrow("Psi-Stalker is known but not playable.");
    await expect(
      t.mutation(api.characters.create, {
        ...vesper,
        attributes: { ...vesper.attributes, PE: 11 },
      }),
    ).rejects.toThrow("P.E. 11; requires 12+.");

    const id = await t.mutation(api.characters.create, vesper);
    await expect(
      t.mutation(api.characters.update, {
        id,
        character: { ...vesper, speciesId: "psi-stalker" },
      }),
    ).rejects.toThrow("Psi-Stalker is known but not playable.");
    expect(await t.query(api.characters.get, { id })).toMatchObject({ speciesId: "human" });
  });

  test("legacy storage without speciesId derives Human without a read-time rewrite", async () => {
    const t = convexTest(schema, modules);
    const { speciesId: _speciesId, ...legacy } = vesper;
    const id = await t.run((ctx) => ctx.db.insert("characters", legacy));

    expect(await t.query(api.characters.sheet, { id })).toMatchObject({
      species: { id: "human", name: "Human" },
    });
    expect(await t.query(api.characters.get, { id })).not.toHaveProperty("speciesId");
  });

  test("create → get returns the stored choices", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.characters.create, vesper);
    const stored = await t.query(api.characters.get, { id });
    expect(stored).toMatchObject(vesper);
  });

  test("create → sheet derives the full character sheet", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.characters.create, vesper);
    const sheet = await t.query(api.characters.sheet, { id });
    if (sheet === null) throw new Error("sheet should exist for a saved character");

    expect(sheet.occ.name).toBe("Ley Line Walker");
    expect(sheet.combat).toMatchObject({ attacksPerMelee: 4, strike: 3, damageBonus: 1 });
    expect(sheet.vitals.hitPoints).toMatchObject({ min: 15, max: 20 });
    expect(sheet.ppe).toMatchObject({ min: 64, max: 214 });
    expect(sheet.spellStrength).toBe(12);
    const bySkill = Object.fromEntries(
      sheet.skills.map((s: { id: string; value: number }) => [s.id, s.value]),
    );
    expect(bySkill["language-native-tongue"]).toBe(98); // flat O.C.C. override
    expect(bySkill["wilderness-survival"]).toBe(44); // 30 + 10 + I.Q. 4
    expect(sheet.spells.count).toBe(3);
  });

  test("update replaces the choices and the sheet follows", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.characters.create, vesper);
    await t.mutation(api.characters.update, {
      id,
      character: { ...vesper, level: 3 },
    });
    const sheet = await t.query(api.characters.sheet, { id });
    if (sheet === null) throw new Error("sheet should exist for a saved character");
    expect(sheet.level).toBe(3);
    expect(sheet.ppe).toMatchObject({ min: 70, max: 250 }); // +3D6 per level from 2
  });

  test("invalid characters are rejected at the write", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.characters.create, {
        ...vesper,
        attributes: { ...vesper.attributes, PE: -3 },
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.characters.create, { ...vesper, spellIds: ["fireball-xxl"] }),
    ).rejects.toThrow(/Unknown spell/);
  });

  test("rollVitals pins concrete rolls the sheet then shows", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.characters.create, vesper);
    const rolled = await t.mutation(api.characters.rollVitals, { id });

    // P.E. 14, level 1: H.P. = 14 + 1D6 -> 15-20; S.D.C. = 2D6+12 -> 14-24;
    // Ley Line Walker P.P.E. at level 1 -> 64-214.
    expect(rolled.hitPoints).toBeGreaterThanOrEqual(15);
    expect(rolled.hitPoints).toBeLessThanOrEqual(20);
    expect(rolled.sdc).toBeGreaterThanOrEqual(14);
    expect(rolled.sdc).toBeLessThanOrEqual(24);
    expect(rolled.ppe).toBeGreaterThanOrEqual(64);
    expect(rolled.ppe).toBeLessThanOrEqual(214);

    const sheet = await t.query(api.characters.sheet, { id });
    if (sheet === null) throw new Error("sheet should exist for a saved character");
    expect(sheet.vitals.hitPoints.rolled).toBe(rolled.hitPoints);
    expect(sheet.vitals.sdc.rolled).toBe(rolled.sdc);
    expect(sheet.ppe?.rolled).toBe(rolled.ppe);
  });

  test("rollVitals replaces earlier rolls wholesale", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.characters.create, vesper);
    await t.mutation(api.characters.rollVitals, { id });
    const second = await t.mutation(api.characters.rollVitals, { id });
    const stored = await t.query(api.characters.get, { id });
    expect(stored?.rolled).toEqual(second);
  });

  test("narrative round-trips: create with it, edit it narrowly, sheet carries it", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.characters.create, {
      ...vesper,
      narrative: { epithet: "First of her line." },
    });
    let sheet = await t.query(api.characters.sheet, { id });
    if (sheet === null) throw new Error("sheet should exist for a saved character");
    expect(sheet.narrative).toEqual({ epithet: "First of her line." });

    await t.mutation(api.characters.updateNarrative, {
      id,
      narrative: {
        epithet: "The ley lines whisper.",
        traits: ["Magic Zone survivor"],
        appearance: { age: "19" },
        backstory: "She walked out of the Magic Zone on her fourteenth birthday.",
      },
    });
    sheet = await t.query(api.characters.sheet, { id });
    if (sheet === null) throw new Error("sheet should exist for a saved character");
    expect(sheet.narrative?.traits).toEqual(["Magic Zone survivor"]);
    expect(sheet.narrative?.epithet).toBe("The ley lines whisper.");

    // Clearing works, and the rest of the character is untouched.
    await t.mutation(api.characters.updateNarrative, { id, narrative: undefined });
    const stored = await t.query(api.characters.get, { id });
    expect(stored?.narrative).toBeUndefined();
    expect(stored).toMatchObject(vesper);
  });

  test("updateNarrative enforces rules-layer bounds", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.characters.create, vesper);
    await expect(
      t.mutation(api.characters.updateNarrative, {
        id,
        narrative: { traits: Array.from({ length: 13 }, (_, i) => `trait ${i}`) },
      }),
    ).rejects.toThrow();
  });

  test("alignment round-trips and resolves on the sheet", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.characters.create, { ...vesper, alignmentId: "anarchist" });
    const sheet = await t.query(api.characters.sheet, { id });
    if (sheet === null) throw new Error("sheet should exist for a saved character");
    expect(sheet.alignment).toMatchObject({ id: "anarchist", category: "selfish" });
    await expect(
      t.mutation(api.characters.create, { ...vesper, alignmentId: "lawful-good" }),
    ).rejects.toThrow(/Unknown alignment/);
  });

  test("list returns roster summaries, newest first", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.characters.list, {})).toEqual([]);
    const first = await t.mutation(api.characters.create, vesper);
    const second = await t.mutation(api.characters.create, { ...vesper, name: "Kestrel" });
    expect(await t.query(api.characters.list, {})).toEqual([
      { _id: second, name: "Kestrel", occId: "ley-line-walker", level: 1 },
      { _id: first, name: "Vesper", occId: "ley-line-walker", level: 1 },
    ]);
  });

  test("rollVitals on a missing character throws", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.characters.create, vesper);
    await t.run(async (ctx) => {
      await ctx.db.delete(id);
    });
    await expect(t.mutation(api.characters.rollVitals, { id })).rejects.toThrow(/not found/);
  });

  test("sheet of a missing character is null", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.characters.create, vesper);
    await t.run(async (ctx) => {
      await ctx.db.delete(id);
    });
    expect(await t.query(api.characters.sheet, { id })).toBeNull();
  });
});

describe("living vitals — current vs. max (#38)", () => {
  /** A saved Vesper with vitals pinned to known values (P.E. 14 -> floor -14). */
  async function savedVesper(t: ReturnType<typeof convexTest>) {
    const id = await t.mutation(api.characters.create, vesper);
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { rolled: { hitPoints: 18, sdc: 20, ppe: 84 } });
    });
    return id;
  }

  async function markDead(
    t: ReturnType<typeof convexTest>,
    id: Awaited<ReturnType<typeof savedVesper>>,
  ) {
    await t.run(async (ctx) => {
      await ctx.db.patch(id, {
        current: { sdc: 0, hitPoints: -14, lifeState: "dead" },
      });
    });
  }

  async function savedHealingVesper(t: ReturnType<typeof convexTest>, name: string) {
    const id = await t.mutation(api.characters.create, {
      ...vesper,
      name,
      spellIds: [...vesper.spellIds, "heal-wounds"],
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { rolled: { hitPoints: 18, sdc: 20, ppe: 84 } });
    });
    return id;
  }

  test("castSpell spends the spell's printed cost, floor at the server", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);

    // Energy Bolt costs 5 P.P.E. (content, RUE) — the client never names a price.
    const first = await t.mutation(api.characters.castSpell, { id, spellId: "energy-bolt" });
    expect(first).toEqual({ spent: 5, ppe: { current: 79, max: 84 } });

    // Spends accumulate; the sheet streams the live value next to the max.
    await t.mutation(api.characters.castSpell, { id, spellId: "armor-of-ithan" });
    const sheet = await t.query(api.characters.sheet, { id });
    expect(sheet?.ppe).toMatchObject({ rolled: 84, current: 69 });
  });

  test("castSpell rejects casts the character can't make", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);

    // A spell the character hasn't learned (even though the catalog has it).
    await expect(t.mutation(api.characters.castSpell, { id, spellId: "see-aura" })).rejects.toThrow(
      /does not know/,
    );

    // Not enough P.P.E. left — and a failed cast must not spend anything.
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { current: { ppe: 3 } });
    });
    await expect(
      t.mutation(api.characters.castSpell, { id, spellId: "energy-bolt" }),
    ).rejects.toThrow(/Insufficient P\.P\.E\./);
    expect((await t.query(api.characters.get, { id }))?.current).toEqual({ ppe: 3 });
  });

  test("castSpell before vitals are rolled is refused", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.characters.create, vesper);
    await expect(
      t.mutation(api.characters.castSpell, { id, spellId: "energy-bolt" }),
    ).rejects.toThrow(/Roll vitals/);
  });

  test("applyDamage depletes S.D.C. before H.P., down to the coma floor", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);

    expect(await t.mutation(api.characters.applyDamage, { id, amount: 7 })).toEqual({
      before: { sdc: 20, hitPoints: 18 },
      after: { sdc: 13, hitPoints: 18 },
      amount: 7,
      lifeState: "alive",
      sdc: 13,
      hitPoints: 18,
    });
    expect(await t.mutation(api.characters.applyDamage, { id, amount: 20 })).toEqual({
      before: { sdc: 13, hitPoints: 18 },
      after: { sdc: 0, hitPoints: 11 },
      amount: 20,
      lifeState: "alive",
      sdc: 0,
      hitPoints: 11,
    });
    await expect(t.mutation(api.characters.applyDamage, { id, amount: -5 })).rejects.toThrow(
      /non-negative/,
    );
    // Overkill clamps at -(P.E.), the coma/death floor.
    expect(await t.mutation(api.characters.applyDamage, { id, amount: 999 })).toEqual({
      before: { sdc: 0, hitPoints: 11 },
      after: { sdc: 0, hitPoints: -14 },
      amount: 999,
      lifeState: "dead",
      sdc: 0,
      hitPoints: -14,
    });
    const sheet = await t.query(api.characters.sheet, { id });
    expect(sheet?.vitals.hitPoints).toMatchObject({ rolled: 18, current: -14 });
    expect(sheet?.vitals.sdc).toMatchObject({ rolled: 20, current: 0 });
    expect(sheet?.vitals.lifeState).toBe("dead");
  });

  test.each([
    { amount: 13, lifeState: "coma" as const, marker: undefined },
    { amount: 14, lifeState: "dead" as const, marker: "dead" as const },
  ])(
    "manual damage at the P.E. floor stores $lifeState without raw overflow",
    async ({ amount, lifeState, marker }) => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(api.characters.create, {
        ...vesper,
        attributes: { ...vesper.attributes, PE: 12 },
        rolled: { hitPoints: 13, sdc: 20, ppe: 84 },
        current: { sdc: 0, hitPoints: 1 },
      });

      expect(await t.mutation(api.characters.applyDamage, { id, amount })).toEqual({
        before: { sdc: 0, hitPoints: 1 },
        after: { sdc: 0, hitPoints: -12 },
        amount,
        lifeState,
        sdc: 0,
        hitPoints: -12,
      });
      expect((await t.query(api.characters.get, { id }))?.current).toEqual({
        sdc: 0,
        hitPoints: -12,
        ...(marker === undefined ? {} : { lifeState: marker }),
      });
    },
  );

  const terminalActions = [
    {
      name: "full update",
      run: (t: ReturnType<typeof convexTest>, id: Awaited<ReturnType<typeof savedVesper>>) =>
        t.mutation(api.characters.update, {
          id,
          character: {
            ...vesper,
            name: "Resurrected by replacement",
            attributes: { ...vesper.attributes, PE: -3 },
          },
        }),
    },
    {
      name: "vitals roll",
      run: (t: ReturnType<typeof convexTest>, id: Awaited<ReturnType<typeof savedVesper>>) =>
        t.mutation(api.characters.rollVitals, { id }),
    },
    {
      name: "vitals restore",
      run: (t: ReturnType<typeof convexTest>, id: Awaited<ReturnType<typeof savedVesper>>) =>
        t.mutation(api.characters.restoreVitals, { id }),
    },
    {
      name: "further damage",
      run: (t: ReturnType<typeof convexTest>, id: Awaited<ReturnType<typeof savedVesper>>) =>
        t.mutation(api.characters.applyDamage, { id, amount: 1 }),
    },
    {
      name: "manual healing",
      run: (t: ReturnType<typeof convexTest>, id: Awaited<ReturnType<typeof savedVesper>>) =>
        t.mutation(api.characters.heal, { id, hitPoints: 1 }),
    },
    {
      name: "rest",
      run: (t: ReturnType<typeof convexTest>, id: Awaited<ReturnType<typeof savedVesper>>) =>
        t.mutation(api.characters.rest, { id, hours: 1, mode: "rest" }),
    },
    {
      name: "meditation",
      run: (t: ReturnType<typeof convexTest>, id: Awaited<ReturnType<typeof savedVesper>>) =>
        t.mutation(api.characters.rest, { id, hours: 1, mode: "meditation" }),
    },
    {
      name: "treatment",
      run: (t: ReturnType<typeof convexTest>, id: Awaited<ReturnType<typeof savedVesper>>) =>
        t.mutation(api.characters.treat, { id, professional: true }),
    },
    {
      name: "ley draw",
      run: (t: ReturnType<typeof convexTest>, id: Awaited<ReturnType<typeof savedVesper>>) =>
        t.mutation(api.characters.leyLineDraw, { id, melees: 1, atNexus: false }),
    },
    {
      name: "spell casting",
      run: (t: ReturnType<typeof convexTest>, id: Awaited<ReturnType<typeof savedVesper>>) =>
        t.mutation(api.characters.castSpell, { id, spellId: "energy-bolt" }),
    },
  ];

  test.each(terminalActions)(
    "dead characters reject $name without state change",
    async ({ run }) => {
      const t = convexTest(schema, modules);
      const id = await savedVesper(t);
      await markDead(t, id);
      const before = await t.query(api.characters.get, { id });

      await expect(run(t, id)).rejects.toThrow(/Life signs terminated/);
      expect(await t.query(api.characters.get, { id })).toEqual(before);
    },
  );

  test("cross-character healing guards both a dead caster and a dead target atomically", async () => {
    const t = convexTest(schema, modules);
    const deadCaster = await savedHealingVesper(t, "Dead caster");
    const livingTarget = await savedHealingVesper(t, "Living target");
    await markDead(t, deadCaster);
    const deadCasterBefore = await t.query(api.characters.get, { id: deadCaster });
    const livingTargetBefore = await t.query(api.characters.get, { id: livingTarget });

    await expect(
      t.mutation(api.characters.castSpell, {
        id: deadCaster,
        spellId: "heal-wounds",
        targetId: livingTarget,
      }),
    ).rejects.toThrow(/Life signs terminated/);
    expect(await t.query(api.characters.get, { id: deadCaster })).toEqual(deadCasterBefore);
    expect(await t.query(api.characters.get, { id: livingTarget })).toEqual(livingTargetBefore);

    const livingCaster = await savedHealingVesper(t, "Living caster");
    const deadTarget = await savedHealingVesper(t, "Dead target");
    await markDead(t, deadTarget);
    const livingCasterBefore = await t.query(api.characters.get, { id: livingCaster });
    const deadTargetBefore = await t.query(api.characters.get, { id: deadTarget });

    await expect(
      t.mutation(api.characters.castSpell, {
        id: livingCaster,
        spellId: "heal-wounds",
        targetId: deadTarget,
      }),
    ).rejects.toThrow(/Life signs terminated/);
    expect(await t.query(api.characters.get, { id: livingCaster })).toEqual(livingCasterBefore);
    expect(await t.query(api.characters.get, { id: deadTarget })).toEqual(deadTargetBefore);
  });

  test("dead characters may edit narrative and manage inventory without losing the marker", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);
    await markDead(t, id);

    await t.mutation(api.characters.updateNarrative, {
      id,
      narrative: { epithet: "Remembered at the ley line." },
    });
    expect((await t.query(api.characters.get, { id }))?.current?.lifeState).toBe("dead");

    expect(await t.mutation(api.characters.addItem, { id, itemId: "gladiator" })).toEqual({
      index: 0,
    });
    expect((await t.query(api.characters.get, { id }))?.current?.lifeState).toBe("dead");

    await t.mutation(api.characters.equipArmor, {
      id,
      index: 0,
      expect: { itemId: "gladiator" },
    });
    expect((await t.query(api.characters.get, { id }))?.current?.lifeState).toBe("dead");

    await t.mutation(api.characters.removeItem, {
      id,
      index: 0,
      expect: { itemId: "gladiator", worn: true },
    });
    const stored = await t.query(api.characters.get, { id });
    expect(stored?.narrative?.epithet).toBe("Remembered at the ley line.");
    expect(stored?.items).toEqual([]);
    expect(stored?.current).toEqual({ sdc: 0, hitPoints: -14, lifeState: "dead" });
  });

  test("heal recovers points, clamped at the rolled maximums", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);
    await t.mutation(api.characters.applyDamage, { id, amount: 25 }); // sdc 0, hp 13

    await t.mutation(api.characters.heal, { id, sdc: 6, hitPoints: 2 });
    let stored = await t.query(api.characters.get, { id });
    expect(stored?.current).toMatchObject({ sdc: 6, hitPoints: 15 });

    // Over-healing stops at the maximum, and untouched pools stay untouched.
    await t.mutation(api.characters.heal, { id, sdc: 999 });
    stored = await t.query(api.characters.get, { id });
    expect(stored?.current).toMatchObject({ sdc: 20, hitPoints: 15 });

    await expect(t.mutation(api.characters.heal, { id, ppe: -1 })).rejects.toThrow(/non-negative/);
  });

  test("restoreVitals resets every pool to full", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);
    await t.mutation(api.characters.applyDamage, { id, amount: 25 });
    await t.mutation(api.characters.castSpell, { id, spellId: "energy-bolt" });

    await t.mutation(api.characters.restoreVitals, { id });
    const stored = await t.query(api.characters.get, { id });
    expect(stored?.current).toBeUndefined();
    const sheet = await t.query(api.characters.sheet, { id });
    expect(sheet?.ppe).toMatchObject({ rolled: 84, current: 84 });
  });

  test("rollVitals clears the live state along with the old maximums", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);
    await t.mutation(api.characters.castSpell, { id, spellId: "energy-bolt" });
    await t.mutation(api.characters.rollVitals, { id });
    const stored = await t.query(api.characters.get, { id });
    expect(stored?.current).toBeUndefined();
  });

  test("rest recovers P.P.E. at the O.C.C.'s printed hourly rate (#41)", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { current: { ppe: 20 } });
    });

    // Ley Line Walker rests at 7/hour (not the book default 5).
    expect(await t.mutation(api.characters.rest, { id, hours: 4, mode: "rest" })).toEqual({
      gained: 28,
      ppe: { current: 48, max: 84 },
    });
    // ...and meditates at 15/hour, clamped at the permanent base.
    expect(await t.mutation(api.characters.rest, { id, hours: 3, mode: "meditation" })).toEqual({
      gained: 36,
      ppe: { current: 84, max: 84 },
    });

    await expect(t.mutation(api.characters.rest, { id, hours: -1, mode: "rest" })).rejects.toThrow(
      /non-negative integer/,
    );
    await expect(t.mutation(api.characters.rest, { id, hours: 1.5, mode: "rest" })).rejects.toThrow(
      /non-negative integer/,
    );
  });

  test("rest before vitals are rolled is refused", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.characters.create, vesper);
    await expect(t.mutation(api.characters.rest, { id, hours: 1, mode: "rest" })).rejects.toThrow(
      /Roll vitals/,
    );
  });

  test("leyLineDraw pulls the doubled Walker rate per melee (#41)", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { current: { ppe: 10 } });
    });

    // One melee on the line: LLW draws 20 (double the practitioner's 10).
    expect(await t.mutation(api.characters.leyLineDraw, { id, melees: 1, atNexus: false })).toEqual(
      { gained: 20, ppe: { current: 30, max: 84 } },
    );
    // At a nexus the Walker pulls 40 — and the draw clamps at the base.
    expect(await t.mutation(api.characters.leyLineDraw, { id, melees: 2, atNexus: true })).toEqual({
      gained: 54,
      ppe: { current: 84, max: 84 },
    });

    await expect(
      t.mutation(api.characters.leyLineDraw, { id, melees: 0.5, atNexus: false }),
    ).rejects.toThrow(/non-negative integer/);
  });

  test("treat recovers at the printed daily rates and persists the course day (#41)", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);
    await t.mutation(api.characters.applyDamage, { id, amount: 30 }); // sdc 0, hp 8

    // Day 1, non-professional: 2 H.P., 4 S.D.C. — and the course day is stored.
    expect(await t.mutation(api.characters.treat, { id, professional: false })).toEqual({
      day: 1,
      gained: { hitPoints: 2, sdc: 4 },
      hitPoints: { current: 10, max: 18 },
      sdc: { current: 4, max: 20 },
    });
    expect((await t.query(api.characters.get, { id }))?.current?.treatmentDays).toBe(1);

    // The stored counter drives the professional ramp: day 2 still pays 2 H.P...
    const day2 = await t.mutation(api.characters.treat, { id, professional: true });
    expect(day2.day).toBe(2);
    expect(day2.gained).toEqual({ hitPoints: 2, sdc: 6 });
    // ...and day 3 ramps to 4 H.P. — surviving "reloads" because it's the doc,
    // not the page, that remembers.
    const day3 = await t.mutation(api.characters.treat, { id, professional: true });
    expect(day3.day).toBe(3);
    expect(day3.gained).toEqual({ hitPoints: 4, sdc: 6 });

    // The sheet exposes the course position for the UI.
    const sheet = await t.query(api.characters.sheet, { id });
    expect(sheet?.vitals.treatmentDays).toBe(3);
  });

  test("treat accepts an explicit GM day override and restores reset the course", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);
    await t.mutation(api.characters.applyDamage, { id, amount: 30 }); // sdc 0, hp 8
    await t.mutation(api.characters.treat, { id, professional: true }); // day 1
    await t.mutation(api.characters.treat, { id, professional: true }); // day 2

    // GM declares a new injury course: back to the ramp's first day.
    const override = await t.mutation(api.characters.treat, { id, professional: true, day: 1 });
    expect(override.day).toBe(1);
    expect(override.gained.hitPoints).toBe(2); // ramp start, not the day-3 rate
    expect((await t.query(api.characters.get, { id }))?.current?.treatmentDays).toBe(1);

    await expect(
      t.mutation(api.characters.treat, { id, professional: true, day: 0 }),
    ).rejects.toThrow(/positive whole number/);
    await expect(
      t.mutation(api.characters.treat, { id, professional: true, day: 2.5 }),
    ).rejects.toThrow(/positive whole number/);

    // Full restore clears the course with the pools (fresh pools, fresh course).
    await t.mutation(api.characters.restoreVitals, { id });
    expect((await t.query(api.characters.get, { id }))?.current).toBeUndefined();
    const sheet = await t.query(api.characters.sheet, { id });
    expect(sheet?.vitals.treatmentDays).toBe(0);
  });

  test("healing to full ends the treatment course automatically", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);

    // A treat that completes the mend clears the counter in the same write.
    await t.mutation(api.characters.applyDamage, { id, amount: 3 }); // sdc 17, hp 18
    const final = await t.mutation(api.characters.treat, { id, professional: false });
    expect(final.day).toBe(1); // the day still happened (telemetry reports it)
    expect(final.sdc).toEqual({ current: 20, max: 20 });
    expect((await t.query(api.characters.get, { id }))?.current?.treatmentDays).toBeUndefined();
    const sheet = await t.query(api.characters.sheet, { id });
    expect(sheet?.vitals.treatmentDays).toBe(0);

    // A partial heal leaves the course running...
    await t.mutation(api.characters.applyDamage, { id, amount: 30 }); // sdc 0, hp 8
    await t.mutation(api.characters.treat, { id, professional: true }); // day 1
    await t.mutation(api.characters.heal, { id, sdc: 5 });
    expect((await t.query(api.characters.get, { id }))?.current?.treatmentDays).toBe(1);

    // ...and ANY route to full ends it — here a plain heal, not a treat.
    await t.mutation(api.characters.heal, { id, hitPoints: 999, sdc: 999 });
    expect((await t.query(api.characters.get, { id }))?.current?.treatmentDays).toBeUndefined();
  });

  test("treat before vitals are rolled is refused", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.characters.create, vesper);
    await expect(t.mutation(api.characters.treat, { id, professional: false })).rejects.toThrow(
      /Roll vitals/,
    );
  });

  test("castSpell refuses to aim a non-healing spell at another character (#41)", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);
    const other = await t.mutation(api.characters.create, { ...vesper, name: "Kestrel" });

    await expect(
      t.mutation(api.characters.castSpell, { id, spellId: "energy-bolt", targetId: other }),
    ).rejects.toThrow(/no healing effect/);

    // An explicit self-target on a non-healing spell is just a normal cast.
    const result = await t.mutation(api.characters.castSpell, {
      id,
      spellId: "energy-bolt",
      targetId: id,
    });
    expect(result).toEqual({ spent: 5, ppe: { current: 79, max: 84 } });
  });

  test("addItem stocks the inventory; dice-capacity armor rolls its suit (#43)", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);

    expect(await t.mutation(api.characters.addItem, { id, itemId: "canteen" })).toEqual({
      index: 0,
    });
    expect(
      await t.mutation(api.characters.addItem, { id, itemId: "wilks-320-laser-pistol" }),
    ).toEqual({ index: 1 });

    // The LLW concealed suit prints "2D6+32 M.D.C. main body" (p.113) — the
    // per-suit roll happens at acquisition and lands in the same transaction.
    const suit = await t.mutation(api.characters.addItem, { id, itemId: "llw-concealed-light" });
    expect(suit.index).toBe(2);
    expect(suit.rolledMdc).toBeGreaterThanOrEqual(34);
    expect(suit.rolledMdc).toBeLessThanOrEqual(44);
    expect((await t.query(api.characters.get, { id }))?.items?.[2]?.rolledMdc).toBe(suit.rolledMdc);

    // A fixed suit (Gladiator: 70, p.267) has nothing to roll.
    expect(await t.mutation(api.characters.addItem, { id, itemId: "gladiator" })).toEqual({
      index: 3,
    });

    await expect(t.mutation(api.characters.addItem, { id, itemId: "bfg-9000" })).rejects.toThrow(
      /Unknown item/,
    );
  });

  test("equipArmor wears one suit exclusively; the sheet surfaces its pool (#43)", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);
    await t.mutation(api.characters.addItem, { id, itemId: "canteen" }); // 0
    await t.mutation(api.characters.addItem, { id, itemId: "gladiator" }); // 1
    const suit = await t.mutation(api.characters.addItem, { id, itemId: "llw-concealed-light" }); // 2

    await expect(
      t.mutation(api.characters.equipArmor, { id, index: 0, expect: { itemId: "canteen" } }),
    ).rejects.toThrow(/Only armor can be worn/);
    await expect(
      t.mutation(api.characters.equipArmor, { id, index: 9, expect: { itemId: "gladiator" } }),
    ).rejects.toThrow(/No item at index/);

    await t.mutation(api.characters.equipArmor, {
      id,
      index: 1,
      expect: { itemId: "gladiator" },
    });
    let sheet = await t.query(api.characters.sheet, { id });
    expect(sheet?.armor).toMatchObject({ max: 70, current: 70 }); // Gladiator, p.267

    // Swapping suits moves the worn flag and the pool follows the new suit.
    await t.mutation(api.characters.equipArmor, {
      id,
      index: 2,
      expect: { itemId: "llw-concealed-light", rolledMdc: suit.rolledMdc },
    });
    sheet = await t.query(api.characters.sheet, { id });
    expect(sheet?.armor?.max).toBe(suit.rolledMdc);
    expect((await t.query(api.characters.get, { id }))?.items?.[1]?.worn).toBeUndefined();

    // Doff verifies the worn suit's snapshot too — a stale one is refused...
    await expect(
      t.mutation(api.characters.equipArmor, {
        id,
        index: null,
        expect: { itemId: "gladiator", worn: true },
      }),
    ).rejects.toThrow(/manifest changed/);
    // ...and the matching snapshot unequips: no worn armor, no armor layer.
    await t.mutation(api.characters.equipArmor, {
      id,
      index: null,
      expect: { itemId: "llw-concealed-light", worn: true, rolledMdc: suit.rolledMdc },
    });
    sheet = await t.query(api.characters.sheet, { id });
    expect(sheet?.armor).toBeUndefined();

    // Nothing worn: doff is already satisfied — a no-op, snapshot or not.
    await t.mutation(api.characters.equipArmor, { id, index: null });
  });

  test("toArmor damage lands on the worn suit and never spills onto the body (#43)", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);
    await t.mutation(api.characters.addItem, { id, itemId: "gladiator" });
    await t.mutation(api.characters.equipArmor, {
      id,
      index: 0,
      expect: { itemId: "gladiator" },
    });

    // "Subtract the damage from the armor's S.D.C." (RUE p.287).
    expect(await t.mutation(api.characters.applyDamage, { id, amount: 30, toArmor: true })).toEqual(
      { armor: 40, amount: 30, lifeState: "alive" },
    );
    await expect(
      t.mutation(api.characters.applyDamage, { id, amount: -5, toArmor: true }),
    ).rejects.toThrow(/non-negative/);
    // The depleting hit is fully absorbed — the body pools stay untouched
    // (only FUTURE attacks reach the body once the suit reads 0).
    expect(await t.mutation(api.characters.applyDamage, { id, amount: 99, toArmor: true })).toEqual(
      { armor: 0, amount: 99, lifeState: "alive" },
    );
    const sheet = await t.query(api.characters.sheet, { id });
    expect(sheet?.armor).toMatchObject({ max: 70, current: 0 });
    expect(sheet?.vitals.hitPoints.current).toBe(18);
    expect(sheet?.vitals.sdc.current).toBe(20);

    // A depleted suit "no longer affords protection" (p.287) — further armor
    // hits are refused, not silently soaked at zero.
    await expect(
      t.mutation(api.characters.applyDamage, { id, amount: 5, toArmor: true }),
    ).rejects.toThrow(/depleted/);
  });

  test("re-equipping the worn suit is a no-op — a click can't repair the pool (#43)", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);
    await t.mutation(api.characters.addItem, { id, itemId: "gladiator" });
    await t.mutation(api.characters.equipArmor, {
      id,
      index: 0,
      expect: { itemId: "gladiator" },
    });
    await t.mutation(api.characters.applyDamage, { id, amount: 30, toArmor: true }); // 40/70

    await t.mutation(api.characters.equipArmor, {
      id,
      index: 0,
      expect: { itemId: "gladiator", worn: true },
    });
    const sheet = await t.query(api.characters.sheet, { id });
    expect(sheet?.armor).toMatchObject({ max: 70, current: 40 }); // NOT refilled
  });

  test("index-based inventory writes verify the instance snapshot (#43)", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);
    await t.mutation(api.characters.addItem, { id, itemId: "canteen" }); // 0
    await t.mutation(api.characters.addItem, { id, itemId: "gladiator" }); // 1

    // The manifest shifted under the click (index 0 is not the pistol) — refuse.
    await expect(
      t.mutation(api.characters.removeItem, {
        id,
        index: 0,
        expect: { itemId: "wilks-320-laser-pistol" },
      }),
    ).rejects.toThrow(/manifest changed/);
    await expect(
      t.mutation(api.characters.equipArmor, {
        id,
        index: 1,
        expect: { itemId: "gladiator", worn: true }, // stale: not worn yet
      }),
    ).rejects.toThrow(/manifest changed/);
    // Equipping without a snapshot is refused outright.
    await expect(t.mutation(api.characters.equipArmor, { id, index: 1 })).rejects.toThrow(
      /expected item snapshot/,
    );
    // A real manifest shift can leave the stale index valid but occupied by a
    // different instance: removing slot 0 shifts the Gladiator to 0, then the
    // pistol takes its old slot 1. The stale Gladiator click must not remove it.
    await t.mutation(api.characters.removeItem, {
      id,
      index: 0,
      expect: { itemId: "canteen" },
    });
    await t.mutation(api.characters.addItem, { id, itemId: "wilks-320-laser-pistol" });
    await expect(
      t.mutation(api.characters.removeItem, {
        id,
        index: 1,
        expect: { itemId: "gladiator" },
      }),
    ).rejects.toThrow(/manifest changed/);
    // Nothing was written by the refused stale click.
    expect((await t.query(api.characters.get, { id }))?.items).toEqual([
      { itemId: "gladiator" },
      { itemId: "wilks-320-laser-pistol" },
    ]);
  });

  test("toArmor without a worn (or rolled) suit is refused (#43)", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);
    await expect(
      t.mutation(api.characters.applyDamage, { id, amount: 5, toArmor: true }),
    ).rejects.toThrow(/No armor is worn/);

    // A worn dice-capacity suit that somehow lost its roll has no pool yet.
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { items: [{ itemId: "llw-concealed-light", worn: true }] });
    });
    await expect(
      t.mutation(api.characters.applyDamage, { id, amount: 5, toArmor: true }),
    ).rejects.toThrow(/has not been rolled/);
  });

  test("removeItem drops the instance; removing the worn suit clears its pool (#43)", async () => {
    const t = convexTest(schema, modules);
    const id = await savedVesper(t);
    await t.mutation(api.characters.addItem, { id, itemId: "gladiator" }); // 0
    await t.mutation(api.characters.addItem, { id, itemId: "canteen" }); // 1
    await t.mutation(api.characters.equipArmor, {
      id,
      index: 0,
      expect: { itemId: "gladiator" },
    });
    await t.mutation(api.characters.applyDamage, { id, amount: 30, toArmor: true });

    await expect(
      t.mutation(api.characters.removeItem, { id, index: 5, expect: { itemId: "canteen" } }),
    ).rejects.toThrow(/No item at index/);

    await t.mutation(api.characters.removeItem, {
      id,
      index: 0,
      expect: { itemId: "gladiator", worn: true },
    });
    const stored = await t.query(api.characters.get, { id });
    expect(stored?.items).toEqual([{ itemId: "canteen" }]);
    // current.armor measured the removed suit — it can't outlive it.
    expect(stored?.current?.armor).toBeUndefined();
  });

  test("illegal `current` states are rejected at every write", async () => {
    const t = convexTest(schema, modules);
    // Above the maximum on create.
    await expect(
      t.mutation(api.characters.create, {
        ...vesper,
        rolled: { ppe: 84 },
        current: { ppe: 90 },
      }),
    ).rejects.toThrow(/exceeds the rolled maximum/);
    // Without a rolled maximum on create.
    await expect(
      t.mutation(api.characters.create, { ...vesper, current: { ppe: 10 } }),
    ).rejects.toThrow(/requires rolled/);
  });
});
