import { z } from "zod";

/** A skill the character has taken, with the O.C.C./category bonuses that apply. */
export const characterSkillSchema = z.object({
  skillId: z.string().min(1),
  occBonus: z.number().int().optional(),
  categoryBonus: z.number().int().optional(),
  /** O.C.C.-granted flat value that replaces the computed percentage
   * (e.g. Ley Line Walker: Language: Native Tongue at 98%). */
  overrideValue: z.number().int().positive().optional(),
  /** Distinguishes repeated picks of a repeatable skill (e.g. which language). */
  label: z.string().min(1).optional(),
});
export type CharacterSkill = z.infer<typeof characterSkillSchema>;

/**
 * An item the character owns — one array entry per physical instance, with
 * per-instance state. Only `itemId` is validated here; item-kind rules (worn
 * requires armor, rolledMdc requires a dice-capacity suit, at most one worn
 * armor) live in `deriveSheet`, where the catalog is available.
 */
export const characterItemSchema = z.object({
  itemId: z.string().min(1),
  /** This armor is currently worn (at most one worn armor across the inventory). */
  worn: z.boolean().optional(),
  /** Per-suit rolled main-body M.D.C. maximum, for armor whose printed
   * capacity is dice (LLW concealed armor: "2D6+32 M.D.C.", RUE p.113). */
  rolledMdc: z.number().int().positive().optional(),
});
export type CharacterItem = z.infer<typeof characterItemSchema>;

/** The eight rolled attributes (I.Q., M.E., M.A., P.S., P.P., P.E., P.B., Spd). */
export const characterAttributesSchema = z.object({
  IQ: z.number().int().positive(),
  ME: z.number().int().positive(),
  MA: z.number().int().positive(),
  PS: z.number().int().positive(),
  PP: z.number().int().positive(),
  PE: z.number().int().positive(),
  PB: z.number().int().positive(),
  Spd: z.number().int().positive(),
});
export type CharacterAttributes = z.infer<typeof characterAttributesSchema>;

/** Psychic aptitude, which sets the save-vs-psionics target (RUE p.346/348). */
export const psychicClassSchema = z.enum(["masterPsychic", "majorOrMinorPsychic", "ordinary"]);
export type PsychicClass = z.infer<typeof psychicClassSchema>;

/** Player-authored physical description — free text, no mechanics. */
export const appearanceSchema = z.object({
  height: z.string().max(40).optional(),
  weight: z.string().max(40).optional(),
  age: z.string().max(40).optional(),
  eyes: z.string().max(80).optional(),
  origin: z.string().max(120).optional(),
  disposition: z.string().max(120).optional(),
});
export type Appearance = z.infer<typeof appearanceSchema>;

/**
 * Player-authored narrative identity ("users own their characters" — see
 * DESIGN.md). The rules engine ignores every field: this is story, not
 * mechanics, so nothing here can affect a derived number.
 */
export const narrativeSchema = z.object({
  /** One-line quote/tagline rendered under the name. */
  epithet: z.string().min(1).max(200).optional(),
  appearance: appearanceSchema.optional(),
  /** Short identity chips (e.g. "MAGIC ZONE SURVIVOR"). No commas — chips
   * are comma-separated in editors, so a comma would split on round-trip. */
  traits: z
    .array(
      z
        .string()
        .min(1)
        .max(60)
        .refine((t) => !t.includes(","), {
          message: "A trait cannot contain a comma.",
        }),
    )
    .max(12)
    .optional(),
  /** Long-form prose. Generous but bounded (~a few pages). */
  backstory: z.string().min(1).max(20_000).optional(),
});
export type Narrative = z.infer<typeof narrativeSchema>;

/**
 * A built character — the player's *choices*. Derived stats (bonuses, attacks,
 * save targets, resolved skill %s, spell strength, …) are computed by
 * `deriveSheet`, never stored. Optional `rolled` values pin the dice results
 * that would otherwise be shown as a range.
 */
export const characterSchema = z.object({
  name: z.string().min(1),
  occId: z.string().min(1),
  /** One of the seven canonical alignments (RUE pp.289-292). Optional because
   * characters stored before the alignment step existed have none; resolved
   * (and unknown ids rejected) in `deriveSheet`, like occ/skill/spell ids. */
  alignmentId: z.string().min(1).optional(),
  level: z.number().int().positive(),
  attributes: characterAttributesSchema,
  /** Hand-to-Hand combat type id (e.g. "basic"). */
  hthType: z.string().min(1),
  /** The character's psychic aptitude (sets the save-vs-psionics target). */
  psychicClass: psychicClassSchema.default("ordinary"),
  /** Duplicate skillIds are checked in `deriveSheet`, where the catalog's
   * per-skill `repeatable` flag is available (schemas can't see content). */
  skills: z.array(characterSkillSchema).default([]),
  spellIds: z
    .array(z.string().min(1))
    .refine((arr) => new Set(arr).size === arr.length, {
      message: "A spell cannot be known twice (duplicate spellId).",
    })
    .default([]),
  /** Owned items (one entry per physical instance). Item-kind rules are
   * checked in `deriveSheet`, which can see the catalog. */
  items: z.array(characterItemSchema).default([]),
  rolled: z
    .object({
      hitPoints: z.number().int().positive().optional(),
      sdc: z.number().int().nonnegative().optional(),
      ppe: z.number().int().nonnegative().optional(),
    })
    .optional(),
  /** Live resource state — what's LEFT of each rolled maximum (damage taken,
   * P.P.E. spent). Absent fields mean "at maximum". A field is only legal when
   * its maximum is rolled, never above it, and H.P. never below the -(P.E.)
   * coma/death floor — enforced in `deriveSheet` (the floor needs P.E.), so
   * illegal states are rejected at every write. H.P. may be negative: 0 down
   * to the floor is the coma band (RUE p.287). */
  current: z
    .object({
      hitPoints: z.number().int().optional(),
      sdc: z.number().int().nonnegative().optional(),
      ppe: z.number().int().nonnegative().optional(),
      /** Remaining main-body pool of the WORN armor — armor is its own
       * ablative layer (RUE p.287), so it lives beside the body pools. Only
       * legal while an armor with a known maximum is worn, never above that
       * maximum (enforced in `deriveSheet`). Cleared when armor changes:
       * a freshly equipped suit starts at its maximum. */
      armor: z.number().int().nonnegative().optional(),
      /** Days of battle-injury treatment already applied this course (drives
       * the professional 2-then-4 ramp, RUE p.354). Lives in `current` on
       * purpose: a full restore or vitals reroll clears it — fresh pools,
       * fresh course. When a NEW course starts within one set of pools is
       * GM adjudication (the treat mutation's explicit `day` override). */
      treatmentDays: z.number().int().nonnegative().optional(),
    })
    .optional(),
  /** Persisted only for the terminal state. Alive/coma are derived from live
   * H.P.; `deriveSheet` validates that dead agrees with the body pools. */
  lifeState: z.literal("dead").optional(),
  /** Optional player-authored identity; passed through to the sheet untouched. */
  narrative: narrativeSchema.optional(),
});
/** A fully-resolved character (defaulted fields present) — e.g. after parsing/from storage. */
export type Character = z.infer<typeof characterSchema>;
/** Character input for `deriveSheet` — defaulted fields (psychicClass/skills/spellIds) may be omitted. */
export type CharacterInput = z.input<typeof characterSchema>;
