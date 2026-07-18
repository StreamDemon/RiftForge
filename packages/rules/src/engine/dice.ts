/**
 * Minimal dice-notation support for Rifts formulas.
 *
 * Handles the shapes the rulebook actually uses: `3D6`, `2D6+32`, `3D6*10+20`,
 * `1D4*1000`, `3D6-2`, and plain constants like `5`. The multiplier applies to
 * the dice sum before the modifier: `3D6*10+20` = (sum of 3d6) * 10 + 20.
 */
export interface DiceFormula {
  /** Number of dice (0 for a plain constant). */
  count: number;
  /** Sides per die (0 for a plain constant). */
  sides: number;
  /** Multiplier applied to the dice sum. */
  multiplier: number;
  /** Flat modifier added after the multiplier. */
  modifier: number;
}

/** A random source returning a float in [0, 1), like `Math.random`. */
export type Rng = () => number;

function parseSafeInteger(component: string, input: string): number {
  const value = Number.parseInt(component, 10);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Invalid dice formula: "${input}" (numeric components must be safe integers)`);
  }
  return value;
}

export function parseDice(input: string): DiceFormula {
  const s = input.trim();
  if (/^[+-]?\d+$/.test(s)) {
    return { count: 0, sides: 0, multiplier: 1, modifier: parseSafeInteger(s, input) };
  }
  const m = s.match(/^(\d+)\s*[dD]\s*(\d+)(?:\s*[*x×]\s*(\d+))?(?:\s*([+-])\s*(\d+))?$/);
  if (!m) throw new Error(`Invalid dice formula: "${input}"`);
  const count = parseSafeInteger(m[1]!, input);
  const sides = parseSafeInteger(m[2]!, input);
  if (count < 1 || sides < 1) throw new Error(`Invalid dice formula: "${input}"`);
  return {
    count,
    sides,
    multiplier: m[3] ? parseSafeInteger(m[3], input) : 1,
    modifier: m[4] ? (m[4] === "-" ? -1 : 1) * parseSafeInteger(m[5]!, input) : 0,
  };
}

function normalize(f: DiceFormula | string): DiceFormula {
  return typeof f === "string" ? parseDice(f) : f;
}

/** Lowest possible result (all dice roll 1). */
export function diceMin(f: DiceFormula | string): number {
  const d = normalize(f);
  return d.count * 1 * d.multiplier + d.modifier;
}

/** Highest possible result (all dice roll their max). */
export function diceMax(f: DiceFormula | string): number {
  const d = normalize(f);
  return d.count * d.sides * d.multiplier + d.modifier;
}

/** Statistical mean of the formula. */
export function diceAverage(f: DiceFormula | string): number {
  const d = normalize(f);
  const meanSum = (d.count * (d.sides + 1)) / 2;
  return meanSum * d.multiplier + d.modifier;
}

/** Roll a single die with `sides` faces. */
export function rollDie(sides: number, rng: Rng = Math.random): number {
  return Math.floor(rng() * sides) + 1;
}

/** Roll the formula and return the total. */
export function rollDice(f: DiceFormula | string, rng: Rng = Math.random): number {
  const d = normalize(f);
  let sum = 0;
  for (let i = 0; i < d.count; i++) sum += rollDie(d.sides, rng);
  return sum * d.multiplier + d.modifier;
}
