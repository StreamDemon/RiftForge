import combatExchangeRaw from "../content/combat/combat-exchange.json" with { type: "json" };
import {
  combatContextSchema,
  combatExchangeRulesSchema,
  combatResponseInputSchema,
  type AttackKind,
  type CombatContext,
  type CombatResponseKind,
} from "../schema/combat-exchange.ts";
import type { WeaponCategory } from "../schema/items.ts";
import type { DefenseKind } from "../schema/strike-resolution.ts";
import type { CharacterSheet, SheetEquipmentEntry } from "./character.ts";
import { applyBodyDamage, type VitalsPool } from "./combat.ts";
import { parseDice } from "./dice.ts";
import { damageArmor } from "./items.ts";
import type { D20Roll, DamageRoll } from "./rolls.ts";
import { resolveStrike } from "./strike-resolution.ts";

export const combatExchangeRules = combatExchangeRulesSchema.parse(combatExchangeRaw);

const attributeOrder = ["IQ", "ME", "MA", "PS", "PP", "PE", "PB", "Spd"] as const;
const orderedAttributes = (sheet: CharacterSheet) =>
  attributeOrder.map((code) => sheet.attributes[code]);

function orderedCombatExchangeRules(rules: typeof combatExchangeRules) {
  return [
    rules.book,
    [
      rules.pages.armorAndVitals,
      rules.pages.megaDamageIntro,
      rules.pages.sdcCombat,
      rules.pages.defense,
      rules.pages.damage,
      rules.pages.automaticDodge,
      rules.pages.megaDamageCombat,
      rules.pages.modernWeapons,
      rules.pages.rangedDodging,
    ],
    [
      rules.rules.sdcPerMd,
      rules.rules.minimumSdcToDamageMdc,
      rules.rules.depletedMdcArmorBypassStrike,
      rules.rules.finalMdcAbsorbsDestroyingBlast,
    ],
    [rules.minimumStrikeTotal.melee, rules.minimumStrikeTotal.ranged],
    [
      rules.rangedDodgeModifier.pointBlank,
      rules.rangedDodgeModifier.close,
      rules.rangedDodgeModifier.normal,
    ],
  ];
}

function orderedSelectedItem(sheet: CharacterSheet, weaponIndex: number) {
  const entry = sheet.equipment[weaponIndex];
  if (entry === undefined) return null;
  const instance = [entry.worn === true, entry.rolledMdc ?? null];
  return entry.item.kind === "weapon"
    ? [
        "weapon",
        entry.item.id,
        entry.item.category,
        entry.item.damage.formula,
        entry.item.damage.type,
        entry.item.page,
        instance,
      ]
    : ["nonWeapon", entry.item.id, entry.item.kind, entry.item.page, instance];
}

function orderedAttackProfile(profile: AttackProfile) {
  if (!profile.supported) {
    return [
      "refused",
      profile.reason,
      profile.weapon === undefined
        ? null
        : [
            profile.weapon.index,
            profile.weapon.itemId,
            profile.weapon.name,
            profile.weapon.worn === true,
            profile.weapon.rolledMdc ?? null,
          ],
    ];
  }
  return [
    "supported",
    profile.kind,
    profile.minimumStrikeTotal,
    profile.strikeBonus,
    profile.strikeBonusSources.map((source) => [source.source, source.label, source.value]),
    profile.proficiencyBonus,
    profile.damageFormula,
    profile.damageBonus,
    profile.criticalOn,
    profile.damageType,
    [
      profile.weapon.index,
      profile.weapon.itemId,
      profile.weapon.name,
      profile.weapon.category,
      profile.weapon.worn === true,
      profile.weapon.rolledMdc ?? null,
    ],
  ];
}

export function attackerCombatStateToken(
  sheet: CharacterSheet,
  weaponIndex: number,
  rules: typeof combatExchangeRules = combatExchangeRules,
): string {
  const attack = deriveAttackProfile(sheet, weaponIndex);
  return JSON.stringify([
    "attacker-v2",
    sheet.level,
    orderedAttributes(sheet),
    [
      sheet.combat.handToHandType,
      sheet.combat.strike,
      sheet.combat.damageBonus,
      sheet.combat.strikeGuns,
      sheet.combat.criticalStrikeOn,
    ],
    orderedCombatExchangeRules(rules),
    weaponIndex,
    orderedSelectedItem(sheet, weaponIndex),
    orderedAttackProfile(attack),
  ]);
}

export function defenderCombatStateToken(sheet: CharacterSheet): string {
  return JSON.stringify([
    "defender-v2",
    sheet.level,
    orderedAttributes(sheet),
    [
      sheet.combat.handToHandType,
      sheet.combat.hasHandToHandTraining,
      sheet.combat.hasAutoDodge,
      sheet.combat.parry,
      sheet.combat.dodge,
      sheet.combat.autoDodge,
      sheet.combat.rangedDodge,
      sheet.combat.rangedAutoDodge,
    ],
    [
      sheet.vitals.sdc.rolled ?? null,
      sheet.vitals.sdc.current ?? null,
      sheet.vitals.hitPoints.rolled ?? null,
      sheet.vitals.hitPoints.current ?? null,
      sheet.vitals.comaDeathFloor,
      sheet.vitals.lifeState,
    ],
    sheet.armor === undefined
      ? null
      : [
          sheet.armor.item.id,
          sheet.armor.item.mdc === undefined ? "sdc" : "mdc",
          sheet.armor.max !== undefined && sheet.armor.current !== undefined,
          sheet.armor.item.ar ?? null,
          sheet.armor.max ?? null,
          sheet.armor.current ?? null,
        ],
  ]);
}

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
      damageType: "sdc" | "md";
      weapon: WeaponInstanceSnapshot & { name: string; category: WeaponCategory };
    };

export interface DefenseOption {
  kind: CombatResponseKind;
  bonus: number;
  actionCost: 0 | 1;
  explanation: string;
}

export interface AuthorizedCombatResponse extends DefenseOption {
  defenseModifier: number;
  defenseModifierReason?: string;
  totalBonus: number;
}

export type ProtectionState =
  | { kind: "none" }
  | {
      kind: "sdcArmor";
      itemId: string;
      name: string;
      ar: number;
      max: number;
      current: number;
    }
  | {
      kind: "mdcArmor";
      itemId: string;
      name: string;
      max?: number;
      current?: number;
    };

export type DeclarationResult =
  | { status: "miss"; reason: "naturalOne" | "belowMinimum" }
  | { status: "pendingDefense" };

export type SdcDamageRoute =
  | {
      kind: "armor";
      armor: { before: number; after: number };
      body: { before: VitalsPool; after: VitalsPool };
    }
  | {
      kind: "body";
      armor?: { before: number; after: number };
      body: { before: VitalsPool; after: VitalsPool };
    }
  | { kind: "unsupportedMdcProtection" };

export type DamageAmount = { type: "sdc" | "md"; value: number };

export type ProtectionDamageSnapshot = {
  kind: "sdcArmor" | "mdcArmor";
  itemId: string;
  name: string;
  before: number;
  after: number;
};

export type BodyDamageSnapshot = { before: VitalsPool; after: VitalsPool };

export type TieredDamageRoute =
  | {
      routingVersion: 2;
      kind: "stopped";
      reason: "intactMdcImpervious" | "depletedMdcShell";
      nativeDamage: DamageAmount;
      armor: ProtectionDamageSnapshot;
      body: BodyDamageSnapshot;
    }
  | {
      routingVersion: 2;
      kind: "armor";
      nativeDamage: DamageAmount;
      convertedDamage?: DamageAmount;
      armor: ProtectionDamageSnapshot;
      body: BodyDamageSnapshot;
      finalBlastAbsorbed: boolean;
    }
  | {
      routingVersion: 2;
      kind: "body";
      nativeDamage: DamageAmount;
      convertedDamage?: DamageAmount;
      armor?: ProtectionDamageSnapshot;
      body: BodyDamageSnapshot;
      lifeState: { before: "alive" | "coma"; after: "alive" | "coma" };
    }
  | {
      routingVersion: 2;
      kind: "fatal";
      nativeDamage: DamageAmount;
      convertedDamage?: DamageAmount;
      armor?: ProtectionDamageSnapshot;
      body: BodyDamageSnapshot;
      lifeState: { before: "alive" | "coma"; after: "dead" };
    };

export type CombatExchangeResolution =
  | {
      outcome: "miss";
      reason: "naturalOne" | "belowMinimum";
      critical: false;
      damageMultiplier: 1;
    }
  | {
      outcome: "defended";
      reason: "parried" | "dodged";
      response: AuthorizedCombatResponse;
      defenseRoll: D20Roll;
      critical: false;
      damageMultiplier: 1;
    }
  | {
      outcome: "hit";
      reason: "unopposed" | "strikeWon";
      response: AuthorizedCombatResponse;
      defenseRoll?: D20Roll;
      critical: boolean;
      damageMultiplier: 1 | 2;
      damageRoll: DamageRoll;
      totalDamage: number;
      route: TieredDamageRoute;
    };

export interface ResolveCombatExchangeInput {
  attack: Extract<AttackProfile, { supported: true }>;
  context: CombatContext;
  strikeRoll: D20Roll;
  response: AuthorizedCombatResponse;
  defenseRoll?: D20Roll;
  damageRoll?: DamageRoll;
  protection: ProtectionState;
  body: VitalsPool;
  comaDeathFloor: number;
}

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
    damageType: entry.item.damage.type,
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

export function deriveDefenseOptions(
  defender: CharacterSheet,
  attack: Extract<AttackProfile, { supported: true }>,
  context: CombatContext,
): DefenseOption[] {
  const options: DefenseOption[] = [];
  if (attack.kind === "melee") {
    if (context.kind !== "melee") {
      throw new Error("invalidContext: melee attack requires melee context.");
    }
    if (context.defenderAware && context.parryMode !== "unavailable") {
      options.push({
        kind: "parry",
        bonus: context.parryMode === "bareHanded" ? 0 : defender.combat.parry,
        actionCost: defender.combat.hasHandToHandTraining ? 0 : 1,
        explanation:
          context.parryMode === "bareHanded"
            ? "Bare-handed weapon parry; no ordinary parry bonus."
            : "Parry the melee weapon.",
      });
    }
    if (context.defenderAware) {
      options.push({
        kind: "dodge",
        bonus: defender.combat.dodge,
        actionCost: 1,
        explanation: "Dodge; costs one action for table tracking.",
      });
    }
    if (defender.combat.hasAutoDodge) {
      options.push({
        kind: "autoDodge",
        bonus: defender.combat.autoDodge,
        actionCost: 0,
        explanation: "Automatic dodge; no action cost.",
      });
    }
  } else {
    if (context.kind !== "ranged") {
      throw new Error("invalidContext: ranged attack requires ranged context.");
    }
    if (context.defenderAware) {
      const rangeModifier = combatExchangeRules.rangedDodgeModifier[context.rangeBand];
      options.push({
        kind: "dodge",
        bonus: defender.combat.rangedDodge + rangeModifier,
        actionCost: 1,
        explanation: `Ranged dodge (${rangeModifier} range-band modifier).`,
      });
      if (defender.combat.hasAutoDodge) {
        options.push({
          kind: "autoDodge",
          bonus: defender.combat.rangedAutoDodge + rangeModifier,
          actionCost: 0,
          explanation: `Automatic ranged dodge (${rangeModifier} range-band modifier).`,
        });
      }
    }
  }
  options.push({ kind: "none", bonus: 0, actionCost: 0, explanation: "Take the hit." });
  return options;
}

export function authorizeCombatResponse(
  options: readonly DefenseOption[],
  input: unknown,
): AuthorizedCombatResponse {
  const response = combatResponseInputSchema.parse(input);
  const option = options.find((candidate) => candidate.kind === response.kind);
  if (option === undefined) {
    throw new Error(`illegalDefense: ${response.kind} is not authorized.`);
  }
  const defenseModifier = response.defenseModifier ?? 0;
  return {
    ...option,
    defenseModifier,
    ...(response.defenseModifierReason === undefined
      ? {}
      : { defenseModifierReason: response.defenseModifierReason }),
    totalBonus: option.bonus + defenseModifier,
  };
}

export function deriveProtection(sheet: CharacterSheet): ProtectionState {
  const armor = sheet.armor;
  if (armor === undefined) return { kind: "none" };
  if (armor.item.mdc !== undefined) {
    return {
      kind: "mdcArmor",
      itemId: armor.item.id,
      name: armor.item.name,
      ...(armor.max === undefined ? {} : { max: armor.max }),
      ...(armor.current === undefined ? {} : { current: armor.current }),
    };
  }
  const max = armor.item.sdc!;
  const current = armor.current ?? max;
  return current === 0
    ? { kind: "none" }
    : {
        kind: "sdcArmor",
        itemId: armor.item.id,
        name: armor.item.name,
        ar: armor.item.ar!,
        max,
        current,
      };
}

export function evaluateDeclaration(
  strike: D20Roll,
  minimumStrikeTotal: number,
): DeclarationResult {
  const base = resolveStrike({ strike, allowedDefenses: [], damageType: "sdc" });
  if (base.outcome === "miss") {
    return { status: "miss", reason: base.reason as "naturalOne" | "belowMinimum" };
  }
  return strike.total < minimumStrikeTotal
    ? { status: "miss", reason: "belowMinimum" }
    : { status: "pendingDefense" };
}

const sdcToMd = (value: number): DamageAmount => ({
  type: "md",
  value: Math.floor(value / combatExchangeRules.rules.sdcPerMd),
});

const mdToSdc = (value: number): DamageAmount => ({
  type: "sdc",
  value: value * combatExchangeRules.rules.sdcPerMd,
});

function protectionSnapshot(
  protection: Extract<ProtectionState, { kind: "sdcArmor" | "mdcArmor" }>,
  before: number,
  after: number,
): ProtectionDamageSnapshot {
  return {
    kind: protection.kind,
    itemId: protection.itemId,
    name: protection.name,
    before,
    after,
  };
}

function routeBodyDamage(input: {
  nativeDamage: DamageAmount;
  appliedDamage: DamageAmount;
  armor?: ProtectionDamageSnapshot;
  body: VitalsPool;
  comaDeathFloor: number;
}): Extract<TieredDamageRoute, { kind: "body" | "fatal" }> {
  const before = { ...input.body };
  const result = applyBodyDamage(input.body, input.appliedDamage.value, input.comaDeathFloor);
  const beforeLifeState = before.hitPoints <= 0 ? "coma" : "alive";
  const common = {
    routingVersion: 2 as const,
    nativeDamage: input.nativeDamage,
    ...(input.nativeDamage.type === input.appliedDamage.type
      ? {}
      : { convertedDamage: input.appliedDamage }),
    ...(input.armor === undefined ? {} : { armor: input.armor }),
    body: { before, after: result.after },
  };
  return result.lifeState === "dead"
    ? { ...common, kind: "fatal", lifeState: { before: beforeLifeState, after: "dead" } }
    : {
        ...common,
        kind: "body",
        lifeState: { before: beforeLifeState, after: result.lifeState },
      };
}

export function routeCombatHit(input: {
  strikeTotal: number;
  damage: DamageAmount;
  protection: ProtectionState;
  body: VitalsPool;
  comaDeathFloor: number;
}): TieredDamageRoute {
  const nativeDamage = input.damage;
  const before = { ...input.body };

  if (input.protection.kind === "sdcArmor") {
    const appliedDamage = nativeDamage.type === "md" ? mdToSdc(nativeDamage.value) : nativeDamage;
    const armor = protectionSnapshot(
      input.protection,
      input.protection.current,
      input.protection.current,
    );
    if (input.protection.current > 0 && input.strikeTotal <= input.protection.ar) {
      const after = damageArmor(input.protection.current, appliedDamage.value);
      return {
        routingVersion: 2,
        kind: "armor",
        nativeDamage,
        ...(nativeDamage.type === "md" ? { convertedDamage: appliedDamage } : {}),
        armor: { ...armor, after },
        body: { before, after: { ...before } },
        finalBlastAbsorbed: after === 0,
      };
    }
    return routeBodyDamage({
      nativeDamage,
      appliedDamage,
      armor,
      body: input.body,
      comaDeathFloor: input.comaDeathFloor,
    });
  }

  if (input.protection.kind === "mdcArmor") {
    if (input.protection.current === undefined) {
      throw new Error("armorNotReady: M.D.C. protection requires a current capacity.");
    }
    if (input.protection.current > 0) {
      const armor = protectionSnapshot(
        input.protection,
        input.protection.current,
        input.protection.current,
      );
      if (
        nativeDamage.type === "sdc" &&
        nativeDamage.value < combatExchangeRules.rules.minimumSdcToDamageMdc
      ) {
        return {
          routingVersion: 2,
          kind: "stopped",
          reason: "intactMdcImpervious",
          nativeDamage,
          armor,
          body: { before, after: { ...before } },
        };
      }
      const appliedDamage =
        nativeDamage.type === "sdc" ? sdcToMd(nativeDamage.value) : nativeDamage;
      const after = damageArmor(input.protection.current, appliedDamage.value);
      return {
        routingVersion: 2,
        kind: "armor",
        nativeDamage,
        ...(nativeDamage.type === "sdc" ? { convertedDamage: appliedDamage } : {}),
        armor: { ...armor, after },
        body: { before, after: { ...before } },
        finalBlastAbsorbed: after === 0,
      };
    }
    const armor = protectionSnapshot(input.protection, 0, 0);
    if (
      nativeDamage.type === "sdc" &&
      input.strikeTotal < combatExchangeRules.rules.depletedMdcArmorBypassStrike
    ) {
      return {
        routingVersion: 2,
        kind: "stopped",
        reason: "depletedMdcShell",
        nativeDamage,
        armor,
        body: { before, after: { ...before } },
      };
    }
    const appliedDamage = nativeDamage.type === "md" ? mdToSdc(nativeDamage.value) : nativeDamage;
    return routeBodyDamage({
      nativeDamage,
      appliedDamage,
      armor,
      body: input.body,
      comaDeathFloor: input.comaDeathFloor,
    });
  }

  const appliedDamage = nativeDamage.type === "md" ? mdToSdc(nativeDamage.value) : nativeDamage;
  return routeBodyDamage({
    nativeDamage,
    appliedDamage,
    body: input.body,
    comaDeathFloor: input.comaDeathFloor,
  });
}

function assertDamageRoll(
  attack: Extract<AttackProfile, { supported: true }>,
  roll: DamageRoll,
): void {
  const formula = parseDice(attack.damageFormula);
  if (roll.bonus !== attack.damageBonus) {
    throw new Error(`Damage bonus must be ${attack.damageBonus}.`);
  }
  if (roll.dice.length !== formula.count) {
    throw new Error(`Damage roll requires ${formula.count} dice.`);
  }
  if (roll.dice.some((die) => !Number.isInteger(die) || die < 1 || die > formula.sides)) {
    throw new Error(`Damage dice must be integers from 1 to ${formula.sides}.`);
  }
  const expected =
    roll.dice.reduce((sum, die) => sum + die, 0) * formula.multiplier +
    formula.modifier +
    roll.bonus;
  if (roll.total !== expected) {
    throw new Error(`Damage total must be ${expected}.`);
  }
}

export function resolveCombatExchange(input: ResolveCombatExchangeInput): CombatExchangeResolution {
  validateCombatContext(input.attack, input.context);
  const expectedStrikeBonus = input.attack.strikeBonus + (input.context.strikeModifier ?? 0);
  if (input.strikeRoll.bonus !== expectedStrikeBonus) {
    throw new Error(`Strike bonus must be ${expectedStrikeBonus}.`);
  }
  const declaration = evaluateDeclaration(input.strikeRoll, input.attack.minimumStrikeTotal);
  if (declaration.status === "miss") {
    if (input.defenseRoll !== undefined || input.damageRoll !== undefined) {
      throw new Error("A missed declaration cannot contain defense or damage rolls.");
    }
    return {
      outcome: "miss",
      reason: declaration.reason,
      critical: false,
      damageMultiplier: 1,
    };
  }

  const takesHit = input.response.kind === "none";
  if (takesHit && input.defenseRoll !== undefined) {
    throw new Error("Take-the-hit cannot contain a defense roll.");
  }
  if (!takesHit && input.defenseRoll === undefined) {
    throw new Error(`${input.response.kind} requires a completed defense roll.`);
  }
  if (input.defenseRoll !== undefined && input.defenseRoll.bonus !== input.response.totalBonus) {
    throw new Error(`Defense bonus must be ${input.response.totalBonus}.`);
  }

  const strike = resolveStrike({
    strike: input.strikeRoll,
    ...(takesHit
      ? {}
      : {
          defense: {
            kind: input.response.kind as DefenseKind,
            roll: input.defenseRoll!,
          },
        }),
    allowedDefenses: takesHit ? [] : [input.response.kind as DefenseKind],
    damageType: input.attack.damageType,
    criticalOn: input.attack.criticalOn,
  });
  if (strike.outcome !== "hit") {
    if (input.damageRoll !== undefined) {
      throw new Error("A defended attack cannot contain damage.");
    }
    return {
      outcome: "defended",
      reason: strike.reason as "parried" | "dodged",
      response: input.response,
      defenseRoll: input.defenseRoll!,
      critical: false,
      damageMultiplier: 1,
    };
  }
  if (input.damageRoll === undefined) {
    throw new Error("A hit requires a completed damage roll.");
  }
  assertDamageRoll(input.attack, input.damageRoll);
  const totalDamage = input.damageRoll.total * strike.damageMultiplier;
  const route = routeCombatHit({
    strikeTotal: input.strikeRoll.total,
    damage: { type: input.attack.damageType, value: totalDamage },
    protection: input.protection,
    body: input.body,
    comaDeathFloor: input.comaDeathFloor,
  });
  return {
    outcome: "hit",
    reason: strike.reason as "unopposed" | "strikeWon",
    response: input.response,
    ...(input.defenseRoll === undefined ? {} : { defenseRoll: input.defenseRoll }),
    critical: strike.critical,
    damageMultiplier: strike.damageMultiplier,
    damageRoll: input.damageRoll,
    totalDamage,
    route,
  };
}
