import { characterSchema, deriveSheet, type Character } from "@riftforge/rules";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export function validateCharacter(input: unknown): Character {
  const character = characterSchema.parse(input);
  deriveSheet(character);
  return character;
}

export async function loadCharacter(ctx: MutationCtx, id: Id<"characters">): Promise<Character> {
  const doc = await ctx.db.get(id);
  if (doc === null) throw new Error(`Character ${id} not found.`);
  const { _id, _creationTime, ...stored } = doc;
  return characterSchema.parse(stored);
}

export async function patchCurrent(
  ctx: MutationCtx,
  id: Id<"characters">,
  character: Character,
  current: Character["current"],
): Promise<void> {
  validateCharacter({ ...character, current });
  await ctx.db.patch(id, { current });
}

export const expectedItemValidator = v.object({
  itemId: v.string(),
  worn: v.optional(v.boolean()),
  rolledMdc: v.optional(v.number()),
});
export type ExpectedItem = {
  itemId: string;
  worn?: boolean;
  rolledMdc?: number;
};

export function requireItemAt(
  character: Character,
  index: number,
  expect: ExpectedItem,
): Character["items"][number] {
  const entry = Number.isInteger(index) ? character.items[index] : undefined;
  if (entry === undefined) throw new Error(`No item at index ${index}.`);
  if (
    entry.itemId !== expect.itemId ||
    (entry.worn === true) !== (expect.worn === true) ||
    entry.rolledMdc !== expect.rolledMdc
  ) {
    throw new Error("The manifest changed while the request was in flight — try again.");
  }
  return entry;
}
