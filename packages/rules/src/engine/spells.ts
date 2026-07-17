import type { Occ } from "../schema/occ.ts";
import type { DamageType } from "../schema/damage.ts";
import {
  spellBookSchema,
  type Spell,
  type SpellDamageEnvironment,
  type SpellDamageOptionalBonus,
  type SpellDamageVariant,
} from "../schema/spells.ts";
import spellsRaw from "../content/spells/spells.json" with { type: "json" };
import { parseDice, rollDice, type DiceFormula, type Rng } from "./dice.ts";

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

export interface DeriveSpellDamageOptions {
  casterLevel: number;
  variantId?: string;
  environment?: SpellDamageEnvironment;
  diceCount?: number;
  optionalBonusIds?: readonly string[];
}

export interface DerivedSpellDamageComponent {
  formula: string;
  repetitions: number;
  parsed: DiceFormula;
}

export interface DerivedSpellDamage {
  variantId: string;
  type: DamageType;
  components: DerivedSpellDamageComponent[];
  optionalBonuses: SpellDamageOptionalBonus[];
  bonus: number;
  displayFormula: string;
  maximumDiceCount?: number;
  selectedDiceCount?: number;
}

function selectDamageVariant(spell: Spell, options: DeriveSpellDamageOptions): SpellDamageVariant {
  const effect = spell.damageEffect!;
  if (effect.selection === "single") {
    if (options.environment !== undefined) {
      throw new Error(`${spell.name}: environment is not a valid choice for single damage.`);
    }
    const variant = effect.variants[0]!;
    if (options.variantId !== undefined && options.variantId !== variant.id) {
      throw new Error(`Unknown damage variant "${options.variantId}" for ${spell.name}.`);
    }
    return variant;
  }
  if (effect.selection === "casterChoice") {
    if (options.environment !== undefined) {
      throw new Error(`${spell.name} uses variantId, not environment, for its caster choice.`);
    }
    if (options.variantId === undefined) {
      throw new Error(`${spell.name} requires a damage variantId.`);
    }
    const variant = effect.variants.find((candidate) => candidate.id === options.variantId);
    if (!variant)
      throw new Error(`Unknown damage variant "${options.variantId}" for ${spell.name}.`);
    return variant;
  }
  if (options.variantId !== undefined) {
    throw new Error(`${spell.name}: variantId contradicts environment selection.`);
  }
  if (options.environment === undefined) {
    throw new Error(`${spell.name} requires a damage environment.`);
  }
  const variant = effect.variants.find(
    (candidate) => candidate.environment === options.environment,
  );
  if (!variant)
    throw new Error(`Unknown damage environment "${options.environment}" for ${spell.name}.`);
  return variant;
}

function scalingRepetitions(
  casterLevel: number,
  scaling: NonNullable<SpellDamageVariant["scaling"]>,
): number {
  if (casterLevel < scaling.startsAtLevel) return 0;
  return Math.floor((casterLevel - scaling.startsAtLevel) / scaling.everyLevels) + 1;
}

function repeatedFormula(components: readonly DerivedSpellDamageComponent[]): string[] {
  return components.flatMap((component) =>
    Array.from({ length: component.repetitions }, () => component.formula),
  );
}

/** Expand one selected spell-damage application without consuming randomness. */
export function deriveSpellDamage(
  spell: Spell,
  options: DeriveSpellDamageOptions,
): DerivedSpellDamage | undefined {
  if (spell.damageEffect === undefined) return undefined;
  if (!Number.isInteger(options.casterLevel)) {
    throw new Error(`casterLevel must be a positive integer, got ${options.casterLevel}.`);
  }
  if (options.casterLevel < 1) {
    throw new Error(`casterLevel must be positive, got ${options.casterLevel}.`);
  }

  const variant = selectDamageVariant(spell, options);
  let components: DerivedSpellDamageComponent[] = [];
  if (variant.base !== undefined) {
    components.push({ formula: variant.base, repetitions: 1, parsed: parseDice(variant.base) });
  }
  if (variant.scaling !== undefined) {
    const repetitions = scalingRepetitions(options.casterLevel, variant.scaling);
    if (repetitions > 0) {
      components.push({
        formula: variant.scaling.formula,
        repetitions,
        parsed: parseDice(variant.scaling.formula),
      });
    }
  }

  let maximumDiceCount: number | undefined;
  let selectedDiceCount: number | undefined;
  if (variant.adjustableDiceCount === undefined) {
    if (options.diceCount !== undefined) {
      throw new Error(`${spell.name} damage is not adjustable; diceCount is invalid.`);
    }
  } else {
    maximumDiceCount = components.reduce(
      (total, component) => total + component.parsed.count * component.repetitions,
      0,
    );
    selectedDiceCount = options.diceCount ?? maximumDiceCount;
    if (!Number.isInteger(selectedDiceCount)) {
      throw new Error(`diceCount must be an integer, got ${selectedDiceCount}.`);
    }
    const { minimum, step } = variant.adjustableDiceCount;
    if (selectedDiceCount < minimum) {
      throw new Error(`diceCount must be at least ${minimum}, got ${selectedDiceCount}.`);
    }
    if (selectedDiceCount > maximumDiceCount) {
      throw new Error(
        `diceCount ${selectedDiceCount} exceeds the derived maximum ${maximumDiceCount}.`,
      );
    }
    if ((selectedDiceCount - minimum) % step !== 0) {
      throw new Error(`diceCount must advance from ${minimum} in steps of ${step}.`);
    }
    const sides = components[0]!.parsed.sides;
    const formula = `${selectedDiceCount}D${sides}`;
    components = [{ formula, repetitions: 1, parsed: parseDice(formula) }];
  }

  const selectedIds = options.optionalBonusIds ?? [];
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new Error(`Duplicate optional damage bonus id for ${spell.name}.`);
  }
  const availableBonuses = new Map(
    (variant.optionalBonuses ?? []).map((bonus) => [bonus.id, bonus] as const),
  );
  const optionalBonuses = selectedIds.map((id) => {
    const bonus = availableBonuses.get(id);
    if (!bonus) throw new Error(`Unknown optional damage bonus "${id}" for ${spell.name}.`);
    return bonus;
  });
  const bonus = optionalBonuses.reduce((total, selected) => total + selected.amount, 0);
  const displayParts = [...repeatedFormula(components), ...(bonus === 0 ? [] : [String(bonus)])];

  return {
    variantId: variant.id,
    type: variant.type,
    components,
    optionalBonuses,
    bonus,
    displayFormula: displayParts.join(" + "),
    ...(maximumDiceCount === undefined || selectedDiceCount === undefined
      ? {}
      : { maximumDiceCount, selectedDiceCount }),
  };
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
