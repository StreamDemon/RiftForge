import type { Character, CharacterInput } from "../schema/character.ts";
import { characterSchema } from "../schema/character.ts";
import type { Occ } from "../schema/occ.ts";
import type { Spell } from "../schema/spells.ts";
import { deriveAttributeBonuses } from "./attributes.ts";
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
import { iqSkillBonus, resolveSkill, type ResolvedSkill } from "./skills.ts";
import { getSpell, occSpellStrength } from "./spells.ts";

/** A dice-derived stat: its range, plus the concrete roll if one was recorded. */
export interface StatValue extends StatRange {
  rolled?: number;
}

/** A saving throw: the d20 target (fixed or a range) and the character's total bonus. */
export interface SheetSave {
  target?: number;
  targetRange?: { min: number; max: number };
  bonus: number;
  /** Set for percentile saves (e.g. coma/death), whose "bonus" is a percentage. */
  percent?: boolean;
}

export interface CharacterSheet {
  name: string;
  occ: { id: string; name: string; category: string };
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
  vitals: { hitPoints: StatValue; sdc: StatValue; comaDeathFloor: number };
  /** Present for spell-casting O.C.C.s. */
  ppe?: StatValue;
  spellStrength?: number;
  saves: Record<string, SheetSave>;
  skills: ResolvedSkill[];
  spells: { known: Spell[]; count: number };
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

function withRolled(range: StatRange, rolled?: number): StatValue {
  return rolled === undefined ? { ...range } : { ...range, rolled };
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

  const skills = character.skills
    .map((s) =>
      resolveSkill(s.skillId, {
        level,
        occBonus: s.occBonus,
        categoryBonus: s.categoryBonus,
        iqBonus,
      }),
    )
    .filter((r): r is ResolvedSkill => r !== undefined);

  const knownSpells = character.spellIds
    .map((id) => getSpell(id))
    .filter((s): s is Spell => s !== undefined);

  return {
    name: character.name,
    occ: { id: occ.id, name: occ.name, category: occ.category },
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
      hitPoints: withRolled(hitPointsRange(attrs.PE, level), character.rolled?.hitPoints),
      sdc: withRolled(physicalSdcRange(), character.rolled?.sdc),
      comaDeathFloor: comaDeathFloor(attrs.PE),
    },
    ppe: occ.ppe ? withRolled(ppeRange(occ, attrs.PE, level), character.rolled?.ppe) : undefined,
    spellStrength: isCaster ? occSpellStrength(occ, level) : undefined,
    saves,
    skills,
    spells: { known: knownSpells, count: knownSpells.length },
  };
}
