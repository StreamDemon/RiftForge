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
