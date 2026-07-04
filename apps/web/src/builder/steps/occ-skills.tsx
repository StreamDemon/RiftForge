import { occSkillPlan, type OccSkillChoice, type SkillPick } from "@riftforge/rules";
import { For, Index, Show } from "solid-js";
import { MonoLabel, Panel, TextInput } from "../../components/ui.tsx";
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
    } else if (index >= next.length) {
      // Append instead of writing past the end: filling input #2 before #1
      // must not leave a hole that skill assembly would crash on.
      next.push({ skillId: slot.options[0]!.id, label: label.trim() });
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
        <Panel class="space-y-4 p-5">
          <h2 class="font-display text-2xl tracking-[0.03em]">O.C.C. SKILLS</h2>
          <div>
            <MonoLabel>GRANTED — NO CHOICE</MonoLabel>
            <ul class="mt-1.5 grid gap-x-8 font-mono text-[13px] md:grid-cols-2">
              <For each={skillPlan().fixed}>
                {(grant) => (
                  <li class="flex justify-between border-b border-dotted border-line py-1">
                    <span>{grant.skillId}</span>
                    <span class="font-data text-[12px] text-muted">
                      <Show when={grant.occBonus}>+{grant.occBonus}%</Show>
                      <Show when={grant.overrideValue}>FIXED {grant.overrideValue}%</Show>
                    </span>
                  </li>
                )}
              </For>
              <Show when={skillPlan().hth}>
                {(hth) => (
                  <li class="flex justify-between border-b border-dotted border-line py-1">
                    <span>{hth().name}</span>
                  </li>
                )}
              </Show>
            </ul>
          </div>
          <For each={skillPlan().choices}>
            {(slot) => (
              <div>
                <h3 class="font-display text-[15px] tracking-[0.1em] text-muted">
                  // {slot.label.toUpperCase()} — PICK {slot.choose}
                  <Show when={slot.occBonus}> (+{slot.occBonus}%)</Show>{" "}
                  <span
                    classList={{
                      "text-ok": picks(slot).length === slot.choose,
                      "text-amber": picks(slot).length !== slot.choose,
                    }}
                  >
                    [{picks(slot).length}/{slot.choose}]
                  </span>
                </h3>
                <Show
                  when={slot.repeatable}
                  fallback={
                    <div class="mt-1.5 space-y-1">
                      <For each={slot.options}>
                        {(option) => (
                          <label class="flex cursor-pointer items-center gap-2 font-mono text-[13px] hover:text-amber">
                            <input
                              type="checkbox"
                              class="accent-amber"
                              checked={picks(slot).some((p) => p.skillId === option.id)}
                              onChange={() => toggle(slot, option.id)}
                            />
                            {option.name} <span class="text-dead">(base {option.baseSkill}%)</span>
                            {/* A repeatable option may already be granted fixed
                                (e.g. Lore: Demons & Monsters) — the second take
                                needs a specialization label to be legal. */}
                            <Show
                              when={
                                option.repeatable === true &&
                                picks(slot).some((p) => p.skillId === option.id)
                              }
                            >
                              <TextInput
                                class="px-2 py-0.5 text-[12px]"
                                placeholder="SPECIALIZATION"
                                value={
                                  picks(slot).find((p) => p.skillId === option.id)?.label ?? ""
                                }
                                onChange={(e) =>
                                  setPickLabel(slot, option.id, e.currentTarget.value)
                                }
                              />
                            </Show>
                          </label>
                        )}
                      </For>
                    </div>
                  }
                >
                  <div class="mt-1.5 space-y-1.5">
                    <Index each={Array.from({ length: slot.choose })}>
                      {(_, index) => (
                        <label class="flex items-center gap-2 font-mono text-[13px]">
                          {slot.options[0]!.name} #{index + 1} (which?)
                          <TextInput
                            class="px-2 py-1 text-[12px]"
                            value={picks(slot)[index]?.label ?? ""}
                            onChange={(e) => setLabel(slot, index, e.currentTarget.value)}
                          />
                        </label>
                      )}
                    </Index>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </Panel>
      )}
    </Show>
  );
}
