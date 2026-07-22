import { convexTest } from "convex-test";
import { describe, expect, test } from "vite-plus/test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

// Real catalog content end-to-end (the #13 spell list): Heal Wounds (touch),
// Heal Self (self-only), Light Healing (exclusive either/or, others-only),
// Greater Healing (others-only), Restoration (full restoration).
const modules = {
  ...import.meta.glob("../convex/*.ts"),
  ...import.meta.glob("../convex/_generated/*.js"),
};

const vesper = {
  name: "Vesper",
  occId: "ley-line-walker",
  speciesId: "human",
  level: 1,
  attributes: { IQ: 18, ME: 16, MA: 12, PS: 16, PP: 20, PE: 14, PB: 11, Spd: 12 },
  hthType: "basic",
  psychicClass: "ordinary" as const,
  skills: [],
  spellIds: [
    "energy-bolt",
    "heal-wounds",
    "heal-self",
    "light-healing",
    "greater-healing",
    "restoration",
  ],
};

/** A saved caster with pinned vitals (P.P.E. 1000 affords even Restoration's 750). */
async function savedCaster(t: ReturnType<typeof convexTest>, name = "Vesper") {
  const id = await t.mutation(api.characters.create, { ...vesper, name });
  await t.run(async (ctx) => {
    await ctx.db.patch(id, { rolled: { hitPoints: 18, sdc: 20, ppe: 1000 } });
  });
  return id;
}

describe("healing casts — real RUE spells through castSpell (#13)", () => {
  test("Heal Wounds spends the caster's P.P.E. and heals the TARGET (3D6 S.D.C./1D6 H.P.)", async () => {
    const t = convexTest(schema, modules);
    const caster = await savedCaster(t);
    const patient = await savedCaster(t, "Kestrel");
    await t.mutation(api.characters.applyDamage, { id: patient, amount: 25 }); // sdc 0, hp 13

    const result = await t.mutation(api.characters.castSpell, {
      id: caster,
      spellId: "heal-wounds",
      targetId: patient,
    });
    expect(result.spent).toBe(10); // printed cost, RUE p.208
    expect(result.ppe).toEqual({ current: 990, max: 1000 });
    expect(result.healed?.hitPoints).toBeGreaterThanOrEqual(1);
    expect(result.healed?.hitPoints).toBeLessThanOrEqual(6);
    expect(result.healed?.sdc).toBeGreaterThanOrEqual(3);
    expect(result.healed?.sdc).toBeLessThanOrEqual(18);

    // The reported gains are exactly what landed on the patient's pools...
    const stored = await t.query(api.characters.get, { id: patient });
    expect(stored?.current).toMatchObject({
      hitPoints: 13 + result.healed!.hitPoints!,
      sdc: 0 + result.healed!.sdc!,
    });
    // ...and the caster's own pools were only touched by the spend.
    const casterStored = await t.query(api.characters.get, { id: caster });
    expect(casterStored?.current).toEqual({ ppe: 990 });
  });

  test("healing clamps at the target's maximums and a full heal ends the treatment course", async () => {
    const t = convexTest(schema, modules);
    const caster = await savedCaster(t);
    const patient = await savedCaster(t, "Kestrel");
    // One point down, mid-treatment-course: the cast must clamp AND end the course.
    await t.run(async (ctx) => {
      await ctx.db.patch(patient, { current: { hitPoints: 18, sdc: 19, treatmentDays: 2 } });
    });

    const result = await t.mutation(api.characters.castSpell, {
      id: caster,
      spellId: "heal-wounds",
      targetId: patient,
    });
    expect(result.healed?.hitPoints).toBe(0); // was already full
    expect(result.healed?.sdc).toBe(1); // post-clamp gain
    const stored = await t.query(api.characters.get, { id: patient });
    expect(stored?.current).toMatchObject({ hitPoints: 18, sdc: 20 });
    expect(stored?.current?.treatmentDays).toBeUndefined();
  });

  test("Heal Self defaults to the caster: spend and heal in one write", async () => {
    const t = convexTest(schema, modules);
    const caster = await savedCaster(t);
    await t.mutation(api.characters.applyDamage, { id: caster, amount: 22 }); // sdc 0, hp 16

    const result = await t.mutation(api.characters.castSpell, { id: caster, spellId: "heal-self" });
    expect(result.spent).toBe(20); // printed cost, RUE p.212
    expect(result.healed?.hitPoints).toBeGreaterThanOrEqual(1);
    expect(result.healed?.hitPoints).toBeLessThanOrEqual(6);
    expect(result.healed?.sdc).toBeGreaterThanOrEqual(3);
    expect(result.healed?.sdc).toBeLessThanOrEqual(18);
    const stored = await t.query(api.characters.get, { id: caster });
    expect(stored?.current).toEqual({
      ppe: 980,
      sdc: 0 + result.healed!.sdc!,
      hitPoints: 16 + result.healed!.hitPoints!,
    });
  });

  test("a self-only spell cannot be aimed at another character", async () => {
    const t = convexTest(schema, modules);
    const caster = await savedCaster(t);
    const patient = await savedCaster(t, "Kestrel");
    await expect(
      t.mutation(api.characters.castSpell, {
        id: caster,
        spellId: "heal-self",
        targetId: patient,
      }),
    ).rejects.toThrow(/only heals the caster/);
  });

  test("others-only spells refuse the caster as target (Greater Healing, RUE p.215)", async () => {
    const t = convexTest(schema, modules);
    const caster = await savedCaster(t);
    await expect(
      t.mutation(api.characters.castSpell, { id: caster, spellId: "greater-healing" }),
    ).rejects.toThrow(/cannot be used on oneself/);

    // Aimed at a patient it lands: 6D6 H.P. and 2D4x10 S.D.C., clamped.
    const patient = await savedCaster(t, "Kestrel");
    await t.mutation(api.characters.applyDamage, { id: patient, amount: 30 }); // sdc 0, hp 8
    const result = await t.mutation(api.characters.castSpell, {
      id: caster,
      spellId: "greater-healing",
      targetId: patient,
    });
    expect(result.spent).toBe(30);
    const stored = await t.query(api.characters.get, { id: patient });
    expect(stored?.current?.sdc).toBe(20); // 2D4x10 >= 20 — clamped at max
    expect(stored?.current?.hitPoints).toBeGreaterThanOrEqual(14);
    expect(stored?.current?.hitPoints).toBeLessThanOrEqual(18);
  });

  test("exclusive healing needs a chosen pool and rolls ONLY it (Light Healing, RUE p.203)", async () => {
    const t = convexTest(schema, modules);
    const caster = await savedCaster(t);
    const patient = await savedCaster(t, "Kestrel");
    await t.mutation(api.characters.applyDamage, { id: patient, amount: 25 }); // sdc 0, hp 13

    // No pool chosen: refused before anything is spent.
    await expect(
      t.mutation(api.characters.castSpell, {
        id: caster,
        spellId: "light-healing",
        targetId: patient,
      }),
    ).rejects.toThrow(/choose hitPoints or sdc/);
    expect((await t.query(api.characters.get, { id: caster }))?.current).toBeUndefined();

    // S.D.C. chosen: 1D6 to S.D.C., nothing to H.P.
    const result = await t.mutation(api.characters.castSpell, {
      id: caster,
      spellId: "light-healing",
      targetId: patient,
      healPool: "sdc",
    });
    expect(result.spent).toBe(6);
    expect(result.healed?.hitPoints).toBeUndefined();
    expect(result.healed?.sdc).toBeGreaterThanOrEqual(1);
    expect(result.healed?.sdc).toBeLessThanOrEqual(6);
    expect((await t.query(api.characters.get, { id: patient }))?.current?.hitPoints).toBe(13);

    // And it is others-only: the caster cannot Light Heal themselves.
    await expect(
      t.mutation(api.characters.castSpell, {
        id: caster,
        spellId: "light-healing",
        healPool: "sdc",
      }),
    ).rejects.toThrow(/cannot be used on oneself/);
  });

  test("Restoration fully restores both pools — even out of the coma band (RUE p.224)", async () => {
    const t = convexTest(schema, modules);
    const caster = await savedCaster(t);
    const patient = await savedCaster(t, "Kestrel");
    await t.run(async (ctx) => {
      await ctx.db.patch(patient, { current: { hitPoints: -10, sdc: 0, treatmentDays: 3 } });
    });

    const result = await t.mutation(api.characters.castSpell, {
      id: caster,
      spellId: "restoration",
      targetId: patient,
    });
    expect(result.spent).toBe(750);
    expect(result.healed).toEqual({ hitPoints: 28, sdc: 20 }); // -10 -> 18, 0 -> 20
    const stored = await t.query(api.characters.get, { id: patient });
    expect(stored?.current).toMatchObject({ hitPoints: 18, sdc: 20 });
    expect(stored?.current?.treatmentDays).toBeUndefined(); // fully mended = course over
  });

  test("a cast that cannot land spends nothing (one transaction)", async () => {
    const t = convexTest(schema, modules);
    const caster = await savedCaster(t);
    // A patient with no rolled vitals: the heal path has no maximums to clamp to.
    const patient = await t.mutation(api.characters.create, { ...vesper, name: "Unrolled" });

    await expect(
      t.mutation(api.characters.castSpell, {
        id: caster,
        spellId: "heal-wounds",
        targetId: patient,
      }),
    ).rejects.toThrow(/has not been rolled/);
    // The caster's P.P.E. is untouched — spend and heal are atomic.
    const stored = await t.query(api.characters.get, { id: caster });
    expect(stored?.current).toBeUndefined();
  });
});
