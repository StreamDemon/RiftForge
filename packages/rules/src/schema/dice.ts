import { z } from "zod";
import { parseDice } from "../engine/dice.ts";

/**
 * A string that must parse as valid dice notation (e.g. "3D6*10+20", "2D6+32",
 * "1D4*1000", or a plain constant like "5"). Rejects malformed transcriptions at
 * content-load time instead of letting them blow up later when the engine parses them.
 */
export const diceFormulaSchema = z.string().refine(
  (s) => {
    try {
      parseDice(s);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid dice formula" },
);
