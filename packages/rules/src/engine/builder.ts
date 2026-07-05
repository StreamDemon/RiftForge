import { z } from "zod";
import type { CharacterSkill, PsychicClass } from "../schema/character.ts";
import type { AttributeCode } from "../schema/attributes.ts";
import type { Occ } from "../schema/occ.ts";
import type { Skill } from "../schema/skills.ts";
import { getAlignment } from "./alignments.ts";
import { getHandToHand } from "./combat.ts";
import type { Rng } from "./dice.ts";
import { rollPercentile } from "./rolls.ts";
import { getSkill, getSkillByName, skillCatalog } from "./skills.ts";
import { initialSpellChoices } from "./spells.ts";

/**
 * Character-creation assembly: turns an O.C.C.'s printed grants into typed
 * plans a builder UI can render, and validates the player's selections into
 * storable `CharacterSkill[]`. Level-1 only — skill progression at later
 * levels (`progression`, `newSkillsStartAtLevel1`) is level-up territory.
 */

// ---------------------------------------------------------------------------
// Attribute requirements (surfaced at the O.C.C. step; RUE per-O.C.C. entries)

export interface RequirementFailure {
  code: AttributeCode;
  min: number;
  actual: number;
}

export interface RequirementCheck {
  ok: boolean;
  failures: RequirementFailure[];
}

/** Check rolled attributes against the O.C.C.'s printed requirements. */
export function meetsAttributeRequirements(
  occ: Occ,
  attributes: Partial<Record<AttributeCode, number>>,
): RequirementCheck {
  const failures: RequirementFailure[] = [];
  for (const req of occ.attributeRequirements) {
    const actual = attributes[req.code] ?? 0;
    if (actual < req.min) failures.push({ code: req.code, min: req.min, actual });
  }
  return { ok: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// Psionics (Step 4, RUE p.289 — Random Psionics Table)

export interface PsionicsRoll {
  /** The percentile roll (1-100). */
  roll: number;
  /** 01-10 major, 11-25 minor, 26-00 none. */
  result: "major" | "minor" | "none";
  /** The corresponding save class: major and minor both save as majorOrMinorPsychic. */
  psychicClass: PsychicClass;
}

/** Roll the Random Psionics Table (RUE p.289). */
export function rollPsionics(rng: Rng = Math.random): PsionicsRoll {
  const roll = rollPercentile(rng);
  const result = roll <= 10 ? "major" : roll <= 25 ? "minor" : "none";
  return {
    roll,
    result,
    psychicClass: result === "none" ? "ordinary" : "majorOrMinorPsychic",
  };
}

// ---------------------------------------------------------------------------
// O.C.C. skill grants -> a typed plan

/** The grant shapes O.C.C. content uses (schema keeps `occSkills` loose). */
const overrideGrant = z.object({
  skill: z.string(),
  skillId: z.string(),
  atLevel1: z.number().int(),
  fixed: z.literal(true),
});
const repeatChoiceGrant = z.object({
  skill: z.string(),
  skillId: z.string(),
  choose: z.number().int().positive(),
  occBonus: z.number().int().optional(),
});
const categoryChoiceGrant = z.object({
  skill: z.string(),
  chooseFromCategory: z.string(),
  choose: z.number().int().positive(),
  occBonus: z.number().int().optional(),
});
const prefixChoiceGrant = z.object({
  skill: z.string(),
  skillPrefix: z.string(),
  choose: z.number().int().positive(),
  occBonus: z.number().int().optional(),
});
const hthUpgradeShape = z.object({
  to: z.string(),
  cost: z.object({ occRelatedSkills: z.number().int().positive() }),
  requiresAlignment: z.string().optional(),
});
const hthGrant = z.object({
  skill: z.string(),
  hthId: z.string(),
  upgrades: z.array(hthUpgradeShape).optional(),
});
const fixedGrant = z.object({
  skill: z.string(),
  skillId: z.string(),
  occBonus: z.number().int().optional(),
});
// Order matters: shapes with required distinguishing fields come first.
const grantSchema = z.union([
  overrideGrant,
  repeatChoiceGrant,
  categoryChoiceGrant,
  prefixChoiceGrant,
  hthGrant,
  fixedGrant,
]);

/** A choose-N slot from an O.C.C. skill grant. */
export interface OccSkillChoice {
  /** Stable key for wiring UI selections back to this slot. */
  key: string;
  /** The grant's printed name (e.g. "Language: Other", "Lore"). */
  label: string;
  choose: number;
  occBonus?: number;
  /** Catalog skills eligible for this slot. */
  options: Skill[];
  /** True when all picks are the same repeatable skill and need labels to tell apart. */
  repeatable: boolean;
}

export interface HthUpgrade {
  /** Printed target (e.g. "Hand to Hand: Expert"). */
  to: string;
  /** Resolvable hand-to-hand id, when the target type is modeled. */
  hthId?: string;
  /** O.C.C. Related skill selections this upgrade costs. */
  cost: number;
  /** Alignment category the upgrade demands (e.g. Assassin requires evil). */
  requiresAlignmentCategory?: string;
  /** False when the target H2H type is not modeled in combat content. */
  available: boolean;
}

export interface OccSkillPlan {
  /** Grants with no player choice, ready to store. */
  fixed: CharacterSkill[];
  /** Choose-N slots the player must fill. */
  choices: OccSkillChoice[];
  /** The granted hand-to-hand type and its printed upgrade options. */
  hth?: { hthId: string; name: string; upgrades: HthUpgrade[] };
}

/** "Hand to Hand: Expert" -> "expert", "Martial Arts" -> "martial-arts". */
function hthIdFromName(name: string): string {
  const last = name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
  return last.trim().toLowerCase().replace(/\s+/g, "-");
}

function requireSkill(id: string, context: string): Skill {
  const skill = getSkill(id);
  if (!skill) throw new Error(`${context} references unknown skill "${id}".`);
  return skill;
}

/**
 * Parse the O.C.C.'s printed skill grants into fixed picks and choice slots.
 * Throws on content bugs (unknown skill ids, unrecognized grant shapes) so bad
 * data surfaces in tests, not in the builder UI.
 */
export function occSkillPlan(occ: Occ): OccSkillPlan {
  const fixed: CharacterSkill[] = [];
  const choices: OccSkillChoice[] = [];
  let hth: OccSkillPlan["hth"];

  for (const raw of occ.occSkills ?? []) {
    const parsed = grantSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`O.C.C. "${occ.id}" has an unrecognized skill grant: "${raw.skill}".`);
    }
    const grant = parsed.data;

    if ("atLevel1" in grant) {
      requireSkill(grant.skillId, `O.C.C. "${occ.id}"`);
      fixed.push({ skillId: grant.skillId, overrideValue: grant.atLevel1 });
    } else if ("hthId" in grant) {
      if (!getHandToHand(grant.hthId)) {
        throw new Error(`O.C.C. "${occ.id}" grants unknown hand-to-hand "${grant.hthId}".`);
      }
      hth = {
        hthId: grant.hthId,
        name: grant.skill,
        upgrades: (grant.upgrades ?? []).map((u) => {
          const id = hthIdFromName(u.to);
          const available = getHandToHand(id) !== undefined;
          return {
            to: u.to,
            hthId: available ? id : undefined,
            cost: u.cost.occRelatedSkills,
            requiresAlignmentCategory: u.requiresAlignment,
            available,
          };
        }),
      };
    } else if ("choose" in grant && "skillId" in grant) {
      const skill = requireSkill(grant.skillId, `O.C.C. "${occ.id}"`);
      choices.push({
        key: grant.skillId,
        label: grant.skill,
        choose: grant.choose,
        occBonus: grant.occBonus,
        options: [skill],
        repeatable: skill.repeatable === true,
      });
    } else if ("chooseFromCategory" in grant) {
      const options = skillCatalog.skills.filter((s) => s.category === grant.chooseFromCategory);
      if (options.length === 0) {
        throw new Error(
          `O.C.C. "${occ.id}" chooses from category "${grant.chooseFromCategory}", which has no skills in the catalog.`,
        );
      }
      choices.push({
        key: `category:${grant.chooseFromCategory}`,
        label: grant.skill,
        choose: grant.choose,
        occBonus: grant.occBonus,
        options,
        repeatable: false,
      });
    } else if ("skillPrefix" in grant) {
      const options = skillCatalog.skills.filter((s) => s.name.startsWith(grant.skillPrefix));
      if (options.length === 0) {
        throw new Error(
          `O.C.C. "${occ.id}" chooses skills prefixed "${grant.skillPrefix}", of which the catalog has none.`,
        );
      }
      choices.push({
        key: `prefix:${grant.skillPrefix}`,
        label: grant.skill,
        choose: grant.choose,
        occBonus: grant.occBonus,
        options,
        repeatable: false,
      });
    } else {
      requireSkill(grant.skillId, `O.C.C. "${occ.id}"`);
      fixed.push({
        skillId: grant.skillId,
        ...(grant.occBonus !== undefined ? { occBonus: grant.occBonus } : {}),
      });
    }
  }

  return { fixed, choices, hth };
}

// ---------------------------------------------------------------------------
// O.C.C. Related and Secondary skill plans

export interface RelatedSkillPlan {
  /** Selections at level 1 (before any H2H upgrade costs). */
  count: number;
  /** Minimum picks per category (e.g. LLW: at least 2 Science, 1 Technical). */
  constraints: { fromCategory: string; min: number }[];
  /** Category -> flat O.C.C. bonus applied to related picks from it. */
  categoryBonuses: Record<string, number>;
  /** Catalog skills eligible as related picks. */
  options: Skill[];
  /** Category rules that could not be applied mechanically (kept for display). */
  notes: string[];
}

/** Split a printed list like "General and Exotic Animals" / "First Aid or Paramedic". */
function splitNames(text: string): string[] {
  return text
    .split(/,|\band\b|\bor\b/)
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
}

/**
 * Which catalog skills a category rule admits. `undefined` means the whole
 * category; an empty array means none of the named skills exist in the
 * catalog yet.
 */
function allowedSkillsForRule(rule: { category: string; allowed: string }): Skill[] | undefined {
  const text = rule.allowed.replace(/\([^)]*\)/g, "").trim();
  if (text === "any") return undefined;
  const inCategory = skillCatalog.skills.filter((s) => s.category === rule.category);
  if (text === "none") return [];
  const except = text.match(/^any except (.+)$/i);
  if (except) {
    const excluded = new Set(
      splitNames(except[1]!)
        .map((n) => getSkillByName(n)?.id)
        .filter((id) => id !== undefined),
    );
    // Names that don't resolve yet exclude nothing — they're future content.
    return inCategory.filter((s) => !excluded.has(s.id));
  }
  const only = text.match(/^(.+?)\s+only$/i);
  if (only) {
    return splitNames(only[1]!)
      .map((n) => getSkillByName(n))
      .filter((s): s is Skill => s !== undefined && s.category === rule.category);
  }
  // Unparsed free text: admit the named skills we can resolve, none otherwise.
  return splitNames(text).filter((n) => getSkillByName(n) !== undefined).length > 0
    ? splitNames(text)
        .map((n) => getSkillByName(n))
        .filter((s): s is Skill => s !== undefined && s.category === rule.category)
    : [];
}

/** The O.C.C. Related skill selections available at level 1. */
export function relatedSkillPlan(occ: Occ): RelatedSkillPlan {
  const related = occ.occRelatedSkills;
  if (!related) {
    return { count: 0, constraints: [], categoryBonuses: {}, options: [], notes: [] };
  }

  const categoryBonuses: Record<string, number> = {};
  const notes: string[] = [];
  const rules = related.categoryRules ?? [];
  const ruled = new Set(rules.map((r) => r.category));
  let options: Skill[] = [];

  for (const rule of rules) {
    const allowed = allowedSkillsForRule(rule);
    const inCategory = skillCatalog.skills.filter((s) => s.category === rule.category);
    options = options.concat(allowed ?? inCategory);
    if (rule.bonus !== undefined) categoryBonuses[rule.category] = rule.bonus;
    if (rule.allowed !== "any" && rule.allowed !== "none") {
      notes.push(`${rule.category}: ${rule.allowed}`);
    }
  }
  // Categories without a printed rule are available as-is.
  options = options.concat(skillCatalog.skills.filter((s) => !ruled.has(s.category)));

  return {
    count: related.count,
    constraints: related.constraints ?? [],
    categoryBonuses,
    options,
    notes,
  };
}

export interface SecondarySkillPlan {
  /** Selections at level 1. */
  count: number;
  /** Secondary picks get no O.C.C./category bonuses (only I.Q. may apply). */
  options: Skill[];
  notes: string[];
}

/**
 * Secondary skill selections at level 1. The RUE "Secondary Skills list" is
 * not modeled as content yet, so this offers the same eligible pool as
 * related picks — without any bonuses.
 */
export function secondarySkillPlan(occ: Occ): SecondarySkillPlan {
  const secondary = occ.secondarySkills;
  if (!secondary) return { count: 0, options: [], notes: [] };
  // Without related-skill category rules, the whole catalog is the pool.
  const options = occ.occRelatedSkills ? relatedSkillPlan(occ).options : [...skillCatalog.skills];
  return {
    count: secondary.count,
    options,
    notes: secondary.notes ? [secondary.notes] : [],
  };
}

// ---------------------------------------------------------------------------
// Selections -> validated CharacterSkill[]

/** One player pick: a skill plus the label that distinguishes repeatable picks. */
export interface SkillPick {
  skillId: string;
  /** e.g. which language ("Dragonese") for a repeatable skill. */
  label?: string;
}

export interface BuilderSelections {
  /** Picks per choice slot, keyed by `OccSkillChoice.key`. */
  occChoices: Record<string, SkillPick[]>;
  related: SkillPick[];
  secondary: SkillPick[];
  /** Chosen hand-to-hand id; defaults to the O.C.C. grant. */
  hthId?: string;
  /** Needed when an H2H upgrade has an alignment requirement. */
  alignmentId?: string;
}

export interface AssembledSkills {
  skills: CharacterSkill[];
  hthType: string;
  /** Human-readable rule violations; empty means the build is legal. */
  errors: string[];
}

/**
 * Validate the player's selections against the O.C.C.'s plans and produce the
 * storable skill list. Always returns the best-effort assembly alongside any
 * errors, so a UI can render partial state; a build is legal only when
 * `errors` is empty. (`deriveSheet` + the backend re-validate regardless.)
 */
export function assembleSkills(occ: Occ, selections: BuilderSelections): AssembledSkills {
  const errors: string[] = [];
  const plan = occSkillPlan(occ);
  const related = relatedSkillPlan(occ);
  const secondary = secondarySkillPlan(occ);
  const skills: CharacterSkill[] = [...plan.fixed];

  // Hand-to-hand: the grant itself, or a printed upgrade.
  let hthType = plan.hth?.hthId ?? "none";
  let upgradeCost = 0;
  if (selections.hthId !== undefined && selections.hthId !== hthType) {
    const upgrade = plan.hth?.upgrades.find((u) => u.hthId === selections.hthId);
    if (!upgrade) {
      errors.push(`Hand to hand "${selections.hthId}" is not available to this O.C.C.`);
    } else {
      hthType = selections.hthId;
      upgradeCost = upgrade.cost;
      if (upgrade.requiresAlignmentCategory !== undefined) {
        const alignment = selections.alignmentId ? getAlignment(selections.alignmentId) : undefined;
        if (alignment?.category !== upgrade.requiresAlignmentCategory) {
          errors.push(`${upgrade.to} requires an ${upgrade.requiresAlignmentCategory} alignment.`);
        }
      }
    }
  }

  // O.C.C. choice slots.
  for (const slot of plan.choices) {
    const picks = selections.occChoices[slot.key] ?? [];
    if (picks.length !== slot.choose) {
      errors.push(`${slot.label}: pick ${slot.choose} (picked ${picks.length}).`);
    }
    const optionIds = new Set(slot.options.map((s) => s.id));
    for (const pick of picks) {
      if (!optionIds.has(pick.skillId)) {
        errors.push(`${slot.label}: "${pick.skillId}" is not an option for this slot.`);
        continue;
      }
      skills.push({
        skillId: pick.skillId,
        ...(slot.occBonus !== undefined ? { occBonus: slot.occBonus } : {}),
        ...(pick.label !== undefined ? { label: pick.label } : {}),
      });
    }
  }

  // O.C.C. Related picks: count (minus upgrade cost), eligibility, constraints, bonuses.
  if (upgradeCost > related.count) {
    errors.push(
      `The hand-to-hand upgrade costs ${upgradeCost} O.C.C. Related selections but only ${related.count} are granted.`,
    );
  }
  const relatedCount = Math.max(0, related.count - upgradeCost);
  if (selections.related.length !== relatedCount) {
    errors.push(
      `O.C.C. Related skills: pick ${relatedCount}` +
        (upgradeCost > 0
          ? ` (${related.count} minus ${upgradeCost} for the hand-to-hand upgrade)`
          : "") +
        ` (picked ${selections.related.length}).`,
    );
  }
  const relatedIds = new Set(related.options.map((s) => s.id));
  const perCategory: Record<string, number> = {};
  for (const pick of selections.related) {
    const skill = getSkill(pick.skillId);
    if (!skill || !relatedIds.has(pick.skillId)) {
      errors.push(`O.C.C. Related skills: "${pick.skillId}" is not an eligible pick.`);
      continue;
    }
    perCategory[skill.category] = (perCategory[skill.category] ?? 0) + 1;
    const bonus = related.categoryBonuses[skill.category];
    skills.push({
      skillId: pick.skillId,
      ...(bonus !== undefined ? { categoryBonus: bonus } : {}),
      ...(pick.label !== undefined ? { label: pick.label } : {}),
    });
  }
  for (const constraint of related.constraints) {
    const have = perCategory[constraint.fromCategory] ?? 0;
    if (have < constraint.min) {
      errors.push(
        `O.C.C. Related skills: at least ${constraint.min} from ${constraint.fromCategory} (picked ${have}).`,
      );
    }
  }

  // Secondary picks: count and eligibility, no bonuses.
  if (selections.secondary.length !== secondary.count) {
    errors.push(
      `Secondary skills: pick ${secondary.count} (picked ${selections.secondary.length}).`,
    );
  }
  const secondaryIds = new Set(secondary.options.map((s) => s.id));
  for (const pick of selections.secondary) {
    if (!secondaryIds.has(pick.skillId)) {
      errors.push(`Secondary skills: "${pick.skillId}" is not an eligible pick.`);
      continue;
    }
    skills.push({
      skillId: pick.skillId,
      ...(pick.label !== undefined ? { label: pick.label } : {}),
    });
  }

  // Duplicates across the whole build: repeatable skills need distinct labels.
  const seen = new Map<string, Set<string | undefined>>();
  for (const entry of skills) {
    const skill = getSkill(entry.skillId);
    const labels = seen.get(entry.skillId);
    if (!labels) {
      seen.set(entry.skillId, new Set([entry.label]));
      continue;
    }
    if (skill && skill.repeatable !== true) {
      errors.push(`"${skill.name}" cannot be taken twice.`);
    } else if (labels.has(entry.label)) {
      errors.push(
        `"${skill?.name ?? entry.skillId}" is picked more than once with the same label — label each pick (e.g. which language).`,
      );
    }
    labels.add(entry.label);
  }

  return { skills, hthType, errors };
}

// ---------------------------------------------------------------------------
// Initial spells

/**
 * Validate an initial spell selection against the O.C.C.'s printed rule
 * (e.g. Ley Line Walker: three spells from each of levels 1-4).
 */
export function validateInitialSpells(occ: Occ, spellIds: readonly string[]): string[] {
  const errors: string[] = [];
  const choices = initialSpellChoices(occ);
  if (choices.length === 0) {
    if (spellIds.length > 0) errors.push(`${occ.name} has no initial spell selection.`);
    return errors;
  }

  const remaining = new Set(spellIds);
  if (remaining.size !== spellIds.length) errors.push("A spell cannot be picked twice.");

  for (const choice of choices) {
    const optionIds = new Set(choice.options.map((s) => s.id));
    const picked = spellIds.filter((id) => optionIds.has(id));
    if (picked.length !== choice.choose) {
      errors.push(`Spell level ${choice.level}: pick ${choice.choose} (picked ${picked.length}).`);
    }
    for (const id of picked) remaining.delete(id);
  }
  for (const id of remaining) {
    errors.push(`"${id}" is not part of the initial spell selection.`);
  }
  return errors;
}
