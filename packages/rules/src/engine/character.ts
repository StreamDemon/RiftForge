import type { Alignment } from "../schema/alignments.ts";
import type { Character, CharacterInput, Narrative } from "../schema/character.ts";
import { characterSchema } from "../schema/character.ts";
import type { Armor, Item } from "../schema/items.ts";
import type { Occ } from "../schema/occ.ts";
import type { Spell } from "../schema/spells.ts";
import { getAlignment } from "./alignments.ts";
import { deriveAttributeBonuses } from "./attributes.ts";
import { diceMax, diceMin } from "./dice.ts";
import { armorMaxPool, armorNeedsRoll, getItem } from "./items.ts";
import {
  combatProfile,
  comaDeathFloor,
  hitPointsRange,
  physicalSdcRange,
  psionicsSaveTarget,
  savingThrowTarget,
  type StatRange,
} from "./combat.ts";
import { getOcc, ppeRange } from "./occ.ts";
import { getSkill, iqSkillBonus, resolveSkill, type ResolvedSkill } from "./skills.ts";
import { getSpell, occSpellStrength } from "./spells.ts";

/** A dice-derived stat: its range, plus the concrete roll if one was recorded. */
export interface StatValue extends StatRange {
  rolled?: number;
  /** What's left of the rolled maximum (damage taken, P.P.E. spent). Present
   * exactly when `rolled` is; equals `rolled` until something depletes it. */
  current?: number;
}

/** A saving throw: the d20 target (fixed or a range) and the character's total bonus. */
export interface SheetSave {
  target?: number;
  targetRange?: { min: number; max: number };
  bonus: number;
  /** Set for percentile saves (e.g. coma/death), whose "bonus" is a percentage. */
  percent?: boolean;
}

/** An owned item resolved against the catalog, with its per-instance state. */
export interface SheetEquipmentEntry {
  item: Item;
  worn?: boolean;
  rolledMdc?: number;
}

/** The worn armor's live layer — its own ablative pool, never mixed into the
 * body vitals (there is no AC in Palladium; RUE p.287). */
export interface SheetArmor {
  item: Armor;
  /** Maximum main-body pool; absent until a dice-capacity suit is rolled. */
  max?: number;
  /** Remaining pool (equals max until damaged); present exactly when `max` is. */
  current?: number;
}

export interface CharacterSheet {
  name: string;
  occ: { id: string; name: string; category: string };
  /** Present when the character has picked an alignment. */
  alignment?: Alignment;
  /** Player-authored identity, passed through untouched (never affects numbers). */
  narrative?: Narrative;
  level: number;
  attributes: Character["attributes"];
  attributeBonuses: Record<string, number>;
  combat: {
    attacksPerMelee: number;
    strike: number;
    parry: number;
    dodge: number;
    damageBonus: number;
  };
  vitals: {
    hitPoints: StatValue;
    sdc: StatValue;
    comaDeathFloor: number;
    /** Days of battle-injury treatment already applied this course. */
    treatmentDays: number;
  };
  /** Present for spell-casting O.C.C.s. */
  ppe?: StatValue;
  spellStrength?: number;
  saves: Record<string, SheetSave>;
  skills: ResolvedSkill[];
  spells: { known: Spell[]; count: number };
  equipment: SheetEquipmentEntry[];
  /** Present when an armor is worn. */
  armor?: SheetArmor;
}

/** Total O.C.C. save bonus for a given save target at a level (respects level gating). */
function occSaveBonus(occ: Occ, target: string, level: number): number {
  let total = 0;
  for (const b of occ.bonuses ?? []) {
    if (b.type !== "save" || b.target !== target || typeof b.value !== "number") {
      continue;
    }
    total +=
      b.atLevels && b.atLevels.length > 0
        ? b.atLevels.filter((l) => l <= level).length * b.value
        : b.value;
  }
  return total;
}

function withRolled(range: StatRange, rolled?: number, current?: number): StatValue {
  return rolled === undefined ? { ...range } : { ...range, rolled, current: current ?? rolled };
}

/**
 * Assemble a character's full derived sheet from their choices — the heart of
 * the "smart" sheet. Pure and deterministic (dice *rolls* are inputs via
 * `character.rolled`, not generated here), so it runs anywhere: tests, the
 * Convex backend, or the client.
 */
export function deriveSheet(input: CharacterInput): CharacterSheet {
  const character = characterSchema.parse(input);
  const occ = getOcc(character.occId);
  if (!occ) throw new Error(`Unknown O.C.C. "${character.occId}".`);

  let alignment: Alignment | undefined;
  if (character.alignmentId !== undefined) {
    alignment = getAlignment(character.alignmentId);
    if (!alignment) throw new Error(`Unknown alignment "${character.alignmentId}".`);
  }

  const attrs = character.attributes;
  const { level } = character;
  const iqBonus = iqSkillBonus(attrs.IQ);
  const attributeBonuses = deriveAttributeBonuses(attrs);
  const combat = combatProfile({
    attributes: attrs,
    hthType: character.hthType,
    level,
  });

  const isCaster = occ.spellKnowledge !== undefined || occ.ppe !== undefined;

  // Live `current` values are only meaningful against a rolled maximum, and a
  // write that exceeds it (or sinks H.P. below the coma/death floor) is a bug
  // upstream — reject rather than clamp, so illegal states never reach storage
  // (the backend validates every write through this function).
  const floor = comaDeathFloor(attrs.PE);
  const currentMinimums = [
    ["hitPoints", floor],
    ["sdc", 0],
    ["ppe", 0],
  ] as const;
  for (const [field, min] of currentMinimums) {
    const cur = character.current?.[field];
    if (cur === undefined) continue;
    const max = character.rolled?.[field];
    if (max === undefined) {
      throw new Error(`current.${field} requires rolled.${field} — no maximum to measure against.`);
    }
    if (cur > max) {
      throw new Error(`current.${field} (${cur}) exceeds the rolled maximum (${max}).`);
    }
    if (cur < min) {
      throw new Error(`current.${field} (${cur}) is below the legal minimum (${min}).`);
    }
  }

  const saves: Record<string, SheetSave> = {
    magic: {
      targetRange: savingThrowTarget("magic")?.targetRange,
      bonus: combat.saveBonuses.magic + occSaveBonus(occ, "magic", level),
    },
    psionics: {
      target: psionicsSaveTarget(character.psychicClass),
      bonus: combat.saveBonuses.psionic,
    },
    insanity: {
      target: savingThrowTarget("insanity")?.target,
      bonus: combat.saveBonuses.insanity,
    },
    lethalPoison: {
      target: savingThrowTarget("lethalPoison")?.target,
      bonus: combat.saveBonuses.poison,
    },
    curses: {
      target: savingThrowTarget("curses")?.target,
      bonus: occSaveBonus(occ, "curses", level),
    },
    horrorFactor: { bonus: occSaveBonus(occ, "horrorFactor", level) },
    possession: {
      bonus: occSaveBonus(occ, "possessionAndMindControl", level),
    },
    comaDeath: { bonus: combat.saveBonuses.comaDeathPct, percent: true },
  };

  const seenSkillIds = new Set<string>();
  const skills = character.skills.map((s): ResolvedSkill => {
    const skill = getSkill(s.skillId);
    if (!skill) throw new Error(`Unknown skill "${s.skillId}".`);
    if (seenSkillIds.has(skill.id) && !skill.repeatable) {
      throw new Error(`Skill "${skill.id}" cannot be taken twice.`);
    }
    seenSkillIds.add(skill.id);
    const resolved = resolveSkill(skill.id, {
      level,
      occBonus: s.occBonus,
      categoryBonus: s.categoryBonus,
      iqBonus,
      overrideValue: s.overrideValue,
    });
    if (!resolved) throw new Error(`Unknown skill "${s.skillId}".`);
    return s.label === undefined ? resolved : { ...resolved, label: s.label };
  });

  const knownSpells = character.spellIds.map((id): Spell => {
    const spell = getSpell(id);
    if (!spell) throw new Error(`Unknown spell "${id}".`);
    return spell;
  });

  // Resolve owned items, enforcing the kind rules the schema can't see:
  // `worn` and `rolledMdc` are armor-only, a per-suit roll must match its
  // printed dice, and at most one armor is worn at a time.
  let wornArmor: SheetArmor | undefined;
  const equipment = character.items.map((entry): SheetEquipmentEntry => {
    const item = getItem(entry.itemId);
    if (!item) throw new Error(`Unknown item "${entry.itemId}".`);
    if (entry.rolledMdc !== undefined) {
      if (item.kind !== "armor" || !armorNeedsRoll(item)) {
        throw new Error(
          `rolledMdc on "${item.id}" — only armor with dice-capacity M.D.C. is rolled per suit.`,
        );
      }
      const formula = item.mdc!.mainBody;
      if (entry.rolledMdc < diceMin(formula) || entry.rolledMdc > diceMax(formula)) {
        throw new Error(
          `rolledMdc (${entry.rolledMdc}) is outside the printed ${formula} range for "${item.id}".`,
        );
      }
    }
    if (entry.worn === true) {
      if (item.kind !== "armor") {
        throw new Error(`Only armor can be worn — "${item.id}" is ${item.kind}.`);
      }
      if (wornArmor !== undefined) {
        throw new Error("At most one armor can be worn at a time.");
      }
      wornArmor = { item, max: armorMaxPool(item, entry.rolledMdc) };
    }
    return {
      item,
      ...(entry.worn === true ? { worn: true } : {}),
      ...(entry.rolledMdc !== undefined ? { rolledMdc: entry.rolledMdc } : {}),
    };
  });

  // The armor pool follows the vitals rule: `current` is only meaningful
  // against a known maximum, and a write above it is rejected, not clamped.
  const currentArmor = character.current?.armor;
  if (currentArmor !== undefined) {
    if (wornArmor === undefined) {
      throw new Error("current.armor requires a worn armor — no pool to measure against.");
    }
    if (wornArmor.max === undefined) {
      throw new Error(
        "current.armor requires the suit's rolled M.D.C. — no maximum to measure against.",
      );
    }
    if (currentArmor > wornArmor.max) {
      throw new Error(
        `current.armor (${currentArmor}) exceeds the suit's maximum (${wornArmor.max}).`,
      );
    }
  }
  if (wornArmor !== undefined && wornArmor.max !== undefined) {
    wornArmor.current = currentArmor ?? wornArmor.max;
  }

  return {
    name: character.name,
    occ: { id: occ.id, name: occ.name, category: occ.category },
    alignment,
    narrative: character.narrative,
    level,
    attributes: attrs,
    attributeBonuses,
    combat: {
      attacksPerMelee: combat.attacksPerMelee,
      strike: combat.strike,
      parry: combat.parry,
      dodge: combat.dodge,
      damageBonus: combat.damageBonus,
    },
    vitals: {
      hitPoints: withRolled(
        hitPointsRange(attrs.PE, level),
        character.rolled?.hitPoints,
        character.current?.hitPoints,
      ),
      sdc: withRolled(physicalSdcRange(), character.rolled?.sdc, character.current?.sdc),
      comaDeathFloor: floor,
      treatmentDays: character.current?.treatmentDays ?? 0,
    },
    ppe: occ.ppe
      ? withRolled(ppeRange(occ, attrs.PE, level), character.rolled?.ppe, character.current?.ppe)
      : undefined,
    spellStrength: isCaster ? occSpellStrength(occ, level) : undefined,
    saves,
    skills,
    spells: { known: knownSpells, count: knownSpells.length },
    equipment,
    armor: wornArmor,
  };
}
