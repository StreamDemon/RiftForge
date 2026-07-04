import type { Appearance, CharacterSheet, SheetSave, StatValue } from "@riftforge/rules";
import { For, Show, type JSX } from "solid-js";
import { Chip, DataValue, MonoLabel, Panel, SectionTitle } from "./ui.tsx";

/** "rolled 17" once vitals are pinned, otherwise the possible range. */
function statValue(stat: StatValue): string {
  const range = `${stat.min}–${stat.max} (avg ${stat.average})`;
  return stat.rolled === undefined ? range : `${stat.rolled} (range ${range})`;
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

function StatRow(props: { label: JSX.Element; value: JSX.Element; live?: boolean }) {
  return (
    <div class="flex items-baseline justify-between border-b border-dotted border-line py-1 text-[13.5px] last:border-b-0">
      <span>{props.label}</span>
      <span
        class={`font-data text-[12.5px] font-semibold ${props.live ? "text-ley [text-shadow:0_0_10px_rgb(79_216_255/0.6)]" : ""}`}
      >
        {props.value}
      </span>
    </div>
  );
}

/**
 * Every `deriveSheet` section in Ley Terminal chrome (DESIGN.md). Shared by
 * the live sheet page and the builder's review preview so they never drift.
 */
export function SheetView(props: { sheet: CharacterSheet; vitalsExtra?: JSX.Element }) {
  const s = () => props.sheet;
  return (
    <article class="space-y-4">
      <header class="flex gap-5">
        <PortraitFrame />
        <div class="min-w-0 flex-1">
          <MonoLabel>
            LEVEL {s().level} // {s().occ.name.toUpperCase()} // {s().occ.category.toUpperCase()}
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
        <div class="flex shrink-0 flex-col items-end gap-3">
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
            <dl class="text-right font-mono text-[11.5px] leading-[1.9] text-muted">
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
              <StatRow label="Hit Points" value={statValue(s().vitals.hitPoints)} />
              <StatRow label="S.D.C." value={statValue(s().vitals.sdc)} />
              <StatRow label="Coma / Death" value={s().vitals.comaDeathFloor} />
              <Show when={s().ppe}>
                {(ppe) => <StatRow label="P.P.E." value={statValue(ppe())} live />}
              </Show>
              <Show when={s().spellStrength}>
                {(strength) => <StatRow label="Spell Strength" value={strength()} live />}
              </Show>
            </div>
            {props.vitalsExtra}
          </Panel>

          <Panel class="p-4">
            <SectionTitle>COMBAT</SectionTitle>
            <div class="mt-2">
              <StatRow label="Attacks / Melee" value={s().combat.attacksPerMelee} />
              <StatRow label="Strike" value={`+${s().combat.strike}`} />
              <StatRow label="Parry" value={`+${s().combat.parry}`} />
              <StatRow label="Dodge" value={`+${s().combat.dodge}`} />
              <StatRow label="Damage Bonus" value={`+${s().combat.damageBonus}`} />
            </div>
          </Panel>
        </div>
      </div>

      <Panel class="p-4">
        <SectionTitle>SAVING THROWS</SectionTitle>
        <div class="mt-2 grid gap-x-8 md:grid-cols-2">
          <For each={Object.entries(s().saves)}>
            {([name, save]) => (
              <StatRow label={name} value={`${saveTarget(save)} / ${saveBonus(save)}`} />
            )}
          </For>
        </div>
      </Panel>

      <div class="grid gap-4 lg:grid-cols-2">
        <Panel class="p-4">
          <SectionTitle>SKILLS — FIELD RATED</SectionTitle>
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
                />
              )}
            </For>
          </div>
        </Panel>

        <Panel class="p-4">
          <SectionTitle>SPELL KNOWLEDGE ({s().spells.count})</SectionTitle>
          <div class="mt-2">
            <For each={s().spells.known}>
              {(spell) => (
                <StatRow
                  label={
                    <>
                      {spell.name} <span class="text-muted">LVL {spell.level}</span>
                    </>
                  }
                  value={
                    <span class="text-ley [text-shadow:0_0_10px_rgb(79_216_255/0.5)]">
                      {spell.ppe} PPE
                    </span>
                  }
                />
              )}
            </For>
          </div>
        </Panel>
      </div>

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
