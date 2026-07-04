import {
  characterSchema,
  deriveSheet,
  getOcc,
  rollHitPoints,
  rollPhysicalSdc,
  rollPpe,
  type Character,
} from "@riftforge/rules";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
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
    const doc = await ctx.db.get(id);
    if (doc === null) throw new Error(`Character ${id} not found.`);
    const { _id, _creationTime, ...stored } = doc;
    const character = characterSchema.parse(stored);
    const occ = getOcc(character.occId);
    if (!occ) throw new Error(`Unknown O.C.C. "${character.occId}".`);
    const pe = character.attributes.PE;
    const rolled = {
      hitPoints: rollHitPoints(pe, character.level),
      sdc: rollPhysicalSdc(),
      ...(occ.ppe ? { ppe: rollPpe(occ, pe, character.level) } : {}),
    };
    await ctx.db.patch(id, { rolled });
    return rolled;
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
