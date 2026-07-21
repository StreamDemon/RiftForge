import { api } from "@riftforge/backend/api";
import { deriveAttackProfile, type CharacterSheet, type TieredDamageRoute } from "@riftforge/rules";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";

type CombatTargets = FunctionReturnType<typeof api.combat.targets>;
export type CombatTargetSummary = CombatTargets[number];
type CombatRecent = FunctionReturnType<typeof api.combat.recent>;
export type ExchangeSummary = CombatRecent[number];
type ResolvedExchange = Extract<ExchangeSummary, { status: "resolved" }>;
type HitResolution = Extract<ResolvedExchange["resolution"], { outcome: "hit" }>;
type ExchangeRoute = HitResolution["route"];
type ProtectionSnapshot = NonNullable<TieredDamageRoute["armor"]>;

export interface AsyncOwner {
  routeId: string;
  routeEpoch: number;
  exchangeId?: string;
}

export function ownsAsyncResult(owner: AsyncOwner, current: AsyncOwner): boolean {
  return (
    owner.routeId === current.routeId &&
    owner.routeEpoch === current.routeEpoch &&
    owner.exchangeId === current.exchangeId
  );
}

export function combatWeaponChoices(sheet: CharacterSheet): Array<{
  index: number;
  itemId: string;
  label: string;
  supported: boolean;
  disabledReason?: string;
}> {
  return sheet.equipment.flatMap((entry, index) => {
    if (entry.item.kind !== "weapon") return [];
    const profile = deriveAttackProfile(sheet, index);
    return [
      {
        index,
        itemId: entry.item.id,
        label: `${entry.item.name} — ${entry.item.damage.formula} ${
          entry.item.damage.type === "md" ? "M.D." : "S.D.C."
        }`,
        supported: profile.supported,
        ...(profile.supported
          ? {}
          : {
              disabledReason: "This weapon mode is not supported.",
            }),
      },
    ];
  });
}

export function combatTargetDisabledReason(target: CombatTargetSummary): string | undefined {
  switch (target.disabledReason) {
    case "defenderNotReady":
      return "Roll this target's H.P. and S.D.C. first.";
    case "armorNotReady":
      return "Roll this target's worn armor M.D.C. first.";
    case "combatantDead":
      return "Life signs terminated; this target cannot enter combat.";
    default:
      return undefined;
  }
}

export function exchangeTone(exchange: ExchangeSummary): "dim" | "warn" | "bad" | "good" {
  if (exchange.status === "pendingDefense" || exchange.status === "stale") return "warn";
  if (exchange.status === "cancelled") return "dim";
  if (exchange.resolution.outcome === "defended") return "good";
  if (exchange.resolution.outcome === "hit") {
    const route = exchange.resolution.route;
    return route.kind === "armor" || (isTieredRoute(route) && route.kind === "stopped")
      ? "warn"
      : "bad";
  }
  return "dim";
}

const signed = (value: number) => (value >= 0 ? `+${value}` : String(value));

function isTieredRoute(route: ExchangeRoute): route is TieredDamageRoute {
  return "routingVersion" in route && route.routingVersion === 2;
}

function damageUnit(type: TieredDamageRoute["nativeDamage"]["type"]): "S.D.C." | "M.D." {
  return type === "md" ? "M.D." : "S.D.C.";
}

function formatDamageAmount(amount: TieredDamageRoute["nativeDamage"]): string {
  return `${amount.value} ${damageUnit(amount.type)}`;
}

function armorUnit(armor: ProtectionSnapshot): "S.D.C." | "M.D.C." {
  return armor.kind === "mdcArmor" ? "M.D.C." : "S.D.C.";
}

function formatArmorRoute(armor: ProtectionSnapshot): string {
  const unit = armorUnit(armor);
  return `ARMOR ${armor.before} ${unit} -> ${armor.after} ${unit}`;
}

function formatDamageEvidence(route: TieredDamageRoute): string {
  const native = formatDamageAmount(route.nativeDamage);
  return route.kind !== "stopped" && route.convertedDamage !== undefined
    ? `${native} -> ${formatDamageAmount(route.convertedDamage)}`
    : native;
}

function formatBodyRoute(route: Extract<TieredDamageRoute, { kind: "body" | "fatal" }>): string {
  const protection =
    route.armor === undefined
      ? "UNPROTECTED BODY"
      : route.armor.kind === "mdcArmor" && route.armor.before === 0
        ? `DEPLETED M.D.C. SHELL BYPASSED :: ${formatArmorRoute(route.armor)}`
        : `PROTECTION BYPASSED :: ${formatArmorRoute(route.armor)}`;
  const body = `BODY S.D.C. ${route.body.before.sdc} -> ${route.body.after.sdc} / H.P. ${route.body.before.hitPoints} -> ${route.body.after.hitPoints}`;
  const life = `LIFE ${route.lifeState.before.toUpperCase()} -> ${route.lifeState.after.toUpperCase()}`;
  const fatal = route.kind === "fatal" ? " :: FATAL — LIFE SIGNS TERMINATED" : "";
  return `${formatDamageEvidence(route)} :: ${protection} :: ${body} :: ${life}${fatal}`;
}

function formatTieredRoute(route: TieredDamageRoute): string {
  switch (route.kind) {
    case "stopped": {
      const reason =
        route.reason === "intactMdcImpervious"
          ? "M.D.C. ARMOR IMPERVIOUS — NO EFFECT"
          : "DEPLETED M.D.C. SHELL STOPPED STRIKE";
      return `${formatDamageAmount(route.nativeDamage)} -> ${reason} :: ${formatArmorRoute(route.armor)}`;
    }
    case "armor":
      return `${formatDamageEvidence(route)} :: ${formatArmorRoute(route.armor)}${
        route.finalBlastAbsorbed ? " :: FINAL BLAST ABSORBED" : ""
      }`;
    case "body":
    case "fatal":
      return formatBodyRoute(route);
  }
}

export function exchangeResultLabel(exchange: ExchangeSummary): string {
  if (exchange.status === "pendingDefense") return "AWAITING DEFENSE";
  if (exchange.status === "cancelled") return "CANCELLED";
  if (exchange.status === "stale") return "STALE";
  if (exchange.resolution.outcome === "miss") return "MISS";
  if (exchange.resolution.outcome === "defended") return "DEFENDED";
  return exchange.resolution.route.kind.toUpperCase();
}

export function formatExchangeSummary(exchange: ExchangeSummary): string {
  const strike = `d20[${exchange.strikeRoll.die}]${signed(exchange.strikeRoll.bonus)} = ${exchange.strikeRoll.total}`;
  const lead = `${exchange.attackerName} → ${exchange.defenderName} :: ${exchange.weapon.name} :: ${strike}`;
  if (exchange.status === "pendingDefense") return `${lead} :: AWAITING DEFENSE`;
  if (exchange.status === "cancelled") return `${lead} :: CANCELLED`;
  if (exchange.status === "stale") return `${lead} :: STALE — COMBAT STATE CHANGED`;
  const result = exchange.resolution;
  if (result.outcome === "miss") return `${lead} :: MISS (${result.reason})`;
  if (result.outcome === "defended") {
    return `${lead} :: ${result.response.kind.toUpperCase()} d20[${result.defenseRoll.die}]${signed(result.defenseRoll.bonus)} = ${result.defenseRoll.total} :: DEFENDED`;
  }
  const defense =
    result.defenseRoll === undefined
      ? ""
      : ` :: ${result.response.kind.toUpperCase()} d20[${result.defenseRoll.die}]${signed(result.defenseRoll.bonus)} = ${result.defenseRoll.total}`;
  const multiplier = result.critical
    ? `CRITICAL ×${result.damageMultiplier}`
    : `×${result.damageMultiplier}`;
  if (isTieredRoute(result.route)) {
    const damage = `${exchange.attack.damageFormula} [${result.damageRoll.dice.join("][")}]${signed(result.damageRoll.bonus)} = ${result.damageRoll.total} ${damageUnit(result.route.nativeDamage.type)} RAW`;
    return `${lead}${defense} :: ${damage} :: ${multiplier} :: ${formatTieredRoute(result.route)}`;
  }
  const damage = `${exchange.attack.damageFormula} [${result.damageRoll.dice.join("][")}]${signed(result.damageRoll.bonus)} = ${result.damageRoll.total} RAW`;
  const remaining =
    result.route.kind === "armor"
      ? `ARMOR ${result.route.armor.after}`
      : `BODY S.D.C. ${result.route.body.after.sdc} / H.P. ${result.route.body.after.hitPoints}`;
  return `${lead}${defense} :: ${damage} :: ${multiplier} :: ${result.totalDamage} S.D.C. FINAL → ${remaining}`;
}

export function combatErrorMessage(error: unknown): string {
  if (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    "message" in error.data &&
    typeof error.data.message === "string"
  ) {
    return error.data.message;
  }
  return error instanceof Error ? error.message : String(error);
}
