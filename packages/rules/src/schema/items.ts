import { z } from "zod";
import { diceFormulaSchema } from "./dice.ts";

/** Weapon category — the hook future W.P. proficiency wiring keys on. */
export const weaponCategorySchema = z.enum([
  "knife",
  "axe",
  "handgun",
  "submachineGun",
  "energyPistol",
  "energyRifle",
]);
export type WeaponCategory = z.infer<typeof weaponCategorySchema>;

/**
 * Structured weapon damage: the dice the engine must roll, and which damage
 * system they belong to — S.D.C. or Mega-Damage (one M.D. point is about one
 * hundred S.D.C., RUE p.288; the conversion is combat-resolver scope, not
 * stored here). Multi-setting or variable printed damage keeps the full
 * sentence in `note` beside the headline dice, like `ppeNote` on spells.
 */
export const weaponDamageSchema = z.object({
  formula: diceFormulaSchema,
  type: z.enum(["sdc", "md"]),
  note: z.string().optional(),
});
export type WeaponDamage = z.infer<typeof weaponDamageSchema>;

/** Fields every item kind shares. `page` is the printed page number. */
const itemBase = {
  id: z.string().min(1),
  name: z.string().min(1),
  /** Weight as printed (e.g. "2 lbs (0.9 kg)"). */
  weight: z.string().optional(),
  /** Black Market cost as printed (e.g. "11,000 credits"). */
  cost: z.string().optional(),
  notes: z.string().optional(),
  page: z.number().int().positive(),
};

export const weaponSchema = z.object({
  ...itemBase,
  kind: z.literal("weapon"),
  category: weaponCategorySchema,
  damage: weaponDamageSchema,
  /** Effective range as printed (e.g. "1000 feet (305 m)"). */
  range: z.string().optional(),
  /** Payload as printed (e.g. "20 shots"). */
  payload: z.string().optional(),
  /** Printed strike bonus rule (e.g. "+2 to strike on an Aimed shot"). */
  strikeBonusNote: z.string().optional(),
});
export type Weapon = z.infer<typeof weaponSchema>;

/**
 * Armor is its own ablative layer — there is no AC in Palladium. S.D.C. armor
 * pairs an Armor Rating threshold with an S.D.C. pool (RUE p.287: a strike
 * roll above the A.R. penetrates; ties favor the defender). M.D.C. armor is a
 * Mega-Damage shell with NO A.R. — the schema rejects the contradiction. Its
 * main-body capacity is a dice formula because some suits print a roll per
 * suit (Ley Line Walker concealed armor: "2D6+32 M.D.C. main body", p.113)
 * while factory suits print a constant ("70"). M.D.C. combat *mechanics* are
 * combat-resolver scope; here the shell is just an ablative pool.
 */
export const armorSchema = z
  .object({
    ...itemBase,
    kind: z.literal("armor"),
    /** Armor Rating of S.D.C. armor: strike rolls above it penetrate (RUE p.287). */
    ar: z.number().int().min(1).max(20).optional(),
    /** Ablative S.D.C. pool of S.D.C. armor. */
    sdc: z.number().int().positive().optional(),
    mdc: z
      .object({
        /** Main-body capacity: a constant ("70") or a per-suit roll ("2D6+32"). */
        mainBody: diceFormulaSchema,
        /** Other hit locations as printed (helmet/arms/legs — resolver scope). */
        byLocation: z.string().optional(),
      })
      .optional(),
    /** Full environmental battle armor (RUE p.267). */
    environmental: z.boolean().optional(),
    /** Movement/physical-skill penalty as printed (e.g. "-10% movement penalty"). */
    movementPenalty: z.string().optional(),
  })
  .refine((a) => a.mdc !== undefined || (a.ar !== undefined && a.sdc !== undefined), {
    message: "Armor must be M.D.C. (mdc) or S.D.C. (both ar and sdc).",
  })
  .refine((a) => a.mdc === undefined || (a.ar === undefined && a.sdc === undefined), {
    message: "M.D.C. armor is a Mega-Damage shell — it cannot declare an A.R. or an S.D.C. pool.",
  });
export type Armor = z.infer<typeof armorSchema>;

/** Flavor-tier gear: name and printed notes, no mechanics. */
export const gearSchema = z.object({
  ...itemBase,
  kind: z.literal("gear"),
});
export type Gear = z.infer<typeof gearSchema>;

export const itemSchema = z.discriminatedUnion("kind", [weaponSchema, armorSchema, gearSchema]);
export type Item = z.infer<typeof itemSchema>;

export const itemCatalogSchema = z.object({
  book: z.string().min(1),
  items: z.array(itemSchema),
});
export type ItemCatalog = z.infer<typeof itemCatalogSchema>;
