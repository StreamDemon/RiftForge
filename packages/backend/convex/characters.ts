import {
  applyDamage as damagePools,
  armorMaxPool,
  armorNeedsRoll,
  characterSchema,
  comaDeathFloor,
  damageArmor,
  deriveSheet,
  getItem,
  getOcc,
  getSpell,
  leyLineDraw as leyLineDrawAmount,
  restRecovery,
  rollArmorMdc,
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
 * `healPool` picks the pool for exclusive either/or spells (Light Healing);
 * `othersOnly` spells refuse the caster as the target; `full` restorations
 * (Restoration) top both pools up to their maximums.
 */
export const castSpell = mutation({
  args: {
    id: v.id("characters"),
    spellId: v.string(),
    targetId: v.optional(v.id("characters")),
    healPool: v.optional(v.union(v.literal("hitPoints"), v.literal("sdc"))),
  },
  returns: v.object({
    spent: v.number(),
    ppe: v.object({ current: v.number(), max: v.number() }),
    /** Post-clamp points the target actually recovered, per declared pool. */
    healed: v.optional(
      v.object({ hitPoints: v.optional(v.number()), sdc: v.optional(v.number()) }),
    ),
  }),
  handler: async (ctx, { id, spellId, targetId, healPool }) => {
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
    if (spell.healing?.othersOnly && !aimedAtOther) {
      throw new Error(`${spell.name} cannot be used on oneself.`);
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

    // Throws for exclusive spells when no pool is chosen — before any write.
    const roll = spell.healing ? rollSpellHealing(spell, Math.random, healPool) : undefined;
    if (roll === undefined) {
      await patchCurrent(ctx, id, character, spentCurrent);
      return { spent: spell.ppe, ppe: { current: remaining, max } };
    }
    // A full restoration becomes the exact top-up to the target's maximums
    // (computed, not clamped: H.P. can sit below zero in the coma band).
    const resolve = (c: Character): { hitPoints?: number; sdc?: number } => {
      if (!roll.full) return roll;
      const r = c.rolled;
      if (r?.hitPoints === undefined || r.sdc === undefined) {
        throw new Error("Cannot fully restore — vitals have not been rolled.");
      }
      return {
        hitPoints: Math.max(0, r.hitPoints - (c.current?.hitPoints ?? r.hitPoints)),
        sdc: Math.max(0, r.sdc - (c.current?.sdc ?? r.sdc)),
      };
    };
    const report = (
      amounts: { hitPoints?: number; sdc?: number },
      gained: { hitPoints: number; sdc: number },
    ) => ({
      ...(amounts.hitPoints !== undefined ? { hitPoints: gained.hitPoints } : {}),
      ...(amounts.sdc !== undefined ? { sdc: gained.sdc } : {}),
    });
    if (!aimedAtOther) {
      const amounts = resolve(character);
      const { current, gained } = healPools({ ...character, current: spentCurrent }, amounts);
      await patchCurrent(ctx, id, character, current);
      return {
        spent: spell.ppe,
        ppe: { current: remaining, max },
        healed: report(amounts, gained),
      };
    }
    // Cross-document: spend on the caster, heal the target — one transaction,
    // the first table-shaped interaction (VTT groundwork).
    const target = await loadCharacter(ctx, targetId);
    const amounts = resolve(target);
    const { current: targetCurrent, gained } = healPools(target, amounts);
    await patchCurrent(ctx, id, character, spentCurrent);
    await patchCurrent(ctx, targetId, target, targetCurrent);
    return { spent: spell.ppe, ppe: { current: remaining, max }, healed: report(amounts, gained) };
  },
});

/** `current` without the armor pool (dropped when nothing else remains). */
function withoutArmorPool(current: Character["current"]): Character["current"] {
  if (current === undefined) return undefined;
  const { armor: _armor, ...rest } = current;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/** Client's snapshot of the item instance it targeted (index + this state). */
const expectedItemValidator = v.object({
  itemId: v.string(),
  worn: v.optional(v.boolean()),
  rolledMdc: v.optional(v.number()),
});
type ExpectedItem = { itemId: string; worn?: boolean; rolledMdc?: number };

/**
 * Resolve the item instance an index-based inventory mutation targets. The
 * index alone can go stale — the manifest may have changed while the click
 * was in flight — so the client also names the instance state it saw, and a
 * mismatch is refused instead of landing on whatever now sits at that slot.
 */
function requireItemAt(
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

/**
 * Add an item to the inventory. Dice-capacity armor (the Ley Line Walker's
 * concealed suit prints "2D6+32 M.D.C. main body", RUE p.113) rolls its
 * per-suit maximum HERE — a mutation, not an action, for the same reason as
 * `rollVitals`: mutations get seeded randomness, and rolling + persisting in
 * one transaction means a suit's roll can never be observed and then lost.
 */
export const addItem = mutation({
  args: { id: v.id("characters"), itemId: v.string() },
  returns: v.object({ index: v.number(), rolledMdc: v.optional(v.number()) }),
  handler: async (ctx, { id, itemId }) => {
    const character = await loadCharacter(ctx, id);
    const item = getItem(itemId);
    if (!item) throw new Error(`Unknown item "${itemId}".`);
    const entry =
      item.kind === "armor" && armorNeedsRoll(item)
        ? { itemId, rolledMdc: rollArmorMdc(item, Math.random) }
        : { itemId };
    const items = [...character.items, entry];
    validateCharacter({ ...character, items });
    await ctx.db.patch(id, { items });
    return {
      index: items.length - 1,
      ...("rolledMdc" in entry ? { rolledMdc: entry.rolledMdc } : {}),
    };
  },
});

/**
 * Drop the item at `index` (verified against the client's `expect` snapshot).
 * Removing the worn armor also clears its live pool — `current.armor`
 * measures the WORN suit, so it can't outlive it.
 */
export const removeItem = mutation({
  args: { id: v.id("characters"), index: v.number(), expect: expectedItemValidator },
  returns: v.null(),
  handler: async (ctx, { id, index, expect }) => {
    const character = await loadCharacter(ctx, id);
    const entry = requireItemAt(character, index, expect);
    const items = character.items.filter((_, i) => i !== index);
    const current = entry.worn === true ? withoutArmorPool(character.current) : character.current;
    validateCharacter({ ...character, items, current });
    await ctx.db.patch(id, { items, current });
    return null;
  },
});

/**
 * Wear the armor at `index` (exclusively — at most one worn suit; verified
 * against the client's `expect` snapshot), or pass `null` to unequip.
 * Changing what's worn resets the live pool: a freshly equipped suit starts
 * at its maximum (per-suit damage memory across swaps is future scope — the
 * pool follows the fresh-pools pattern of vitals). Asking for the state the
 * character is already in is a no-op, so a repeated click can never
 * "repair" the worn suit by resetting its pool.
 */
export const equipArmor = mutation({
  args: {
    id: v.id("characters"),
    index: v.union(v.number(), v.null()),
    expect: v.optional(expectedItemValidator),
  },
  returns: v.null(),
  handler: async (ctx, { id, index, expect }) => {
    const character = await loadCharacter(ctx, id);
    const wornIndex = character.items.findIndex((e) => e.worn === true);
    if (index !== null) {
      if (expect === undefined) throw new Error("Equipping needs the expected item snapshot.");
      const entry = requireItemAt(character, index, expect);
      const item = getItem(entry.itemId);
      if (item?.kind !== "armor") {
        throw new Error(`Only armor can be worn — "${entry.itemId}" is not armor.`);
      }
    } else if (wornIndex !== -1) {
      // Doff verifies too: unequip the suit the CLIENT saw worn, not whatever
      // a racing write made worn since. (Nothing worn = already unequipped —
      // the desired state, a no-op below.)
      if (expect === undefined) throw new Error("Unequipping needs the expected item snapshot.");
      requireItemAt(character, wornIndex, expect);
    }
    if (index === (wornIndex === -1 ? null : wornIndex)) return null; // already there
    const items = character.items.map((e, i) => {
      const { worn: _worn, ...rest } = e;
      return i === index ? { ...rest, worn: true } : rest;
    });
    const current = withoutArmorPool(character.current);
    validateCharacter({ ...character, items, current });
    await ctx.db.patch(id, { items, current });
    return null;
  },
});

/**
 * Deal damage to the live pools. Body hits (the default): S.D.C. absorbs
 * first, the overflow comes off Hit Points, which stop at the -(P.E.)
 * coma/death floor (rules-layer `applyDamage`, RUE pp.287/347).
 *
 * `toArmor` lands the hit on the WORN armor instead: the suit absorbs the
 * whole attack ("subtract the damage from the armor's S.D.C.", RUE p.287) and
 * nothing spills onto the body — a depleted suit stops protecting *future*
 * hits. WHICH hits strike armor (the strike-vs-A.R. threshold roll) is
 * combat-resolver scope; until then the flag keeps it GM-adjudicated, the
 * same philosophy as elapsed time in rest/treatment.
 */
export const applyDamage = mutation({
  args: { id: v.id("characters"), amount: v.number(), toArmor: v.optional(v.boolean()) },
  returns: v.object({
    sdc: v.optional(v.number()),
    hitPoints: v.optional(v.number()),
    armor: v.optional(v.number()),
  }),
  handler: async (ctx, { id, amount, toArmor }) => {
    const character = await loadCharacter(ctx, id);
    if (toArmor === true) {
      const worn = character.items.find((e) => e.worn === true);
      if (worn === undefined) throw new Error("No armor is worn — nothing to strike.");
      const item = getItem(worn.itemId);
      if (item?.kind !== "armor") {
        throw new Error(`Worn item "${worn.itemId}" is not armor.`); // unreachable for stored docs
      }
      const max = armorMaxPool(item, worn.rolledMdc);
      if (max === undefined) {
        throw new Error("The worn armor's M.D.C. has not been rolled — no pool to deplete.");
      }
      const pool = character.current?.armor ?? max;
      // A depleted suit "no longer affords protection. Any future attacks
      // will hit the character's body." (RUE p.287) — refuse rather than
      // silently soak the hit at zero; the GM routes it to the body.
      if (pool <= 0) {
        throw new Error("The worn armor is depleted — the hit strikes the body (RUE p.287).");
      }
      // `damageArmor` rejects amounts that aren't whole, non-negative counts.
      const next = damageArmor(pool, amount);
      await patchCurrent(ctx, id, character, { ...character.current, armor: next });
      return { armor: next };
    }
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
