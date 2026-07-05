import {
  applyDamage as damagePools,
  characterSchema,
  comaDeathFloor,
  deriveSheet,
  getOcc,
  getSpell,
  rollHitPoints,
  rollPhysicalSdc,
  rollPpe,
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
 * Cast a known spell: decrement live P.P.E. by its printed cost. The cost is
 * derived server-side from the spell id — the client never names a price.
 * Rejects casts the character can't afford (the sheet greys those out, but
 * the server is the authority) and casts before vitals are rolled (no
 * maximum to spend from).
 */
export const castSpell = mutation({
  args: { id: v.id("characters"), spellId: v.string() },
  returns: v.object({
    spent: v.number(),
    ppe: v.object({ current: v.number(), max: v.number() }),
  }),
  handler: async (ctx, { id, spellId }) => {
    const character = await loadCharacter(ctx, id);
    if (!character.spellIds.includes(spellId)) {
      throw new Error(`Character does not know the spell "${spellId}".`);
    }
    const spell = getSpell(spellId);
    if (!spell) throw new Error(`Unknown spell "${spellId}".`);
    const max = character.rolled?.ppe;
    if (max === undefined) throw new Error("Roll vitals before casting — no P.P.E. to spend.");
    const available = character.current?.ppe ?? max;
    if (spell.ppe > available) {
      throw new Error(
        `Insufficient P.P.E.: ${spell.name} costs ${spell.ppe}, ${available} remaining.`,
      );
    }
    const remaining = available - spell.ppe;
    await patchCurrent(ctx, id, character, { ...character.current, ppe: remaining });
    return { spent: spell.ppe, ppe: { current: remaining, max } };
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
 * Amounts are how much to ADD (a first-aid roll, a rest tick) — full recovery
 * is `restoreVitals`. Recovery *rates* (P.P.E. per hour of rest, ley-line
 * draw) are rules-layer follow-up work on #38.
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
    const current = { ...character.current };
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
      current[field] = Math.min(max, (current[field] ?? max) + amount);
    }
    await patchCurrent(ctx, id, character, current);
    return null;
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
