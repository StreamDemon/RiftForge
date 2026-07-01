import { skillCatalogSchema, type Skill } from "../schema/skills.ts";
import skillsRaw from "../content/skills/skills.json" with { type: "json" };
import { bonusesForAttribute } from "./attributes.ts";

/** The skill catalog (RUE Skill Descriptions), validated at load. */
export const skillCatalog = skillCatalogSchema.parse(skillsRaw);

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Build the id and name indexes for a set of skills, failing fast on any
 * collision. A duplicate id, or a name/alias that normalizes to a key already
 * owned by a different skill, throws instead of silently shadowing the earlier
 * entry (which would make it unresolvable). The name index spans canonical
 * names + aliases so O.C.C. grants using a book's alternate wording resolve.
 */
export function buildSkillIndexes(skills: readonly Skill[]): {
  byId: Map<string, Skill>;
  byName: Map<string, Skill>;
} {
  const byId = new Map<string, Skill>();
  const byName = new Map<string, Skill>();
  for (const s of skills) {
    if (byId.has(s.id)) {
      throw new Error(`Duplicate skill id "${s.id}" in the catalog.`);
    }
    byId.set(s.id, s);
    for (const name of [s.name, ...(s.aliases ?? [])]) {
      const key = normalizeName(name);
      const existing = byName.get(key);
      if (existing && existing.id !== s.id) {
        throw new Error(
          `Skill name/alias "${name}" collides: maps to both "${existing.id}" and "${s.id}".`,
        );
      }
      byName.set(key, s);
    }
  }
  return { byId, byName };
}

const { byId: skillById, byName: skillByName } = buildSkillIndexes(skillCatalog.skills);

export function getSkill(id: string): Skill | undefined {
  return skillById.get(id);
}

/** Resolve a skill by its catalog name or any alias (case/space-insensitive). */
export function getSkillByName(name: string): Skill | undefined {
  return skillByName.get(normalizeName(name));
}

export interface ResolveSkillOptions {
  /** Character experience level (per-level growth applies from level 2). */
  level: number;
  /** Parenthetical O.C.C. bonus for this specific skill. */
  occBonus?: number;
  /** O.C.C.-related category bonus. */
  categoryBonus?: number;
  /** One-time I.Q. bonus (percent); see {@link iqSkillBonus}. */
  iqBonus?: number;
  /** Any other flat modifier. */
  otherBonus?: number;
  /** An O.C.C.-granted flat value that replaces the computed skill (e.g. LLW Native Tongue at 98%). */
  overrideValue?: number;
}

export interface ResolvedSkill {
  id: string;
  name: string;
  category: string;
  /** Final proficiency percentage (capped at the catalog max). */
  value: number;
  /** Final second percentage for two-value skills. */
  value2?: number;
  /** True if the raw total exceeded the cap. */
  capped: boolean;
}

/**
 * Resolve a skill's final percentage(s) for a character, applying the O.C.C.
 * bonus, I.Q. bonus, category bonus, and per-level growth, capped at 98%.
 */
export function resolveSkill(
  skillId: string,
  opts: ResolveSkillOptions,
): ResolvedSkill | undefined {
  const s = skillById.get(skillId);
  if (!s) return undefined;
  const cap = skillCatalog.maxPercent;
  if (opts.overrideValue !== undefined) {
    return {
      id: s.id,
      name: s.name,
      category: s.category,
      value: Math.min(cap, opts.overrideValue),
      capped: opts.overrideValue > cap,
    };
  }
  const flat =
    (opts.occBonus ?? 0) + (opts.categoryBonus ?? 0) + (opts.iqBonus ?? 0) + (opts.otherBonus ?? 0);
  const growth = s.fixed ? 0 : s.perLevel * Math.max(0, opts.level - 1);
  const rawPrimary = s.baseSkill + flat + growth;
  const rawSecondary = s.baseSkill2 !== undefined ? s.baseSkill2 + flat + growth : undefined;
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    value: Math.min(cap, rawPrimary),
    value2: rawSecondary !== undefined ? Math.min(cap, rawSecondary) : undefined,
    capped: rawPrimary > cap || (rawSecondary !== undefined && rawSecondary > cap),
  };
}

/** One-time I.Q. skill bonus (percent) from the Attribute Bonus Chart. */
export function iqSkillBonus(iq: number): number {
  return bonusesForAttribute("IQ", iq).allSkills ?? 0;
}
