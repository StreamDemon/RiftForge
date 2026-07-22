import {
  armorMaxPool,
  diceAverage,
  diceMax,
  diceMin,
  itemsByKind,
  type Appearance,
  type CharacterSheet,
  type ResolvedSkill,
  type SheetArmor,
  type SheetEquipmentEntry,
  type SheetSave,
  type Spell,
  type StatValue,
  type Weapon,
} from "@riftforge/rules";
import { createEffect, createSignal, For, on, onCleanup, Show, type JSX } from "solid-js";
import { Alert, Button, Chip, DataValue, MonoLabel, Panel, SectionTitle } from "./ui.tsx";

function statRange(stat: StatValue): string {
  return `${stat.min}–${stat.max} (avg ${stat.average})`;
}

/** `current / max` once vitals are pinned (DESIGN.md), otherwise the possible range. */
function statValue(stat: StatValue): string {
  if (stat.rolled === undefined) return statRange(stat);
  return `${stat.current ?? stat.rolled} / ${stat.rolled}`;
}

function saveTarget(save: SheetSave): string {
  if (save.percent) return "percentile";
  if (save.target !== undefined) return `${save.target}+`;
  if (save.targetRange) return `${save.targetRange.min}–${save.targetRange.max}+`;
  return "—";
}

function saveBonus(save: SheetSave): string {
  const sign = save.bonus >= 0 ? "+" : "";
  return `${sign}${save.bonus}${save.percent ? "%" : ""}`;
}

const APPEARANCE_ROWS = [
  ["height", "HEIGHT"],
  ["weight", "WEIGHT"],
  ["age", "AGE"],
  ["eyes", "EYES"],
  ["origin", "ORIGIN"],
  ["disposition", "DISPOSITION"],
] as const satisfies readonly (readonly [keyof Appearance, string])[];

/** Roll handlers the dossier page wires in; absent (e.g. in the wizard's
 * review preview) the sheet renders read-only. */
export interface SheetActions {
  rollSave: (name: string, save: SheetSave) => void;
  rollSkill: (skill: ResolvedSkill) => void;
  castSpell: (spell: Spell) => void;
  rollCombat: (kind: "strike" | "parry" | "dodge", bonus: number) => void;
  /** Weapon damage rolls are client-side telemetry, like skills and saves. */
  rollWeapon: (weapon: Weapon) => void;
  /** Inventory writes persist via mutations. `index` points into
   * `sheet.equipment`; the entry rides along so the server can verify the
   * instance didn't shift under an in-flight click. */
  acquireItem: (itemId: string) => void;
  discardItem: (index: number, entry: SheetEquipmentEntry) => void;
  equipArmor: (index: number | null, entry?: SheetEquipmentEntry) => void;
}

/** Schematic silhouette — the portrait frame ships before upload does. */
function PortraitFrame() {
  return (
    <div class="relative flex h-44 w-36 shrink-0 items-center justify-center border border-line bg-inset [clip-path:polygon(14px_0,100%_0,100%_calc(100%-14px),calc(100%-14px)_100%,0_100%,0_14px)]">
      <div class="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgb(79_216_255/0.05)_0_1px,transparent_1px_4px)]" />
      <svg
        width="84"
        height="108"
        viewBox="0 0 120 150"
        fill="none"
        class="opacity-85 [filter:drop-shadow(0_0_12px_rgb(79_216_255/0.4))]"
        aria-hidden="true"
      >
        <path
          d="M60 12 C40 12 30 30 30 48 C30 66 40 80 60 80 C80 80 90 66 90 48 C90 30 80 12 60 12 Z"
          stroke="#4FD8FF"
          stroke-width="1.5"
        />
        <path
          d="M18 148 C18 112 36 94 60 94 C84 94 102 112 102 148"
          stroke="#4FD8FF"
          stroke-width="1.5"
        />
        <path d="M30 40 L14 26 M90 40 L106 26" stroke="#FFAE3D" stroke-width="1" opacity="0.7" />
      </svg>
      <span class="absolute bottom-1.5 left-2 font-mono text-[9px] tracking-[0.14em] text-dead">
        NO IMAGE ON FILE
      </span>
    </div>
  );
}

/** A stat line; clickable (and amber on hover) when the page wires a roll.
 * `disabled` renders the row dead-steel and inert — e.g. a spell the
 * character can't afford — via `aria-disabled` (not the native attribute),
 * so it stays focusable and the `title` reason reaches keyboard and
 * screen-reader users. */
function StatRow(props: {
  label: JSX.Element;
  value: JSX.Element;
  live?: boolean;
  onRoll?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const value = () => (
    <span
      class={`font-data text-[12.5px] font-semibold ${props.live ? "text-ley [text-shadow:0_0_10px_rgb(79_216_255/0.6)]" : ""}`}
    >
      {props.value}
    </span>
  );
  return (
    <Show
      when={props.onRoll}
      fallback={
        <div class="flex items-baseline justify-between border-b border-dotted border-line py-1 text-[13.5px] last:border-b-0">
          <span>{props.label}</span>
          {value()}
        </div>
      }
    >
      <button
        type="button"
        title={props.title ?? "Roll"}
        aria-disabled={props.disabled || undefined}
        class="flex w-full items-baseline justify-between gap-3 border-b border-dotted border-line py-1 text-left text-[13.5px] last:border-b-0 aria-disabled:cursor-not-allowed aria-disabled:text-dead [&:not([aria-disabled])]:cursor-pointer [&:not([aria-disabled])]:hover:bg-amber/5 [&:not([aria-disabled])]:hover:text-amber"
        onClick={() => {
          if (!props.disabled) props.onRoll?.();
        }}
      >
        <span>{props.label}</span>
        {value()}
      </button>
    </Show>
  );
}

const barFill = {
  blood: "bg-gradient-to-r from-[#7a2018] to-blood shadow-[0_0_10px_rgb(226_59_46/0.4)]",
  amber: "bg-gradient-to-r from-[#7a5a17] to-amber shadow-[0_0_10px_rgb(255_174_61/0.35)]",
  // Worn metal: the armor layer speaks rust, amber-family — it is NOT magic.
  rust: "bg-gradient-to-r from-[#5c421c] to-rust shadow-[0_0_10px_rgb(168_121_50/0.35)]",
  ley: "bg-gradient-to-r from-[#14606e] to-ley ppe-pulse",
} as const;

/**
 * The worn armor's pool as a `StatValue`: the printed dice (or constant) give
 * the range, the per-suit roll (or constant) is the maximum, and the live
 * remainder rides `current` — so the armor bar behaves exactly like a vital.
 */
function armorStat(armor: SheetArmor): StatValue {
  const formula = armor.item.mdc?.mainBody;
  const fixed = armor.item.sdc ?? 0;
  return {
    min: formula ? diceMin(formula) : fixed,
    max: formula ? diceMax(formula) : fixed,
    average: formula ? diceAverage(formula) : fixed,
    rolled: armor.max,
    current: armor.current,
  };
}

/**
 * A vital as a resource bar: fill = what's LEFT of the rolled maximum
 * (`current / rolled`), full right after a roll, empty until one lands. The
 * value flashes like a dot-matrix strike whenever the live value changes —
 * a roll, damage, a cast, a restore (fine-grained update — the sheet is NOT
 * remounted).
 */
function VitalBar(props: { label: string; stat: StatValue; tone: keyof typeof barFill }) {
  const [flash, setFlash] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(
    on(
      () => props.stat.current,
      (current, previous) => {
        if (current === undefined || current === previous) return;
        setFlash(false);
        requestAnimationFrame(() => setFlash(true));
        clearTimeout(timer);
        timer = setTimeout(() => setFlash(false), 700);
      },
      { defer: true },
    ),
  );
  onCleanup(() => clearTimeout(timer));

  // H.P. can sit in the negative coma band — the bar just reads empty.
  const pct = () => {
    const { rolled, current } = props.stat;
    if (rolled === undefined || rolled <= 0) return 0;
    const ratio = (current ?? rolled) / rolled;
    return Math.min(100, Math.max(0, Math.round(ratio * 100)));
  };

  return (
    <div class="py-1">
      <div class="flex items-baseline justify-between font-mono text-[11px] text-muted">
        <span>{props.label}</span>
        <span
          title={`rolled range ${statRange(props.stat)}`}
          classList={{ "strike-flash": flash() }}
          class={`font-data text-[12.5px] font-semibold ${props.tone === "ley" ? "text-ley [text-shadow:0_0_10px_rgb(79_216_255/0.6)]" : "text-fg"}`}
        >
          {statValue(props.stat)}
        </span>
      </div>
      <div class="relative mt-1 h-[7px] border border-line bg-noir">
        <div
          class={`absolute inset-y-0 left-0 ${barFill[props.tone]}`}
          style={{ width: `${pct()}%` }}
        />
      </div>
    </div>
  );
}

const KIND_LABEL = { weapon: "WPN", armor: "ARM", gear: "GEAR" } as const;

/** The manifest value column: a weapon's dice, an armor's pool, a gear dash. */
function equipmentValue(entry: SheetEquipmentEntry, armor: SheetArmor | undefined): string {
  const item = entry.item;
  if (item.kind === "weapon") {
    return `${item.damage.formula} ${item.damage.type === "md" ? "M.D." : "S.D.C."}`;
  }
  if (item.kind === "armor") {
    const unit = item.mdc ? "M.D.C." : "S.D.C.";
    const max = armorMaxPool(item, entry.rolledMdc);
    if (max === undefined) return `UNRATED ${unit}`;
    // The worn suit shows its live remainder; stowed suits just their rating.
    if (entry.worn === true && armor?.current !== undefined) {
      return `${armor.current} / ${max} ${unit}`;
    }
    return `${max} ${unit}`;
  }
  return "—";
}

/** One manifest row: name + kind tag, the value column (weapons roll on
 * click), and the equip/discard controls when the page wires actions. */
function EquipmentRow(props: {
  entry: SheetEquipmentEntry;
  index: number;
  armor: SheetArmor | undefined;
  actions?: SheetActions;
  gameplayDisabledReason?: string;
}) {
  const item = () => props.entry.item;
  const value = () => equipmentValue(props.entry, props.armor);
  return (
    <div class="flex items-center justify-between gap-3 border-b border-dotted border-line py-1 text-[13.5px] last:border-b-0">
      <span class="min-w-0 truncate" title={item().notes}>
        {item().name}
        <span class="ml-2 font-mono text-[9.5px] tracking-[0.12em] text-dead">
          {KIND_LABEL[item().kind]}
        </span>
        <Show when={props.entry.worn}>
          <span class="notch-6 ml-2 border border-rust/60 px-1.5 font-hud text-[10px] font-semibold tracking-[0.08em] text-rust uppercase">
            Worn
          </span>
        </Show>
      </span>
      <span class="flex shrink-0 items-center gap-2">
        <Show
          when={item().kind === "weapon" && props.actions}
          fallback={<span class="font-data text-[12.5px] font-semibold">{value()}</span>}
        >
          <button
            type="button"
            title={props.gameplayDisabledReason ?? "Roll damage"}
            aria-disabled={props.gameplayDisabledReason !== undefined || undefined}
            class="font-data text-[12.5px] font-semibold aria-disabled:cursor-not-allowed aria-disabled:text-dead [&:not([aria-disabled])]:cursor-pointer [&:not([aria-disabled])]:hover:bg-amber/5 [&:not([aria-disabled])]:hover:text-amber"
            onClick={() => {
              if (props.gameplayDisabledReason === undefined) {
                props.actions!.rollWeapon(item() as Weapon);
              }
            }}
          >
            {value()}
          </button>
        </Show>
        <Show when={props.actions && item().kind === "armor"}>
          <button
            type="button"
            class="cursor-pointer font-hud text-[11px] font-semibold tracking-[0.08em] text-muted uppercase hover:text-amber"
            onClick={() =>
              props.actions!.equipArmor(props.entry.worn === true ? null : props.index, props.entry)
            }
          >
            {props.entry.worn === true ? "[doff]" : "[wear]"}
          </button>
        </Show>
        <Show when={props.actions}>
          <button
            type="button"
            title={`Discard ${item().name}`}
            aria-label={`Discard ${item().name}`}
            class="cursor-pointer font-mono text-[12px] text-dead hover:text-blood-text"
            onClick={() => props.actions!.discardItem(props.index, props.entry)}
          >
            ✕
          </button>
        </Show>
      </span>
    </div>
  );
}

/** Catalog picker + acquire button, grouped by kind (armory requisition). */
function AcquireControl(props: { onAcquire: (itemId: string) => void }) {
  const [selected, setSelected] = createSignal("");
  return (
    <div class="mt-3 flex gap-2 border-t border-line pt-3">
      <select
        aria-label="Item to acquire"
        class="notch-8 min-w-0 flex-1 cursor-pointer border border-line bg-noir px-2 py-1.5 font-mono text-[12px] text-fg focus:border-amber"
        value={selected()}
        onChange={(e) => setSelected(e.currentTarget.value)}
      >
        <option value="" disabled>
          — SELECT ITEM —
        </option>
        <For each={["armor", "weapon", "gear"] as const}>
          {(kind) => (
            <optgroup label={kind.toUpperCase()}>
              <For each={itemsByKind(kind)}>
                {(item) => <option value={item.id}>{item.name}</option>}
              </For>
            </optgroup>
          )}
        </For>
      </select>
      <Button
        class="shrink-0 px-3 py-1.5"
        disabled={selected() === ""}
        onClick={() => {
          if (selected() !== "") props.onAcquire(selected());
        }}
      >
        {"> Acquire"}
      </Button>
    </div>
  );
}

/**
 * Every `deriveSheet` section in Ley Terminal chrome (DESIGN.md). Shared by
 * the live sheet page and the builder's review preview so they never drift.
 * With `actions`, saves/skills/spells/combat rows roll on click.
 */
export function SheetView(props: {
  sheet: CharacterSheet;
  actions?: SheetActions;
  gameplayDisabledReason?: string;
}) {
  const s = () => props.sheet;
  return (
    <article class="sheet-reveal space-y-4">
      <header class="flex flex-col gap-5 sm:flex-row">
        <PortraitFrame />
        <div class="min-w-0 flex-1">
          <MonoLabel>
            LEVEL {s().level} // {s().species.name.toUpperCase()} // {s().occ.name.toUpperCase()} //{" "}
            {s().occ.category.toUpperCase()}
          </MonoLabel>
          <h1 class="font-display text-5xl leading-none tracking-[0.02em]">{s().name}</h1>
          <Show when={s().narrative?.epithet}>
            {(epithet) => (
              <p class="mt-1 font-narrative text-[15px] italic text-[#B9C4CA]">
                &ldquo;{epithet()}&rdquo;
              </p>
            )}
          </Show>
          <Show when={(s().narrative?.traits?.length ?? 0) > 0}>
            <div class="mt-2.5 flex flex-wrap gap-1.5">
              <For each={s().narrative!.traits}>{(trait) => <Chip>{trait}</Chip>}</For>
            </div>
          </Show>
        </div>
        <div class="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          <Show when={s().alignment}>
            {(alignment) => (
              <span class="mt-1 inline-block rotate-2 border-2 border-blood px-3 py-0.5 font-display text-[15px] tracking-[0.12em] text-blood opacity-85">
                {alignment().name.toUpperCase()}
              </span>
            )}
          </Show>
          <Show
            // An `appearance: {}` written via the API is valid but has nothing
            // to show — hide the block unless at least one row has a value.
            when={APPEARANCE_ROWS.some(([field]) => s().narrative?.appearance?.[field])}
          >
            <dl class="text-left font-mono text-[11.5px] leading-[1.9] text-muted sm:text-right">
              <For each={APPEARANCE_ROWS.filter(([field]) => s().narrative?.appearance?.[field])}>
                {([field, label]) => (
                  <div>
                    <dt class="inline">{label} </dt>
                    <dd class="inline text-fg">{s().narrative!.appearance![field]}</dd>
                  </div>
                )}
              </For>
            </dl>
          </Show>
        </div>
      </header>

      <Show when={props.gameplayDisabledReason}>
        {(reason) => (
          <Alert tone="danger">
            <MonoLabel class="mr-2 !text-inherit">LIFE SIGNS TERMINATED</MonoLabel>
            <span>{reason()}</span>
          </Alert>
        )}
      </Show>

      <div class="grid gap-4 lg:grid-cols-2">
        <Panel class="p-4">
          <SectionTitle>ATTRIBUTES</SectionTitle>
          <div class="mt-3 grid grid-cols-4 gap-2">
            <For each={Object.entries(s().attributes)}>
              {([name, value]) => <DataValue label={name} value={value} />}
            </For>
          </div>
          <Show when={Object.keys(s().attributeBonuses).length > 0}>
            <div class="mt-3">
              <MonoLabel>DERIVED BONUSES</MonoLabel>
              <div class="mt-1">
                <For each={Object.entries(s().attributeBonuses)}>
                  {([target, bonus]) => (
                    <StatRow label={target} value={`${bonus >= 0 ? "+" : ""}${bonus}`} />
                  )}
                </For>
              </div>
            </div>
          </Show>
        </Panel>

        <div class="space-y-4">
          <Panel class="p-4">
            <SectionTitle>VITALS</SectionTitle>
            <div class="mt-2">
              <VitalBar label="HIT POINTS" stat={s().vitals.hitPoints} tone="blood" />
              <VitalBar label="S.D.C." stat={s().vitals.sdc} tone="amber" />
              <Show when={s().armor}>
                {(armor) => (
                  <VitalBar
                    label={`ARMOR — ${armor().item.mdc ? "M.D.C." : "S.D.C."}`}
                    stat={armorStat(armor())}
                    tone="rust"
                  />
                )}
              </Show>
              <Show when={s().ppe}>
                {(ppe) => <VitalBar label="P.P.E. ◈ LIVE" stat={ppe()} tone="ley" />}
              </Show>
              <StatRow label="Coma / Death" value={s().vitals.comaDeathFloor} />
              <Show when={s().spellStrength}>
                {(strength) => <StatRow label="Spell Strength" value={strength()} live />}
              </Show>
            </div>
          </Panel>

          <Panel class="p-4">
            <SectionTitle>COMBAT</SectionTitle>
            <div class="mt-2">
              <StatRow label="Attacks / Melee" value={s().combat.attacksPerMelee} />
              <StatRow
                label="Strike"
                value={`+${s().combat.strike}`}
                onRoll={
                  props.actions && (() => props.actions!.rollCombat("strike", s().combat.strike))
                }
                disabled={props.gameplayDisabledReason !== undefined}
                title={props.gameplayDisabledReason ?? "Roll"}
              />
              <StatRow
                label="Parry"
                value={`+${s().combat.parry}`}
                onRoll={
                  props.actions && (() => props.actions!.rollCombat("parry", s().combat.parry))
                }
                disabled={props.gameplayDisabledReason !== undefined}
                title={props.gameplayDisabledReason ?? "Roll"}
              />
              <StatRow
                label="Dodge"
                value={`+${s().combat.dodge}`}
                onRoll={
                  props.actions && (() => props.actions!.rollCombat("dodge", s().combat.dodge))
                }
                disabled={props.gameplayDisabledReason !== undefined}
                title={props.gameplayDisabledReason ?? "Roll"}
              />
              <StatRow label="Damage Bonus" value={`+${s().combat.damageBonus}`} />
            </div>
          </Panel>
        </div>
      </div>

      <Panel class="p-4">
        <div class="flex items-baseline justify-between">
          <SectionTitle>SAVING THROWS</SectionTitle>
          <Show when={props.actions}>
            <MonoLabel class="text-dead">CLICK TO ROLL</MonoLabel>
          </Show>
        </div>
        <div class="mt-2 grid gap-x-8 md:grid-cols-2">
          <For each={Object.entries(s().saves)}>
            {([name, save]) => (
              <StatRow
                label={name}
                value={`${saveTarget(save)} / ${saveBonus(save)}`}
                onRoll={
                  // Percentile saves (coma/death) are a different mechanic —
                  // they stay display-only for now.
                  props.actions && !save.percent
                    ? () => props.actions!.rollSave(name, save)
                    : undefined
                }
                disabled={props.gameplayDisabledReason !== undefined}
                title={props.gameplayDisabledReason ?? "Roll"}
              />
            )}
          </For>
        </div>
      </Panel>

      <div class="grid gap-4 lg:grid-cols-2">
        <Panel class="p-4">
          <div class="flex items-baseline justify-between">
            <SectionTitle>SKILLS — FIELD RATED</SectionTitle>
            <Show when={props.actions}>
              <MonoLabel class="text-dead">CLICK TO ROLL</MonoLabel>
            </Show>
          </div>
          <div class="mt-2">
            <For each={s().skills}>
              {(skill) => (
                <StatRow
                  label={
                    <>
                      {skill.name}
                      <Show when={skill.label}>
                        {(label) => <span class="text-muted"> ({label()})</span>}
                      </Show>
                    </>
                  }
                  value={
                    <>
                      {skill.value}%
                      <Show when={skill.value2 !== undefined}> / {skill.value2}%</Show>
                    </>
                  }
                  onRoll={props.actions && (() => props.actions!.rollSkill(skill))}
                  disabled={props.gameplayDisabledReason !== undefined}
                  title={props.gameplayDisabledReason ?? "Roll"}
                />
              )}
            </For>
          </div>
        </Panel>

        <Panel class="p-4">
          <div class="flex items-baseline justify-between">
            <SectionTitle>SPELL KNOWLEDGE ({s().spells.count})</SectionTitle>
            <Show when={props.actions}>
              <MonoLabel class="text-dead">CLICK TO CAST</MonoLabel>
            </Show>
          </div>
          <div class="mt-2">
            <For each={s().spells.known}>
              {(spell) => {
                // Casting spends live P.P.E. — a spell the character can't
                // pay for (or can't measure, pre-roll) goes dead-steel.
                const ppeLeft = () => s().ppe?.current;
                const blocked = () =>
                  props.gameplayDisabledReason ??
                  (props.actions === undefined
                    ? undefined
                    : ppeLeft() === undefined
                      ? "Roll vitals to cast"
                      : spell.ppe > ppeLeft()!
                        ? "Insufficient P.P.E."
                        : undefined);
                return (
                  <StatRow
                    label={
                      <>
                        {spell.name} <span class="text-muted">LVL {spell.level}</span>
                      </>
                    }
                    value={
                      <span
                        class={
                          blocked()
                            ? "text-dead"
                            : "text-ley [text-shadow:0_0_10px_rgb(79_216_255/0.5)]"
                        }
                      >
                        {spell.ppe} PPE
                      </span>
                    }
                    onRoll={props.actions && (() => props.actions!.castSpell(spell))}
                    disabled={blocked() !== undefined}
                    title={blocked() ?? "Cast"}
                  />
                );
              }}
            </For>
          </div>
        </Panel>
      </div>

      <Panel class="p-4">
        <div class="flex items-baseline justify-between">
          <SectionTitle>EQUIPMENT — MANIFEST ({s().equipment.length})</SectionTitle>
          <Show when={props.actions}>
            <MonoLabel class="text-dead">WEAPONS: CLICK DICE TO ROLL</MonoLabel>
          </Show>
        </div>
        <div class="mt-2">
          <For
            each={s().equipment}
            fallback={
              <p class="font-mono text-[11.5px] tracking-[0.1em] text-dead">
                // NOTHING ON MANIFEST
              </p>
            }
          >
            {(entry, index) => (
              <EquipmentRow
                entry={entry}
                index={index()}
                armor={s().armor}
                actions={props.actions}
                gameplayDisabledReason={props.gameplayDisabledReason}
              />
            )}
          </For>
        </div>
        <Show when={props.actions}>
          {(actions) => <AcquireControl onAcquire={(itemId) => actions().acquireItem(itemId)} />}
        </Show>
      </Panel>

      <Show when={s().narrative?.backstory}>
        {(backstory) => (
          <Panel class="p-4">
            <div class="flex items-baseline justify-between">
              <SectionTitle>PERSONNEL FILE — NARRATIVE</SectionTitle>
              <MonoLabel class="text-dead">AUTHOR: PLAYER</MonoLabel>
            </div>
            <p class="mt-2 max-w-[68ch] whitespace-pre-wrap font-narrative text-[14.5px] leading-relaxed text-[#C9CFC7]">
              {backstory()}
            </p>
          </Panel>
        )}
      </Show>
    </article>
  );
}
