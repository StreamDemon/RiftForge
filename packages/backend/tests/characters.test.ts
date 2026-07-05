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
      sdc: 13,
      hitPoints: 18,
    });
    expect(await t.mutation(api.characters.applyDamage, { id, amount: 20 })).toEqual({
      sdc: 0,
      hitPoints: 11,
    });
    // Overkill clamps at -(P.E.), the coma/death floor.
    expect(await t.mutation(api.characters.applyDamage, { id, amount: 999 })).toEqual({
      sdc: 0,
      hitPoints: -14,
    });
    const sheet = await t.query(api.characters.sheet, { id });
    expect(sheet?.vitals.hitPoints).toMatchObject({ rolled: 18, current: -14 });
    expect(sheet?.vitals.sdc).toMatchObject({ rolled: 20, current: 0 });

    await expect(t.mutation(api.characters.applyDamage, { id, amount: -5 })).rejects.toThrow(
      /non-negative/,
    );
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
