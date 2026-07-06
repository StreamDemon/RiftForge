import type { Occ } from "../schema/occ.ts";
import { spellBookSchema, type Spell } from "../schema/spells.ts";
import spellsRaw from "../content/spells/spells.json" with { type: "json" };
import { rollDice, type Rng } from "./dice.ts";

/** The spell book (RUE Magic Spells), validated at load. */
export const spellBook = spellBookSchema.parse(spellsRaw);

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

// id + name indexes, failing fast on collisions (same approach as the skill catalog).
const spellById = new Map<string, Spell>();
const spellByName = new Map<string, Spell>();
for (const s of spellBook.spells) {
  if (spellById.has(s.id)) {
    throw new Error(`Duplicate spell id "${s.id}" in the spell book.`);
  }
  spellById.set(s.id, s);
  const key = normalizeName(s.name);
  if (spellByName.has(key)) {
    throw new Error(`Duplicate spell name "${s.name}" in the spell book.`);
  }
  spellByName.set(key, s);
}

export function getSpell(id: string): Spell | undefined {
  return spellById.get(id);
}

export function getSpellByName(name: string): Spell | undefined {
  return spellByName.get(normalizeName(name));
}

/** All spells of a given level. */
export function spellsByLevel(level: number): Spell[] {
  return spellBook.spells.filter((s) => s.level === level);
}

/** Whether a caster with `availablePpe` can afford to cast `spell`. */
export function canCast(spell: Spell, availablePpe: number): boolean {
  return availablePpe >= spell.ppe;
}

/** Concrete points a healing cast restores (per-pool dice, rolled) — or a
 * complete restoration when `full` is set (no dice; both pools to maximum). */
export interface HealingRoll {
  hitPoints?: number;
  sdc?: number;
  full?: boolean;
}

/** The pool an exclusive healing spell restores this cast (caster's choice). */
export type HealingPool = "hitPoints" | "sdc";

/**
 * Roll a spell's structured healing dice; `undefined` when the spell doesn't
 * heal. Raw amounts — clamping at the target's rolled maximums happens where
 * live pools are written (the backend's heal path).
 *
 * Exclusive spells (Light Healing's "1D6 S.D.C. *or* 1D4 Hit Points") roll
 * only the chosen `pool` and throw when none is named. Full restorations
 * (Restoration) roll nothing and return `{ full: true }`.
 */
export function rollSpellHealing(
  spell: Spell,
  rng: Rng = Math.random,
  pool?: HealingPool,
): HealingRoll | undefined {
  const h = spell.healing;
  if (!h) return undefined;
  if (h.full) return { full: true };
  if (h.exclusive) {
    if (pool === undefined) {
      throw new Error(`${spell.name} restores one pool per cast — choose hitPoints or sdc.`);
    }
    // The schema guarantees exclusive spells declare both pools.
    return { [pool]: rollDice(h[pool]!, rng) };
  }
  return {
    ...(h.hitPoints !== undefined ? { hitPoints: rollDice(h.hitPoints, rng) } : {}),
    ...(h.sdc !== undefined ? { sdc: rollDice(h.sdc, rng) } : {}),
  };
}

/**
 * A caster's Spell Strength (RUE p.187): base 12, plus one for each experience
 * level (<= the caster's level) at which their O.C.C. grants a Spell Strength
 * increase. This is the d20 number a victim must roll to save against the spell.
 */
export function spellStrength(casterLevel: number, incrementLevels: readonly number[]): number {
  return spellBook.spellStrengthBase + incrementLevels.filter((l) => l <= casterLevel).length;
}

/**
 * Spell Strength from a single spell-strength bonus (or none). Handles both
 * shapes the schema allows:
 * - **level-gated** (`atLevels` present): apply the increment once per increment
 *   level the caster has reached.
 * - **flat** (no `atLevels`): apply the value once, at every level.
 */
export function spellStrengthFromBonus(
  bonus: { value?: number; atLevels?: readonly number[] } | undefined,
  casterLevel: number,
): number {
  const base = spellBook.spellStrengthBase;
  if (!bonus) return base;
  const increment = typeof bonus.value === "number" ? bonus.value : 1;
  if (bonus.atLevels && bonus.atLevels.length > 0) {
    return base + bonus.atLevels.filter((l) => l <= casterLevel).length * increment;
  }
  return base + increment;
}

/** Spell Strength for a specific O.C.C. at a given level, read from its bonuses. */
export function occSpellStrength(occ: Occ, casterLevel: number): number {
  return spellStrengthFromBonus(
    occ.bonuses?.find((b) => b.type === "spellStrength"),
    casterLevel,
  );
}

/** The d20 target a victim must roll to save against a caster's spell magic. */
export function saveTargetVsSpell(casterSpellStrength: number): number {
  return casterSpellStrength;
}

/** The d20 target to save against ritual magic (fixed; spell-strength bonuses don't apply). */
export const ritualSaveTarget = spellBook.ritualSaveTarget;

export interface InitialSpellChoice {
  level: number;
  choose: number;
  options: Spell[];
}

/**
 * The spells available for an O.C.C.'s initial spell selection, grouped by
 * eligible level (e.g. the Ley Line Walker picks `fromEachLevel` from each of
 * levels 1-4). Returns the choose-count and options for each eligible level.
 */
export function initialSpellChoices(occ: Occ): InitialSpellChoice[] {
  const init = occ.spellKnowledge?.initial;
  if (!init) return [];
  return init.spellLevels.map((level) => ({
    level,
    choose: init.fromEachLevel,
    options: spellsByLevel(level),
  }));
}
