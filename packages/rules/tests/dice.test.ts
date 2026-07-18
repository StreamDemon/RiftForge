import { describe, expect, test } from "vite-plus/test";
import { diceAverage, diceMax, diceMin, parseDice, rollDice } from "../src/engine/dice.ts";

describe("dice notation", () => {
  test("parses the shapes Rifts actually uses", () => {
    expect(parseDice("3D6")).toEqual({
      count: 3,
      sides: 6,
      multiplier: 1,
      modifier: 0,
    });
    expect(parseDice("2D6+32")).toEqual({
      count: 2,
      sides: 6,
      multiplier: 1,
      modifier: 32,
    });
    expect(parseDice("3D6*10+20")).toEqual({
      count: 3,
      sides: 6,
      multiplier: 10,
      modifier: 20,
    });
    expect(parseDice("1D4*1000")).toEqual({
      count: 1,
      sides: 4,
      multiplier: 1000,
      modifier: 0,
    });
    expect(parseDice("3D6-2")).toEqual({
      count: 3,
      sides: 6,
      multiplier: 1,
      modifier: -2,
    });
    expect(parseDice("5")).toEqual({
      count: 0,
      sides: 0,
      multiplier: 1,
      modifier: 5,
    });
  });

  test("rejects nonsense", () => {
    expect(() => parseDice("d6")).toThrow();
    expect(() => parseDice("banana")).toThrow();
    expect(() => parseDice("0D6")).toThrow();
  });

  test.each([
    ["constant", "9007199254740992"],
    ["count", "9007199254740992D6"],
    ["sides", "1D9007199254740992"],
    ["multiplier", "1D6*9007199254740992"],
    ["modifier", "1D6+9007199254740992"],
  ])("rejects an unsafe integer %s", (_component, formula) => {
    expect(() => parseDice(formula)).toThrow("safe integers");
  });

  test("rejects numeric literals that overflow to Infinity", () => {
    expect(() => parseDice(`${"9".repeat(400)}D6`)).toThrow("safe integers");
  });

  test("min / max / average", () => {
    expect(diceMin("3D6*10+20")).toBe(50);
    expect(diceMax("3D6*10+20")).toBe(200);
    expect(diceAverage("3D6*10+20")).toBe(125);
    expect([diceMin("2D6+32"), diceMax("2D6+32"), diceAverage("2D6+32")]).toEqual([34, 44, 39]);
    expect([diceMin("5"), diceMax("5"), diceAverage("5")]).toEqual([5, 5, 5]);
  });

  test("rolls land on the exact bounds with edge RNG, and stay in range otherwise", () => {
    expect(rollDice("3D6*10+20", () => 0)).toBe(50); // every die -> 1
    expect(rollDice("3D6*10+20", () => 0.999)).toBe(200); // every die -> 6
    for (let i = 0; i < 300; i++) {
      const r = rollDice("3D6*10+20");
      expect(r).toBeGreaterThanOrEqual(50);
      expect(r).toBeLessThanOrEqual(200);
    }
  });
});
