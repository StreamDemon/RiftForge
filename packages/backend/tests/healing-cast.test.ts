import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vite-plus/test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

// The level 1-4 catalog has no healing spell yet (real ones — Heal Wounds L6
// et al. — arrive with #13), so this file grafts synthetic ones onto the
// catalog to exercise castSpell's healing paths end-to-end: `getSpell` serves
// them, and `deriveSheet` ignores them so validation-on-write still passes.
// Everything else is the real rules layer. When #13 lands real healing
// spells, these tests can switch to content and drop the mock.
vi.mock("@riftforge/rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@riftforge/rules")>();
  const touchHeal = actual.spellSchema.parse({
    id: "test-heal-wounds",
    name: "Test Heal Wounds",
    level: 6,
    ppe: 10,
    range: "Touch",
    duration: "Instant",
    savingThrow: "none",
    healing: { hitPoints: "2D6", sdc: "3D6", target: "touch" },
    page: 1,
  });
  const selfHeal = actual.spellSchema.parse({
    ...touchHeal,
    id: "test-self-mend",
    name: "Test Self Mend",
    ppe: 6,
    range: "Self",
    healing: { hitPoints: "1D6", target: "self" },
  });
  const grafted = new Map([
    [touchHeal.id, touchHeal],
    [selfHeal.id, selfHeal],
  ]);
  return {
    ...actual,
    getSpell: (id: string) => grafted.get(id) ?? actual.getSpell(id),
    deriveSheet: (input: Parameters<typeof actual.deriveSheet>[0]) =>
      actual.deriveSheet({
        ...input,
        spellIds: input.spellIds?.filter((id) => !grafted.has(id)),
      }),
  };
});

const modules = {
  ...import.meta.glob("../convex/*.ts"),
  ...import.meta.glob("../convex/_generated/*.js"),
};

const vesper = {
  name: "Vesper",
  occId: "ley-line-walker",
  level: 1,
  attributes: { IQ: 18, ME: 16, MA: 12, PS: 16, PP: 20, PE: 14, PB: 11, Spd: 12 },
  hthType: "basic",
  psychicClass: "ordinary" as const,
  skills: [],
  spellIds: ["energy-bolt"],
};

/** A saved character with pinned vitals who knows the grafted healing spells. */
async function savedCaster(t: ReturnType<typeof convexTest>, name = "Vesper") {
  const id = await t.mutation(api.characters.create, { ...vesper, name });
  await t.run(async (ctx) => {
    await ctx.db.patch(id, {
      rolled: { hitPoints: 18, sdc: 20, ppe: 84 },
      spellIds: [...vesper.spellIds, "test-heal-wounds", "test-self-mend"],
    });
  });
  return id;
}

describe("healing casts — castSpell with a target (#41)", () => {
  test("a touch heal spends the caster's P.P.E. and heals the TARGET", async () => {
    const t = convexTest(schema, modules);
    const caster = await savedCaster(t);
    const patient = await savedCaster(t, "Kestrel");
    await t.mutation(api.characters.applyDamage, { id: patient, amount: 25 }); // sdc 0, hp 13

    const result = await t.mutation(api.characters.castSpell, {
      id: caster,
      spellId: "test-heal-wounds",
      targetId: patient,
    });
    expect(result.spent).toBe(10);
    expect(result.ppe).toEqual({ current: 74, max: 84 });
    // 2D6 H.P. / 3D6 S.D.C., rolled server-side.
    expect(result.healed?.hitPoints).toBeGreaterThanOrEqual(2);
    expect(result.healed?.hitPoints).toBeLessThanOrEqual(12);
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
    expect(casterStored?.current).toEqual({ ppe: 74 });
  });

  test("healing clamps at the target's rolled maximums and reports the real gain", async () => {
    const t = convexTest(schema, modules);
    const caster = await savedCaster(t);
    const patient = await savedCaster(t, "Kestrel");
    await t.mutation(api.characters.applyDamage, { id: patient, amount: 1 }); // sdc 19, hp 18
    // A treatment course underway: the full heal below must end it.
    await t.run(async (ctx) => {
      await ctx.db.patch(patient, { current: { hitPoints: 18, sdc: 19, treatmentDays: 2 } });
    });

    const result = await t.mutation(api.characters.castSpell, {
      id: caster,
      spellId: "test-heal-wounds",
      targetId: patient,
    });
    // H.P. was already full; S.D.C. was 1 short — gains are post-clamp.
    expect(result.healed?.hitPoints).toBe(0);
    expect(result.healed?.sdc).toBe(1);
    const stored = await t.query(api.characters.get, { id: patient });
    expect(stored?.current).toMatchObject({ hitPoints: 18, sdc: 20 });
    // Fully mended by the cast → the treatment course ended with it.
    expect(stored?.current?.treatmentDays).toBeUndefined();
  });

  test("targetId defaults to the caster: spend and heal in one write", async () => {
    const t = convexTest(schema, modules);
    const caster = await savedCaster(t);
    await t.mutation(api.characters.applyDamage, { id: caster, amount: 22 }); // sdc 0, hp 16

    const result = await t.mutation(api.characters.castSpell, {
      id: caster,
      spellId: "test-self-mend",
    });
    expect(result.spent).toBe(6);
    expect(result.healed?.hitPoints).toBeGreaterThanOrEqual(1);
    expect(result.healed?.sdc).toBeUndefined(); // spell declares no S.D.C.
    const stored = await t.query(api.characters.get, { id: caster });
    expect(stored?.current).toEqual({
      ppe: 78,
      sdc: 0,
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
        spellId: "test-self-mend",
        targetId: patient,
      }),
    ).rejects.toThrow(/only heals the caster/);
  });

  test("a cast that cannot land spends nothing (one transaction)", async () => {
    const t = convexTest(schema, modules);
    const caster = await savedCaster(t);
    // A patient with no rolled vitals: the heal path has no maximums to clamp to.
    const patient = await t.mutation(api.characters.create, { ...vesper, name: "Unrolled" });

    await expect(
      t.mutation(api.characters.castSpell, {
        id: caster,
        spellId: "test-heal-wounds",
        targetId: patient,
      }),
    ).rejects.toThrow(/has not been rolled/);
    // The caster's P.P.E. is untouched — spend and heal are atomic.
    const stored = await t.query(api.characters.get, { id: caster });
    expect(stored?.current).toBeUndefined();
  });
});
