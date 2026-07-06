import {
  applyDamage as damagePools,
  characterSchema,
  comaDeathFloor,
  deriveSheet,
  getOcc,
  getSpell,
  leyLineDraw as leyLineDrawAmount,
  restRecovery,
  rollHitPoints,
  rollPhysicalSdc,
  rollPpe,
  rollSpellHealing,
  treatmentRecovery,
  type Character,
} from "@riftforge/rules";
import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { characterFields } from "./schema";

/** A stored character document: the fields plus Convex's system columns. */
const characterDoc = v.object({
  ...characterFields,
  _id: v.id("characters"),
  _creationTime: v.number(),
});

/** Write-side shape: fields the rules layer defaults may be omitted. */
const characterInputFields = {
  ...characterFields,
  psychicClass: v.optional(characterFields.psychicClass),
  skills: v.optional(characterFields.skills),
  spellIds: v.optional(characterFields.spellIds),
};

/**
 * Validate raw input through the rules layer before it can be stored.
 * `characterSchema.parse` rejects bad shapes/values and applies defaults
 * (psychicClass, skills, spellIds); the throwaway `deriveSheet` call then
 * proves the character actually derives — rejecting unknown O.C.C./skill/
 * spell/H2H ids and illegal duplicates — so every stored doc is a
 * fully-resolved `Character` that the sheet query cannot fail on.
 */
function validateCharacter(input: unknown): Character {
  const character = characterSchema.parse(input);
  deriveSheet(character);
  return character;
}

/** Load a stored character or throw; returns the parsed choices sans system columns. */
async function loadCharacter(ctx: MutationCtx, id: Id<"characters">): Promise<Character> {
  const doc = await ctx.db.get(id);
  if (doc === null) throw new Error(`Character ${id} not found.`);
  const { _id, _creationTime, ...stored } = doc;
  return characterSchema.parse(stored);
}

/**
 * Write a new live-vitals state. Round-trips through the rules layer first
 * (like every write), so a `current` that exceeds its maximum or sinks below
 * the coma/death floor can never be stored — mutations compute legal values,
 * this is the backstop.
 */
async function patchCurrent(
  ctx: MutationCtx,
  id: Id<"characters">,
  character: Character,
  current: Character["current"],
): Promise<void> {
  validateCharacter({ ...character, current });
  await ctx.db.patch(id, { current });
}

export const create = mutation({
  args: characterInputFields,
  returns: v.id("characters"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("characters", validateCharacter(args));
  },
});

export const update = mutation({
  args: { id: v.id("characters"), character: v.object(characterInputFields) },
  returns: v.null(),
  handler: async (ctx, { id, character }) => {
    await ctx.db.replace(id, validateCharacter(character));
    return null;
  },
});

/**
 * Replace the player-authored narrative (epithet, appearance, traits,
 * backstory) without resubmitting the whole build. Story, not mechanics —
 * but it still round-trips through the rules layer so bounds (trait count,
 * lengths) are enforced at the write. Passing no narrative clears it.
 */
export const updateNarrative = mutation({
  args: {
    id: v.id("characters"),
    narrative: characterFields.narrative,
  },
  returns: v.null(),
  handler: async (ctx, { id, narrative }) => {
    const doc = await ctx.db.get(id);
    if (doc === null) throw new Error(`Character ${id} not found.`);
    const { _id, _creationTime, ...stored } = doc;
    validateCharacter({ ...stored, narrative });
    await ctx.db.patch(id, { narrative });
    return null;
  },
});

/**
 * Roll the character's dice-derived vitals — Hit Points, physical S.D.C., and
 * (for P.P.E.-bearing O.C.C.s) permanent P.P.E. — and pin the results on the
 * document, so the sheet shows concrete values instead of ranges. Rerolls and
 * replaces any previous results.
 *
 * A mutation, not an action: Convex mutations get seeded randomness
 * (`Math.random` is replay-safe here), and rolling + persisting in one
 * transaction means a roll can never be observed and then lost.
 */
export const rollVitals = mutation({
  args: { id: v.id("characters") },
  returns: v.object({
    hitPoints: v.number(),
    sdc: v.number(),
    ppe: v.optional(v.number()),
  }),
  handler: async (ctx, { id }) => {
    const character = await loadCharacter(ctx, id);
    const occ = getOcc(character.occId);
    if (!occ) throw new Error(`Unknown O.C.C. "${character.occId}".`);
    const pe = character.attributes.PE;
    const rolled = {
      hitPoints: rollHitPoints(pe, character.level),
      sdc: rollPhysicalSdc(),
      ...(occ.ppe ? { ppe: rollPpe(occ, pe, character.level) } : {}),
    };
    // New maximums invalidate the old live state — a reroll is a fresh start,
    // so clear `current` (absent = at maximum) rather than carry stale spend.
    await ctx.db.patch(id, { rolled, current: undefined });
    return rolled;
  },
});

/**
 * Add server-derived amounts into the live pools, clamped at the rolled
 * maximums — the ONE heal path every recovery lands through (`heal`, `rest`,
 * `treat`, `leyLineDraw`, healing casts). Returns the next `current` plus
 * what each pool actually gained after clamping (what telemetry reports).
 */
function healPools(
  character: Character,
  amounts: { hitPoints?: number; sdc?: number; ppe?: number },
): {
  current: NonNullable<Character["current"]>;
  gained: { hitPoints: number; sdc: number; ppe: number };
} {
  const current = { ...character.current };
  const gained = { hitPoints: 0, sdc: 0, ppe: 0 };
  for (const field of ["hitPoints", "sdc", "ppe"] as const) {
    const amount = amounts[field];
    if (amount === undefined) continue;
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error(`heal.${field} must be a non-negative integer, got ${amount}.`);
    }
    const max = character.rolled?.[field];
    if (max === undefined) {
      throw new Error(`Cannot heal ${field} — it has not been rolled.`);
    }
    const before = current[field] ?? max;
    current[field] = Math.min(max, before + amount);
    gained[field] = current[field] - before;
  }
  // A fully mended body ends the treatment course: once BOTH battle-injury
  // pools sit at their rolled maximums, the day counter clears itself — the
  // next treatment starts a new course at day 1. Sitting in the shared heal
  // path, this covers every route to full: treatment, manual heals, and
  // healing casts.
  if (current.treatmentDays !== undefined && fullyMended(current, character.rolled)) {
    delete current.treatmentDays;
  }
  return { current, gained };
}

/** Whether both battle-injury pools are at their rolled maximums. */
function fullyMended(
  current: NonNullable<Character["current"]>,
  rolled: Character["rolled"],
): boolean {
  return (
    rolled?.hitPoints !== undefined &&
    rolled.sdc !== undefined &&
    (current.hitPoints ?? rolled.hitPoints) === rolled.hitPoints &&
    (current.sdc ?? rolled.sdc) === rolled.sdc
  );
}

/**
 * Cast a known spell: decrement live P.P.E. by its printed cost. The cost is
 * derived server-side from the spell id — the client never names a price.
 * Rejects casts the character can't afford (the sheet greys those out, but
 * the server is the authority) and casts before vitals are rolled (no
 * maximum to spend from).
 *
 * Healing spells also roll their structured dice server-side (mutations get
 * seeded randomness) and land them on the TARGET — `targetId` defaults to the
 * caster — through the clamped heal path. Spend and heal are one transaction:
 * a cast that can't land (unknown target, unrolled pools) spends nothing.
 */
export const castSpell = mutation({
  args: {
    id: v.id("characters"),
    spellId: v.string(),
    targetId: v.optional(v.id("characters")),
  },
  returns: v.object({
    spent: v.number(),
    ppe: v.object({ current: v.number(), max: v.number() }),
    /** Post-clamp points the target actually recovered, per declared pool. */
    healed: v.optional(
      v.object({ hitPoints: v.optional(v.number()), sdc: v.optional(v.number()) }),
    ),
  }),
  handler: async (ctx, { id, spellId, targetId }) => {
    const character = await loadCharacter(ctx, id);
    if (!character.spellIds.includes(spellId)) {
      throw new Error(`Character does not know the spell "${spellId}".`);
    }
    const spell = getSpell(spellId);
    if (!spell) throw new Error(`Unknown spell "${spellId}".`);
    const aimedAtOther = targetId !== undefined && targetId !== id;
    if (spell.healing === undefined && aimedAtOther) {
      throw new Error(`${spell.name} has no healing effect to aim at another character.`);
    }
    if (spell.healing?.target === "self" && aimedAtOther) {
      throw new Error(`${spell.name} only heals the caster.`);
    }
    const max = character.rolled?.ppe;
    if (max === undefined) throw new Error("Roll vitals before casting — no P.P.E. to spend.");
    const available = character.current?.ppe ?? max;
    if (spell.ppe > available) {
      throw new Error(
        `Insufficient P.P.E.: ${spell.name} costs ${spell.ppe}, ${available} remaining.`,
      );
    }
    const remaining = available - spell.ppe;
    const spentCurrent = { ...character.current, ppe: remaining };

    const amounts = spell.healing ? rollSpellHealing(spell) : undefined;
    if (amounts === undefined) {
      await patchCurrent(ctx, id, character, spentCurrent);
      return { spent: spell.ppe, ppe: { current: remaining, max } };
    }
    const report = (gained: { hitPoints: number; sdc: number }) => ({
      ...(amounts.hitPoints !== undefined ? { hitPoints: gained.hitPoints } : {}),
      ...(amounts.sdc !== undefined ? { sdc: gained.sdc } : {}),
    });
    if (!aimedAtOther) {
      const { current, gained } = healPools({ ...character, current: spentCurrent }, amounts);
      await patchCurrent(ctx, id, character, current);
      return { spent: spell.ppe, ppe: { current: remaining, max }, healed: report(gained) };
    }
    // Cross-document: spend on the caster, heal the target — one transaction,
    // the first table-shaped interaction (VTT groundwork).
    const target = await loadCharacter(ctx, targetId);
    const { current: targetCurrent, gained } = healPools(target, amounts);
    await patchCurrent(ctx, id, character, spentCurrent);
    await patchCurrent(ctx, targetId, target, targetCurrent);
    return { spent: spell.ppe, ppe: { current: remaining, max }, healed: report(gained) };
  },
});

/**
 * Deal damage to the live pools: S.D.C. absorbs first, the overflow comes off
 * Hit Points, which stop at the -(P.E.) coma/death floor (rules-layer
 * `applyDamage`, RUE pp.287/347).
 */
export const applyDamage = mutation({
  args: { id: v.id("characters"), amount: v.number() },
  returns: v.object({ sdc: v.number(), hitPoints: v.number() }),
  handler: async (ctx, { id, amount }) => {
    const character = await loadCharacter(ctx, id);
    const rolled = character.rolled;
    if (rolled?.hitPoints === undefined || rolled.sdc === undefined) {
      throw new Error("Roll vitals before applying damage — no pools to deplete.");
    }
    const pool = {
      sdc: character.current?.sdc ?? rolled.sdc,
      hitPoints: character.current?.hitPoints ?? rolled.hitPoints,
    };
    const next = damagePools(pool, amount, comaDeathFloor(character.attributes.PE));
    await patchCurrent(ctx, id, character, { ...character.current, ...next });
    return next;
  },
});

/**
 * Recover points into one or more pools, clamped at the rolled maximums.
 * Amounts are how much to ADD (a first-aid roll, a GM adjustment) — full
 * recovery is `restoreVitals`; book *rates* are `rest`/`treat`/`leyLineDraw`.
 */
export const heal = mutation({
  args: {
    id: v.id("characters"),
    hitPoints: v.optional(v.number()),
    sdc: v.optional(v.number()),
    ppe: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...amounts }) => {
    const character = await loadCharacter(ctx, id);
    const { current } = healPools(character, amounts);
    await patchCurrent(ctx, id, character, current);
    return null;
  },
});

/**
 * Rest or meditate for a number of hours, recovering P.P.E. at the printed
 * rate (RUE p.186), honoring the O.C.C.'s own rates (the Ley Line Walker
 * rests at 7/15 instead of the default 5/10). The client names TIME — hours
 * are GM-adjudicated input, never a wall clock — and the server derives the
 * points and lands them through the clamped heal path, never above the
 * permanent base.
 */
export const rest = mutation({
  args: {
    id: v.id("characters"),
    hours: v.number(),
    mode: v.union(v.literal("rest"), v.literal("meditation")),
  },
  returns: v.object({
    gained: v.number(),
    ppe: v.object({ current: v.number(), max: v.number() }),
  }),
  handler: async (ctx, { id, hours, mode }) => {
    const character = await loadCharacter(ctx, id);
    const occ = getOcc(character.occId);
    if (!occ) throw new Error(`Unknown O.C.C. "${character.occId}".`);
    const max = character.rolled?.ppe;
    if (max === undefined) throw new Error("Roll vitals before resting — no P.P.E. to recover.");
    // `restRecovery` rejects hours that aren't a whole, non-negative count.
    const { current, gained } = healPools(character, {
      ppe: restRecovery(hours, mode, occ),
    });
    await patchCurrent(ctx, id, character, current);
    return { gained: gained.ppe, ppe: { current: current.ppe ?? max, max } };
  },
});

/**
 * Draw P.P.E. from a ley line (or nexus) the character is standing at:
 * the printed supplemental rate per melee round, honoring the O.C.C.
 * override — the Ley Line Walker draws double (RUE p.186).
 */
export const leyLineDraw = mutation({
  args: {
    id: v.id("characters"),
    melees: v.number(),
    atNexus: v.boolean(),
  },
  returns: v.object({
    gained: v.number(),
    ppe: v.object({ current: v.number(), max: v.number() }),
  }),
  handler: async (ctx, { id, melees, atNexus }) => {
    const character = await loadCharacter(ctx, id);
    const occ = getOcc(character.occId);
    if (!occ) throw new Error(`Unknown O.C.C. "${character.occId}".`);
    if (occ.ppe === undefined) {
      throw new Error(`${occ.name} is not a practitioner of magic — no ley line draw.`);
    }
    const max = character.rolled?.ppe;
    if (max === undefined) throw new Error("Roll vitals before drawing — no P.P.E. to recover.");
    // `leyLineDrawAmount` rejects melees that aren't a whole, non-negative count.
    const { current, gained } = healPools(character, {
      ppe: leyLineDrawAmount(melees, atNexus, occ),
    });
    await patchCurrent(ctx, id, character, current);
    return { gained: gained.ppe, ppe: { current: current.ppe ?? max, max } };
  },
});

/**
 * One day of battle-injury treatment (RUE p.354): H.P. and S.D.C. recover at
 * the printed daily rates. Professional care ramps (2 H.P./day for the first
 * two days of the course, then 4), so the course position is PERSISTED —
 * `current.treatmentDays` counts the days already applied, and each call
 * advances it. A full restore or vitals reroll clears it with the rest of
 * `current` (fresh pools, fresh course).
 *
 * `day` is the GM override: which course day this is (1-based). Omitted, it's
 * the stored counter + 1. When a new course starts within one set of pools is
 * GM adjudication — the override is how they say so.
 */
export const treat = mutation({
  args: {
    id: v.id("characters"),
    professional: v.boolean(),
    day: v.optional(v.number()),
  },
  returns: v.object({
    day: v.number(),
    gained: v.object({ hitPoints: v.number(), sdc: v.number() }),
    hitPoints: v.object({ current: v.number(), max: v.number() }),
    sdc: v.object({ current: v.number(), max: v.number() }),
  }),
  handler: async (ctx, { id, professional, day }) => {
    const character = await loadCharacter(ctx, id);
    const rolled = character.rolled;
    if (rolled?.hitPoints === undefined || rolled.sdc === undefined) {
      throw new Error("Roll vitals before treatment — no pools to recover.");
    }
    const courseDay = day ?? (character.current?.treatmentDays ?? 0) + 1;
    if (!Number.isInteger(courseDay) || courseDay < 1) {
      throw new Error(`Treatment day must be a positive whole number, got ${courseDay}.`);
    }
    // `treatmentRecovery` re-checks the counts; rates come from the content.
    const amounts = treatmentRecovery(1, professional, courseDay - 1);
    const { current, gained } = healPools(character, amounts);
    // Record the day just applied — unless this very day completed the mend,
    // in which case the course is over and the counter stays cleared.
    const next = fullyMended(current, rolled) ? current : { ...current, treatmentDays: courseDay };
    await patchCurrent(ctx, id, character, next);
    return {
      day: courseDay,
      gained: { hitPoints: gained.hitPoints, sdc: gained.sdc },
      hitPoints: { current: current.hitPoints ?? rolled.hitPoints, max: rolled.hitPoints },
      sdc: { current: current.sdc ?? rolled.sdc, max: rolled.sdc },
    };
  },
});

/** Reset every pool to its rolled maximum (absent `current` means "full"). */
export const restoreVitals = mutation({
  args: { id: v.id("characters") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await loadCharacter(ctx, id); // existence check
    await ctx.db.patch(id, { current: undefined });
    return null;
  },
});

/** Newest characters first; a hard page size keeps the query bounded as the table grows. */
const LIST_LIMIT = 50;

/**
 * Roster summary for the character list — identity only, newest first.
 * Full choices/sheets load per character via `get`/`sheet`.
 */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("characters"),
      name: v.string(),
      occId: v.string(),
      level: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const docs = await ctx.db.query("characters").order("desc").take(LIST_LIMIT);
    return docs.map(({ _id, name, occId, level }) => ({ _id, name, occId, level }));
  },
});

/** The stored choices, as saved. */
export const get = query({
  args: { id: v.id("characters") },
  returns: v.union(characterDoc, v.null()),
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/**
 * The character's full derived sheet — the live-sheet source of truth.
 * Recomputed from stored choices on every read, so rules-layer fixes
 * propagate to existing characters with no migration.
 *
 * The sheet's shape (`CharacterSheet`) is owned by @riftforge/rules;
 * mirroring it as Convex validators would drift, so it validates as `any`
 * and stays typed end-to-end through the TS return type.
 */
export const sheet = query({
  args: { id: v.id("characters") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    if (doc === null) return null;
    const { _id, _creationTime, ...character } = doc;
    return deriveSheet(character);
  },
});
