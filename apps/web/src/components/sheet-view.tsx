import type { CharacterSheet, SheetSave, StatValue } from "@riftforge/rules";
import { For, Show, type JSX } from "solid-js";

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

/**
 * Every `deriveSheet` section, unstyled (visual design is #10). Shared by the
 * live sheet page and the builder's review preview so they can never drift.
 */
export function SheetView(props: { sheet: CharacterSheet; vitalsExtra?: JSX.Element }) {
  const s = () => props.sheet;
  return (
    <article class="space-y-6">
      <header>
        <h1 class="text-xl font-bold">{s().name}</h1>
        <p>
          Level {s().level} {s().occ.name} ({s().occ.category})
        </p>
        <Show when={s().alignment}>
          {(alignment) => (
            <p>
              {alignment().name} ({alignment().category})
            </p>
          )}
        </Show>
      </header>

      <section>
        <h2 class="font-bold">Attributes</h2>
        <ul class="flex flex-wrap gap-4">
          <For each={Object.entries(s().attributes)}>
            {([name, value]) => (
              <li>
                {name} {value}
              </li>
            )}
          </For>
        </ul>
        <Show when={Object.keys(s().attributeBonuses).length > 0}>
          <h3 class="mt-2 font-bold">Attribute bonuses</h3>
          <ul>
            <For each={Object.entries(s().attributeBonuses)}>
              {([target, bonus]) => (
                <li>
                  {target}: {bonus >= 0 ? "+" : ""}
                  {bonus}
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>

      <section>
        <h2 class="font-bold">Combat</h2>
        <ul>
          <li>Attacks per melee: {s().combat.attacksPerMelee}</li>
          <li>Strike: +{s().combat.strike}</li>
          <li>Parry: +{s().combat.parry}</li>
          <li>Dodge: +{s().combat.dodge}</li>
          <li>Damage bonus: +{s().combat.damageBonus}</li>
        </ul>
      </section>

      <section>
        <h2 class="font-bold">Vitals</h2>
        <ul>
          <li>Hit Points: {statValue(s().vitals.hitPoints)}</li>
          <li>S.D.C.: {statValue(s().vitals.sdc)}</li>
          <li>Coma/death floor: {s().vitals.comaDeathFloor}</li>
          <Show when={s().ppe}>{(ppe) => <li>P.P.E.: {statValue(ppe())}</li>}</Show>
          <Show when={s().spellStrength}>
            {(strength) => <li>Spell strength: {strength()}</li>}
          </Show>
        </ul>
        {props.vitalsExtra}
      </section>

      <section>
        <h2 class="font-bold">Saving throws</h2>
        <ul>
          <For each={Object.entries(s().saves)}>
            {([name, save]) => (
              <li>
                {name}: {saveTarget(save)} / {saveBonus(save)}
              </li>
            )}
          </For>
        </ul>
      </section>

      <section>
        <h2 class="font-bold">Skills</h2>
        <ul>
          <For each={s().skills}>
            {(skill) => (
              <li>
                {skill.name}
                <Show when={skill.label}> ({skill.label})</Show>: {skill.value}%
                <Show when={skill.value2 !== undefined}> / {skill.value2}%</Show>
              </li>
            )}
          </For>
        </ul>
      </section>

      <section>
        <h2 class="font-bold">Spells ({s().spells.count})</h2>
        <ul>
          <For each={s().spells.known}>
            {(spell) => (
              <li>
                {spell.name} — level {spell.level}, {spell.ppe} P.P.E.
              </li>
            )}
          </For>
        </ul>
      </section>
    </article>
  );
}
