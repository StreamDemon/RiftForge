import { api } from "@riftforge/backend/api";
import type { Id } from "@riftforge/backend/dataModel";
import {
  deriveAttackProfile,
  type CharacterSheet,
  type CombatResponseKind,
  type ParryMode,
  type RangeBand,
} from "@riftforge/rules";
import type { FunctionReturnType } from "convex/server";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  Show,
  type Accessor,
  type JSX,
} from "solid-js";
import { convex } from "../lib/client.ts";
import {
  combatErrorMessage,
  combatTargetDisabledReason,
  combatWeaponChoices,
  exchangeTone,
  formatExchangeSummary,
  ownsAsyncResult,
} from "../lib/combat-exchange.ts";
import { createMutation, createQuery } from "../lib/convex.ts";
import type { TelemetryTone } from "../lib/telemetry.ts";
import {
  Alert,
  Button,
  MonoLabel,
  Panel,
  SectionTitle,
  SelectInput,
  TextInput,
  ToggleChip,
} from "./ui.tsx";

type IncomingExchange = Extract<
  FunctionReturnType<typeof api.combat.incoming>[number],
  { status: "pendingDefense" }
>;
type OutgoingExchange = FunctionReturnType<typeof api.combat.outgoing>[number];

const toneClass = {
  dim: "border-dead text-muted",
  warn: "border-amber text-amber",
  bad: "border-blood text-blood-text",
  good: "border-ok text-ok",
} as const;

const signed = (value: number) => (value >= 0 ? `+${value}` : String(value));

function parseModifier(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return 0;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= -100 && value <= 100 ? value : undefined;
}

function strikeSummary(exchange: {
  strikeRoll: { die: number; bonus: number; total: number };
}): string {
  return `d20[${exchange.strikeRoll.die}]${signed(exchange.strikeRoll.bonus)} = ${exchange.strikeRoll.total}`;
}

function IncomingExchangeRow(props: {
  exchange: IncomingExchange;
  characterId: Id<"characters">;
  routeEpoch: Accessor<number>;
  onTelemetry: (text: string, tone?: TelemetryTone) => void;
}) {
  const respondToAttack = createMutation(convex, api.combat.respondToAttack);
  const [defenseModifier, setDefenseModifier] = createSignal("");
  const [defenseReason, setDefenseReason] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const defenseModifierValue = createMemo(() => parseModifier(defenseModifier()));
  const responseReady = createMemo(() => {
    const modifier = defenseModifierValue();
    return modifier !== undefined && (modifier === 0 || defenseReason().trim() !== "");
  });

  const submitResponse = async (kind: CombatResponseKind) => {
    const modifier = defenseModifierValue();
    if (modifier === undefined || (modifier !== 0 && defenseReason().trim() === "")) return;
    const owner = {
      routeId: props.characterId,
      routeEpoch: props.routeEpoch(),
      exchangeId: props.exchange._id,
    };
    setBusy(true);
    setError(undefined);
    try {
      const result = await respondToAttack({
        exchangeId: props.exchange._id,
        response: {
          kind,
          ...(modifier === 0 ? {} : { defenseModifier: modifier }),
          ...(defenseReason().trim() === ""
            ? {}
            : { defenseModifierReason: defenseReason().trim() }),
        },
      });
      const current = {
        routeId: props.characterId,
        routeEpoch: props.routeEpoch(),
        exchangeId: props.exchange._id,
      };
      if (!ownsAsyncResult(owner, current)) return;
      props.onTelemetry(
        `> COMBAT :: ${result.status === "stale" ? "STALE" : "RESPONSE LOCKED"}`,
        result.status === "stale" ? "dim" : "machine",
      );
    } catch (caught) {
      const current = {
        routeId: props.characterId,
        routeEpoch: props.routeEpoch(),
        exchangeId: props.exchange._id,
      };
      if (!ownsAsyncResult(owner, current)) return;
      const message = combatErrorMessage(caught);
      setError(message);
      props.onTelemetry(`> COMBAT :: RESPONSE REFUSED — ${message}`, "bad");
    } finally {
      const current = {
        routeId: props.characterId,
        routeEpoch: props.routeEpoch(),
        exchangeId: props.exchange._id,
      };
      if (ownsAsyncResult(owner, current)) setBusy(false);
    }
  };

  return (
    <li class="space-y-2 border-t border-line pt-2">
      <div class="font-hud text-[12px] font-semibold tracking-[0.06em] text-fg uppercase">
        {props.exchange.attackerName} · {props.exchange.weapon.name}
      </div>
      <div class="font-data text-[11.5px] text-amber">{strikeSummary(props.exchange)}</div>
      <div class="space-y-1 border-l-2 border-dead pl-2 font-mono text-[10.5px] text-muted">
        <span class="block text-dead">STORED CONTEXT</span>
        <span class="block">
          {props.exchange.context.kind.toUpperCase()} ·{" "}
          {props.exchange.context.defenderAware ? "AWARE" : "UNAWARE"}
        </span>
        <span class="block">
          {props.exchange.context.kind === "melee"
            ? `PARRY ${props.exchange.context.parryMode.toUpperCase()}`
            : `RANGE ${props.exchange.context.rangeBand.toUpperCase()}`}
          {props.exchange.context.strikeModifier === undefined
            ? ""
            : ` · STRIKE ${signed(props.exchange.context.strikeModifier)} — ${props.exchange.context.strikeModifierReason}`}
        </span>
      </div>
      <div class="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
        <label class="space-y-1">
          <MonoLabel class="block">DEF MOD</MonoLabel>
          <TextInput
            aria-label="Defense modifier"
            inputmode="numeric"
            value={defenseModifier()}
            onInput={(event) => setDefenseModifier(event.currentTarget.value)}
          />
        </label>
        <label class="space-y-1">
          <MonoLabel class="block">REASON</MonoLabel>
          <TextInput
            aria-label="Defense modifier reason"
            class="w-full"
            value={defenseReason()}
            onInput={(event) => setDefenseReason(event.currentTarget.value)}
          />
        </label>
      </div>
      <div class="space-y-1">
        <For each={props.exchange.defenseOptions}>
          {(option) => (
            <Button
              class="w-full px-2 text-left text-[11.5px]"
              disabled={busy() || !responseReady()}
              title={option.explanation}
              onClick={() => void submitResponse(option.kind)}
            >
              {option.kind === "none" ? "> TAKE THE HIT" : `> ${option.kind.toUpperCase()}`} ·
              {option.bonus >= 0 ? "+" : ""}
              {option.bonus} · {option.actionCost} ACTION
            </Button>
          )}
        </For>
      </div>
      <Show when={error()}>{(message) => <Alert tone="danger">{message()}</Alert>}</Show>
    </li>
  );
}

function OutgoingExchangeRow(props: {
  exchange: OutgoingExchange;
  characterId: Id<"characters">;
  routeEpoch: Accessor<number>;
  onTelemetry: (text: string, tone?: TelemetryTone) => void;
}) {
  const cancelAttack = createMutation(convex, api.combat.cancelAttack);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();

  const cancel = async () => {
    const owner = {
      routeId: props.characterId,
      routeEpoch: props.routeEpoch(),
      exchangeId: props.exchange._id,
    };
    setBusy(true);
    setError(undefined);
    try {
      await cancelAttack({ exchangeId: props.exchange._id });
      const current = {
        routeId: props.characterId,
        routeEpoch: props.routeEpoch(),
        exchangeId: props.exchange._id,
      };
      if (!ownsAsyncResult(owner, current)) return;
      props.onTelemetry("> COMBAT :: ATTACK CANCELLED", "dim");
    } catch (caught) {
      const current = {
        routeId: props.characterId,
        routeEpoch: props.routeEpoch(),
        exchangeId: props.exchange._id,
      };
      if (!ownsAsyncResult(owner, current)) return;
      const message = combatErrorMessage(caught);
      setError(message);
      props.onTelemetry(`> COMBAT :: CANCELLATION REFUSED — ${message}`, "bad");
    } finally {
      const current = {
        routeId: props.characterId,
        routeEpoch: props.routeEpoch(),
        exchangeId: props.exchange._id,
      };
      if (ownsAsyncResult(owner, current)) setBusy(false);
    }
  };

  return (
    <li class="space-y-2 border-t border-line pt-2">
      <div class="font-hud text-[12px] font-semibold tracking-[0.06em] text-fg uppercase">
        {props.exchange.defenderName} · {props.exchange.weapon.name}
      </div>
      <div class="font-data text-[11.5px] text-amber">{strikeSummary(props.exchange)}</div>
      <Button
        class="w-full px-2 text-left text-[11.5px]"
        disabled={busy()}
        onClick={() => void cancel()}
      >
        {busy() ? "> CANCELLING…" : "> CANCEL"}
      </Button>
      <Show when={error()}>{(message) => <Alert tone="danger">{message()}</Alert>}</Show>
    </li>
  );
}

export interface CombatExchangePanelProps {
  characterId: Id<"characters">;
  sheet: CharacterSheet;
  onTelemetry: (text: string, tone?: TelemetryTone) => void;
}

export function CombatExchangePanel(props: CombatExchangePanelProps): JSX.Element {
  const targets = createQuery(convex, api.combat.targets, () => ({
    attackerId: props.characterId,
  }));
  const incoming = createQuery(convex, api.combat.incoming, () => ({
    defenderId: props.characterId,
  }));
  const outgoing = createQuery(convex, api.combat.outgoing, () => ({
    attackerId: props.characterId,
  }));
  const recent = createQuery(convex, api.combat.recent, () => ({
    characterId: props.characterId,
  }));
  const declareAttack = createMutation(convex, api.combat.declareAttack);
  const [targetId, setTargetId] = createSignal("");
  const [weaponIndex, setWeaponIndex] = createSignal("");
  const [aware, setAware] = createSignal(true);
  const [parryMode, setParryMode] = createSignal<ParryMode>("standard");
  const [rangeBand, setRangeBand] = createSignal<RangeBand>("normal");
  const [strikeModifier, setStrikeModifier] = createSignal("");
  const [strikeReason, setStrikeReason] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [notice, setNotice] = createSignal<{ tone: "ok" | "warn"; text: string }>();
  const [historyExpanded, setHistoryExpanded] = createSignal(false);
  const [flashingIds, setFlashingIds] = createSignal<ReadonlySet<string>>(new Set());
  const choices = createMemo(() => combatWeaponChoices(props.sheet));
  const selectedIndex = createMemo(() => {
    const raw = weaponIndex();
    if (raw === "") return undefined;
    const value = Number(raw);
    return Number.isInteger(value) ? value : undefined;
  });
  const selectedAttack = createMemo(() => {
    const index = selectedIndex();
    return index === undefined ? undefined : deriveAttackProfile(props.sheet, index);
  });
  const selectedSupportedAttack = createMemo(() => {
    const attack = selectedAttack();
    return attack?.supported === true ? attack : undefined;
  });
  const modifierValue = createMemo(() => parseModifier(strikeModifier()));
  const canDeclare = createMemo(() => {
    const target = targets.data()?.find((candidate) => candidate.id === targetId());
    const attack = selectedSupportedAttack();
    const modifier = modifierValue();
    return (
      !busy() &&
      target !== undefined &&
      combatTargetDisabledReason(target) === undefined &&
      attack !== undefined &&
      modifier !== undefined &&
      (modifier === 0 || strikeReason().trim() !== "")
    );
  });
  const pendingIncoming = createMemo(
    () =>
      incoming
        .data()
        ?.filter(
          (exchange): exchange is IncomingExchange => exchange.status === "pendingDefense",
        ) ?? [],
  );
  const boundedRecent = createMemo(() => recent.data()?.slice(0, 20) ?? []);
  const visibleRecent = createMemo(() => boundedRecent().slice(0, historyExpanded() ? 20 : 5));

  let routeEpoch = 0;
  let historyInitialized = false;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  const seenResolvedIds = new Set<string>();
  const resetRouteState = () => {
    routeEpoch += 1;
    setTargetId("");
    setWeaponIndex("");
    setAware(true);
    setParryMode("standard");
    setRangeBand("normal");
    setStrikeModifier("");
    setStrikeReason("");
    setBusy(false);
    setError(undefined);
    setNotice(undefined);
    setHistoryExpanded(false);
    setFlashingIds(new Set<string>());
    seenResolvedIds.clear();
    historyInitialized = false;
    if (flashTimer !== undefined) clearTimeout(flashTimer);
  };
  createEffect(on(() => props.characterId, resetRouteState, { defer: true }));
  onCleanup(() => {
    if (flashTimer !== undefined) clearTimeout(flashTimer);
  });

  createEffect(() => {
    const entries = recent.data();
    if (entries === undefined) return;
    const resolvedIds = entries
      .filter((entry) => entry.status === "resolved")
      .map((entry) => String(entry._id));
    if (!historyInitialized) {
      for (const exchangeId of resolvedIds) seenResolvedIds.add(exchangeId);
      historyInitialized = true;
      return;
    }
    const newlyResolved = resolvedIds.filter((exchangeId) => !seenResolvedIds.has(exchangeId));
    for (const exchangeId of newlyResolved) seenResolvedIds.add(exchangeId);
    if (newlyResolved.length === 0) return;
    setFlashingIds(new Set(newlyResolved));
    if (flashTimer !== undefined) clearTimeout(flashTimer);
    const owner = { routeId: props.characterId, routeEpoch };
    flashTimer = setTimeout(() => {
      if (ownsAsyncResult(owner, { routeId: props.characterId, routeEpoch })) {
        setFlashingIds(new Set<string>());
      }
    }, 650);
  });

  const submitDeclaration = async () => {
    const index = selectedIndex();
    const attack = selectedSupportedAttack();
    const modifier = modifierValue();
    const target = targetId() as Id<"characters">;
    const entry = index === undefined ? undefined : props.sheet.equipment[index];
    if (!canDeclare() || index === undefined || !attack || modifier === undefined || !entry) {
      return;
    }
    const owner = { routeId: props.characterId, routeEpoch };
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await declareAttack({
        attackerId: props.characterId,
        defenderId: target,
        weaponIndex: index,
        expect: {
          itemId: entry.item.id,
          ...(entry.worn === true ? { worn: true } : {}),
          ...(entry.rolledMdc === undefined ? {} : { rolledMdc: entry.rolledMdc }),
        },
        context:
          attack.kind === "melee"
            ? {
                kind: "melee",
                defenderAware: aware(),
                parryMode: parryMode(),
                ...(modifier === 0 ? {} : { strikeModifier: modifier }),
                ...(strikeReason().trim() === ""
                  ? {}
                  : { strikeModifierReason: strikeReason().trim() }),
              }
            : {
                kind: "ranged",
                defenderAware: aware(),
                rangeBand: rangeBand(),
                ...(modifier === 0 ? {} : { strikeModifier: modifier }),
                ...(strikeReason().trim() === ""
                  ? {}
                  : { strikeModifierReason: strikeReason().trim() }),
              },
      });
      if (!ownsAsyncResult(owner, { routeId: props.characterId, routeEpoch })) return;
      props.onTelemetry(
        `> COMBAT :: ${result.weapon.name.toUpperCase()} — ${result.status.toUpperCase()}`,
        result.status === "resolved" ? "dim" : "machine",
      );
      setNotice(
        result.status === "resolved"
          ? { tone: "warn", text: `${result.weapon.name.toUpperCase()} — MISS RECORDED` }
          : { tone: "ok", text: `${result.weapon.name.toUpperCase()} — AWAITING DEFENSE` },
      );
      setStrikeModifier("");
      setStrikeReason("");
    } catch (caught) {
      if (!ownsAsyncResult(owner, { routeId: props.characterId, routeEpoch })) return;
      const message = combatErrorMessage(caught);
      setError(message);
      props.onTelemetry(`> COMBAT :: DECLARATION REFUSED — ${message}`, "bad");
    } finally {
      if (ownsAsyncResult(owner, { routeId: props.characterId, routeEpoch })) setBusy(false);
    }
  };

  return (
    <Panel class="space-y-3 p-3">
      <SectionTitle>COMBAT EXCHANGE</SectionTitle>
      <div class="space-y-2 border-t border-line pt-2">
        <label class="block space-y-1">
          <MonoLabel class="block">TARGET</MonoLabel>
          <SelectInput
            class="w-full"
            value={targetId()}
            onChange={(event) => setTargetId(event.currentTarget.value)}
          >
            <option value="">SELECT DOSSIER</option>
            <For each={targets.data()}>
              {(target) => (
                <option
                  value={target.id}
                  disabled={combatTargetDisabledReason(target) !== undefined}
                >
                  {target.name}
                  {combatTargetDisabledReason(target)
                    ? ` — ${combatTargetDisabledReason(target)}`
                    : ""}
                </option>
              )}
            </For>
          </SelectInput>
        </label>
        <label class="block space-y-1">
          <MonoLabel class="block">WEAPON</MonoLabel>
          <SelectInput
            class="w-full"
            value={weaponIndex()}
            onChange={(event) => setWeaponIndex(event.currentTarget.value)}
          >
            <option value="">SELECT WEAPON</option>
            <For each={choices()}>
              {(choice) => (
                <option value={choice.index} disabled={!choice.supported}>
                  {choice.label}
                  {choice.disabledReason ? ` — ${choice.disabledReason}` : ""}
                </option>
              )}
            </For>
          </SelectInput>
        </label>
        <div class="flex items-end gap-2">
          <ToggleChip pressed={aware()} onToggle={() => setAware((value) => !value)}>
            AWARE
          </ToggleChip>
          <Show when={selectedSupportedAttack()?.kind === "melee"}>
            <label class="min-w-0 flex-1 space-y-1">
              <MonoLabel class="block">PARRY MODE</MonoLabel>
              <SelectInput
                class="w-full"
                value={parryMode()}
                onChange={(event) => setParryMode(event.currentTarget.value as ParryMode)}
              >
                <option value="unavailable">UNAVAILABLE</option>
                <option value="standard">STANDARD</option>
                <option value="bareHanded">BARE-HANDED</option>
              </SelectInput>
            </label>
          </Show>
          <Show when={selectedSupportedAttack()?.kind === "ranged"}>
            <label class="min-w-0 flex-1 space-y-1">
              <MonoLabel class="block">RANGE BAND</MonoLabel>
              <SelectInput
                class="w-full"
                value={rangeBand()}
                onChange={(event) => setRangeBand(event.currentTarget.value as RangeBand)}
              >
                <option value="pointBlank">POINT-BLANK</option>
                <option value="close">CLOSE</option>
                <option value="normal">NORMAL</option>
              </SelectInput>
            </label>
          </Show>
        </div>
        <div class="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
          <label class="space-y-1">
            <MonoLabel class="block">MOD</MonoLabel>
            <TextInput
              aria-label="Strike modifier"
              inputmode="numeric"
              value={strikeModifier()}
              onInput={(event) => setStrikeModifier(event.currentTarget.value)}
            />
          </label>
          <label class="space-y-1">
            <MonoLabel class="block">REASON</MonoLabel>
            <TextInput
              aria-label="Strike modifier reason"
              class="w-full"
              value={strikeReason()}
              onInput={(event) => setStrikeReason(event.currentTarget.value)}
            />
          </label>
        </div>
        <Button
          variant="primary"
          class="w-full text-left"
          disabled={!canDeclare()}
          onClick={() => void submitDeclaration()}
        >
          {busy() ? "> TRANSMITTING…" : "> DECLARE ATTACK"}
        </Button>
        <Show when={notice()}>
          {(message) => <Alert tone={message().tone}>{message().text}</Alert>}
        </Show>
        <Show when={error()}>{(message) => <Alert tone="danger">{message()}</Alert>}</Show>
        <Show when={targets.error()}>
          {(queryError) => <Alert tone="danger">TARGET LINK FAILED — {queryError().message}</Alert>}
        </Show>
      </div>

      <section class="border-t border-line pt-2" aria-labelledby="combat-incoming-title">
        <MonoLabel class="block text-dead" id="combat-incoming-title">
          INCOMING
        </MonoLabel>
        <Show
          when={pendingIncoming().length > 0}
          fallback={<p class="mt-1 font-mono text-[11.5px] text-dead">// NO PENDING STRIKES</p>}
        >
          <ol class="mt-2 space-y-2">
            <For each={pendingIncoming()}>
              {(exchange) => (
                <IncomingExchangeRow
                  exchange={exchange}
                  characterId={props.characterId}
                  routeEpoch={() => routeEpoch}
                  onTelemetry={props.onTelemetry}
                />
              )}
            </For>
          </ol>
        </Show>
        <Show when={incoming.error()}>
          {(queryError) => (
            <Alert tone="danger">INCOMING LINK FAILED — {queryError().message}</Alert>
          )}
        </Show>
      </section>

      <section class="border-t border-line pt-2" aria-labelledby="combat-outgoing-title">
        <MonoLabel class="block text-dead" id="combat-outgoing-title">
          OUTGOING
        </MonoLabel>
        <Show
          when={(outgoing.data()?.length ?? 0) > 0}
          fallback={<p class="mt-1 font-mono text-[11.5px] text-dead">// NO OPEN ATTACKS</p>}
        >
          <ol class="mt-2 space-y-2">
            <For each={outgoing.data()}>
              {(exchange) => (
                <OutgoingExchangeRow
                  exchange={exchange}
                  characterId={props.characterId}
                  routeEpoch={() => routeEpoch}
                  onTelemetry={props.onTelemetry}
                />
              )}
            </For>
          </ol>
        </Show>
        <Show when={outgoing.error()}>
          {(queryError) => (
            <Alert tone="danger">OUTGOING LINK FAILED — {queryError().message}</Alert>
          )}
        </Show>
      </section>

      <section class="border-t border-line pt-2" aria-labelledby="combat-recent-title">
        <div class="flex items-baseline gap-2">
          <MonoLabel class="block text-dead" id="combat-recent-title">
            RECENT
          </MonoLabel>
          <Show when={boundedRecent().length > 5}>
            <Button
              variant="ghost"
              class="ml-auto px-0 py-0 text-[11px]"
              aria-expanded={historyExpanded()}
              onClick={() => setHistoryExpanded((value) => !value)}
            >
              {historyExpanded() ? "SHOW 5" : "SHOW 20"}
            </Button>
          </Show>
        </div>
        <Show
          when={visibleRecent().length > 0}
          fallback={<p class="mt-1 font-mono text-[11.5px] text-dead">// NO EXCHANGES</p>}
        >
          <ol class="mt-2 space-y-2">
            <For each={visibleRecent()}>
              {(exchange) => (
                <li
                  class={`border-l-2 px-2 font-mono text-[11px] ${toneClass[exchangeTone(exchange)]}`}
                  classList={{
                    "strike-flash":
                      exchange.status === "resolved" && flashingIds().has(String(exchange._id)),
                  }}
                >
                  {formatExchangeSummary(exchange)}
                </li>
              )}
            </For>
          </ol>
        </Show>
        <Show when={recent.error()}>
          {(queryError) => (
            <Alert tone="danger">HISTORY LINK FAILED — {queryError().message}</Alert>
          )}
        </Show>
      </section>
    </Panel>
  );
}
