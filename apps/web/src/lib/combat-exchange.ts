import { api } from "@riftforge/backend/api";
import { deriveAttackProfile, type CharacterSheet } from "@riftforge/rules";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";

type CombatTargets = FunctionReturnType<typeof api.combat.targets>;
export type CombatTargetSummary = CombatTargets[number];
type CombatRecent = FunctionReturnType<typeof api.combat.recent>;
export type ExchangeSummary = CombatRecent[number];

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
              disabledReason:
                profile.reason === "unsupportedMdWeapon"
                  ? "Full M.D.C. combat is follow-up work."
                  : "This weapon mode is not supported.",
            }),
      },
    ];
  });
}

export function combatTargetDisabledReason(target: CombatTargetSummary): string | undefined {
  if (!target.ready) return "Roll this target's H.P. and S.D.C. first.";
  if (target.protection === "mdcArmor") return "Full M.D.C. combat is follow-up work.";
  return undefined;
}

export function exchangeTone(exchange: ExchangeSummary): "dim" | "warn" | "bad" | "good" {
  if (exchange.status === "pendingDefense" || exchange.status === "stale") return "warn";
  if (exchange.status === "cancelled") return "dim";
  if (exchange.resolution.outcome === "defended") return "good";
  if (exchange.resolution.outcome === "hit") return "bad";
  return "dim";
}

const signed = (value: number) => (value >= 0 ? `+${value}` : String(value));

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
  const damage = `[${result.damageRoll.dice.join("][")}]${signed(result.damageRoll.bonus)} = ${result.totalDamage} S.D.C.`;
  const critical = result.critical ? " :: CRITICAL" : "";
  const remaining =
    result.route.kind === "armor"
      ? `ARMOR ${result.route.armor.after}`
      : `BODY S.D.C. ${result.route.body.after.sdc} / H.P. ${result.route.body.after.hitPoints}`;
  return `${lead}${critical} :: ${damage} → ${remaining}`;
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
