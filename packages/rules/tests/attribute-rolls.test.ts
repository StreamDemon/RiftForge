import { describe, expect, test } from "vite-plus/test";
import { ATTRIBUTE_CODES, rollAttribute, rollAttributes } from "../src/index.ts";
import type { Rng } from "../src/engine/dice.ts";

/** An RNG that yields d6 faces in order (1-based), then repeats the last. */
function d6Faces(...values: number[]): Rng {
  let i = 0;
  return () => {
    const v = values[Math.min(i++, values.length - 1)]!;
    return (v - 1) / 6;
  };
}

describe("rollAttribute — Step 1, RUE p.279", () => {
  test("an ordinary roll is just 3D6", () => {
    const r = rollAttribute(d6Faces(4, 5, 3));
    expect(r).toEqual({ total: 12, dice: [4, 5, 3], exceptional: false });
  });

  test("a 15 is not exceptional — no bonus die", () => {
    const r = rollAttribute(d6Faces(5, 5, 5));
    expect(r).toEqual({ total: 15, dice: [5, 5, 5], exceptional: false });
  });

  test("16-18 is exceptional: one additional 1D6", () => {
    const r = rollAttribute(d6Faces(6, 5, 5, 4));
    expect(r).toEqual({ total: 20, dice: [6, 5, 5, 4], exceptional: true });
  });

  test("a 6 on the bonus die earns one more 1D6, then stops", () => {
    // 6+6+6 = 18 (exceptional), bonus 6 -> another die, which is ALSO 6 — no third bonus die.
    const r = rollAttribute(d6Faces(6, 6, 6, 6, 6, 6));
    expect(r).toEqual({ total: 30, dice: [6, 6, 6, 6, 6], exceptional: true });
  });

  test("a second bonus die below 6 also stops", () => {
    const r = rollAttribute(d6Faces(6, 6, 4, 6, 2));
    expect(r).toEqual({ total: 24, dice: [6, 6, 4, 6, 2], exceptional: true });
  });

  test("bounds: totals stay within 3..30", () => {
    for (let i = 0; i < 500; i++) {
      const { total } = rollAttribute();
      expect(total).toBeGreaterThanOrEqual(3);
      expect(total).toBeLessThanOrEqual(30);
    }
  });
});

describe("rollAttributes", () => {
  test("rolls all eight in book order", () => {
    const rolled = rollAttributes(d6Faces(3, 3, 3));
    expect(Object.keys(rolled)).toEqual([...ATTRIBUTE_CODES]);
    for (const code of ATTRIBUTE_CODES) {
      expect(rolled[code].total).toBe(9);
    }
  });
});
