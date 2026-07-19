import combatExchangeRaw from "../content/combat/combat-exchange.json" with { type: "json" };
import {
  combatContextSchema,
  combatExchangeRulesSchema,
  type AttackKind,
  type CombatContext,
} from "../schema/combat-exchange.ts";
import type { WeaponCategory } from "../schema/items.ts";
import type { CharacterSheet, SheetEquipmentEntry } from "./character.ts";

export const combatExchangeRules = combatExchangeRulesSchema.parse(combatExchangeRaw);

export interface ModifierSource {
  source: "attribute" | "handToHand" | "proficiency";
  label: string;
  value: number;
}

export interface WeaponInstanceSnapshot {
  index: number;
  itemId: string;
  worn?: boolean;
  rolledMdc?: number;
}

export type AttackProfile =
  | {
      supported: false;
      reason: "weaponMissingOrChanged" | "unsupportedWeaponMode" | "unsupportedMdWeapon";
      weapon?: WeaponInstanceSnapshot & { name: string };
    }
  | {
      supported: true;
      kind: AttackKind;
      minimumStrikeTotal: number;
      strikeBonus: number;
      strikeBonusSources: ModifierSource[];
      proficiencyBonus: number;
      damageFormula: string;
      damageBonus: number;
      criticalOn: number;
      damageType: "sdc";
      weapon: WeaponInstanceSnapshot & { name: string; category: WeaponCategory };
    };

const meleeCategories = new Set<WeaponCategory>(["knife", "axe"]);

function weaponSnapshot(
  entry: SheetEquipmentEntry,
  index: number,
): WeaponInstanceSnapshot & { name: string } {
  return {
    index,
    itemId: entry.item.id,
    name: entry.item.name,
    ...(entry.worn === true ? { worn: true } : {}),
    ...(entry.rolledMdc === undefined ? {} : { rolledMdc: entry.rolledMdc }),
  };
}

export function deriveAttackProfile(sheet: CharacterSheet, weaponIndex: number): AttackProfile {
  const entry = Number.isInteger(weaponIndex) ? sheet.equipment[weaponIndex] : undefined;
  if (entry === undefined) return { supported: false, reason: "weaponMissingOrChanged" };
  const snapshot = weaponSnapshot(entry, weaponIndex);
  if (entry.item.kind !== "weapon") {
    return { supported: false, reason: "unsupportedWeaponMode", weapon: snapshot };
  }
  if (entry.item.damage.type === "md") {
    return { supported: false, reason: "unsupportedMdWeapon", weapon: snapshot };
  }

  const kind: AttackKind = meleeCategories.has(entry.item.category) ? "melee" : "ranged";
  const strikeBonusSources: ModifierSource[] =
    kind === "melee"
      ? [
          { source: "attribute", label: "P.P.", value: sheet.attributeBonuses.strike ?? 0 },
          {
            source: "handToHand",
            label: "Hand-to-Hand",
            value: sheet.combat.handToHandBonuses.strike ?? 0,
          },
        ]
      : [
          {
            source: "handToHand",
            label: "Gun-specific Hand-to-Hand",
            value: sheet.combat.handToHandBonuses.strikeGuns ?? 0,
          },
          { source: "proficiency", label: "Modern W.P.", value: 0 },
        ];
  return {
    supported: true,
    kind,
    minimumStrikeTotal: combatExchangeRules.minimumStrikeTotal[kind],
    strikeBonus: strikeBonusSources.reduce((sum, source) => sum + source.value, 0),
    strikeBonusSources,
    proficiencyBonus: 0,
    damageFormula: entry.item.damage.formula,
    damageBonus: kind === "melee" ? sheet.combat.damageBonus : 0,
    criticalOn: kind === "melee" ? sheet.combat.criticalStrikeOn : 20,
    damageType: "sdc",
    weapon: { ...snapshot, category: entry.item.category },
  };
}

export function validateCombatContext(
  profile: Extract<AttackProfile, { supported: true }>,
  input: unknown,
): CombatContext {
  const context = combatContextSchema.parse(input);
  if (context.kind !== profile.kind) {
    throw new Error(
      `invalidContext: ${context.kind} context kind cannot resolve ${profile.kind} attack.`,
    );
  }
  return context;
}
