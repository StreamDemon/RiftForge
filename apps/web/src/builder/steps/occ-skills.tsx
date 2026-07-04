import { occSkillPlan, type OccSkillChoice, type SkillPick } from "@riftforge/rules";
import { For, Index, Show } from "solid-js";
import type { BuilderStore } from "../store.ts";

/** The O.C.C.'s fixed skill grants plus its choose-N slots. */
export function OccSkillsStep(props: { store: BuilderStore }) {
  const plan = () => {
    const occ = props.store.occ();
    return occ ? occSkillPlan(occ) : undefined;
  };

  const picks = (slot: OccSkillChoice): SkillPick[] => props.store.draft.occChoices[slot.key] ?? [];

  const setPicks = (slot: OccSkillChoice, next: SkillPick[]) =>
    props.store.setDraft("occChoices", { ...props.store.draft.occChoices, [slot.key]: next });

  const toggle = (slot: OccSkillChoice, skillId: string) => {
    const current = picks(slot);
    const without = current.filter((p) => p.skillId !== skillId);
    setPicks(
      slot,
      without.length < current.length || current.length >= slot.choose
        ? without
        : [...current, { skillId }],
    );
  };

  const setLabel = (slot: OccSkillChoice, index: number, label: string) => {
    const next = [...picks(slot)];
    if (label.trim() === "") {
      next.splice(index, 1);
    } else {
      next[index] = { skillId: slot.options[0]!.id, label: label.trim() };
    }
    setPicks(slot, next);
  };

  const setPickLabel = (slot: OccSkillChoice, skillId: string, label: string) =>
    setPicks(
      slot,
      picks(slot).map((p) =>
        p.skillId === skillId
          ? { skillId, ...(label.trim() === "" ? {} : { label: label.trim() }) }
          : p,
      ),
    );

  return (
    <Show when={plan()}>
      {(skillPlan) => (
        <section class="space-y-4">
          <h2 class="font-bold">O.C.C. skills</h2>
          <div>
            <h3 class="font-bold">Granted</h3>
            <ul>
              <For each={skillPlan().fixed}>
                {(grant) => (
                  <li>
                    {grant.skillId}
                    <Show when={grant.occBonus}> (+{grant.occBonus}%)</Show>
                    <Show when={grant.overrideValue}> (fixed {grant.overrideValue}%)</Show>
                  </li>
                )}
              </For>
              <Show when={skillPlan().hth}>{(hth) => <li>{hth().name}</li>}</Show>
            </ul>
          </div>
          <For each={skillPlan().choices}>
            {(slot) => (
              <div>
                <h3 class="font-bold">
                  {slot.label} — pick {slot.choose}
                  <Show when={slot.occBonus}> (+{slot.occBonus}%)</Show> ({picks(slot).length}/
                  {slot.choose})
                </h3>
                <Show
                  when={slot.repeatable}
                  fallback={
                    <For each={slot.options}>
                      {(option) => (
                        <label class="block">
                          <input
                            type="checkbox"
                            checked={picks(slot).some((p) => p.skillId === option.id)}
                            onChange={() => toggle(slot, option.id)}
                          />{" "}
                          {option.name} (base {option.baseSkill}%)
                          {/* A repeatable option may already be granted fixed
                              (e.g. Lore: Demons & Monsters) — the second take
                              needs a specialization label to be legal. */}
                          <Show
                            when={
                              option.repeatable === true &&
                              picks(slot).some((p) => p.skillId === option.id)
                            }
                          >
                            {" "}
                            <input
                              type="text"
                              class="border px-1"
                              placeholder="specialization"
                              value={picks(slot).find((p) => p.skillId === option.id)?.label ?? ""}
                              onChange={(e) => setPickLabel(slot, option.id, e.currentTarget.value)}
                            />
                          </Show>
                        </label>
                      )}
                    </For>
                  }
                >
                  <Index each={Array.from({ length: slot.choose })}>
                    {(_, index) => (
                      <label class="block">
                        {slot.options[0]!.name} #{index + 1} (which?){" "}
                        <input
                          type="text"
                          class="border px-2 py-1"
                          value={picks(slot)[index]?.label ?? ""}
                          onChange={(e) => setLabel(slot, index, e.currentTarget.value)}
                        />
                      </label>
                    )}
                  </Index>
                </Show>
              </div>
            )}
          </For>
        </section>
      )}
    </Show>
  );
}
