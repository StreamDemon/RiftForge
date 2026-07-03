import { characterSchema, deriveSheet, type Character } from "@riftforge/rules";
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
