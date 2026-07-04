import { initialSpellChoices } from "@riftforge/rules";
import { createMemo, For, Show } from "solid-js";
import type { BuilderStore } from "../store.ts";

/** Initial spell knowledge (e.g. LLW: three from each of spell levels 1-4). */
export function SpellsStep(props: { store: BuilderStore }) {
  const choices = createMemo(() => {
    const occ = props.store.occ();
    return occ ? initialSpellChoices(occ) : [];
  });

  const toggle = (spellId: string, levelIds: Set<string>, max: number) => {
    const current = props.store.draft.spellIds;
    if (current.includes(spellId)) {
      props.store.setDraft(
        "spellIds",
        current.filter((id) => id !== spellId),
      );
      return;
    }
    if (current.filter((id) => levelIds.has(id)).length >= max) return;
    props.store.setDraft("spellIds", [...current, spellId]);
  };

  return (
    <section class="space-y-4">
      <h2 class="font-bold">Initial spell knowledge</h2>
      <Show when={choices().length > 0} fallback={<p>This O.C.C. has no initial spells.</p>}>
        <For each={choices()}>
          {(choice) => {
            const levelIds = new Set(choice.options.map((s) => s.id));
            const picked = () => props.store.draft.spellIds.filter((id) => levelIds.has(id)).length;
            return (
              <div>
                <h3 class="font-bold">
                  Level {choice.level} — pick {choice.choose} ({picked()}/{choice.choose})
                </h3>
                <For each={choice.options}>
                  {(spell) => (
                    <label class="block">
                      <input
                        type="checkbox"
                        checked={props.store.draft.spellIds.includes(spell.id)}
                        onChange={() => toggle(spell.id, levelIds, choice.choose)}
                      />{" "}
                      {spell.name} ({spell.ppe} P.P.E.)
                    </label>
                  )}
                </For>
              </div>
            );
          }}
        </For>
      </Show>
      <Show when={props.store.spellErrors().length > 0}>
        <ul>
          <For each={props.store.spellErrors()}>{(error) => <li>{error}</li>}</For>
        </ul>
      </Show>
    </section>
  );
}
