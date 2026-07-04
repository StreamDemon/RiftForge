import { ATTRIBUTE_CODES, rollAttribute, rollAttributes } from "@riftforge/rules";
import { For, Show } from "solid-js";
import type { BuilderStore } from "../store.ts";

/** Step 1 (RUE p.279): 3D6 each; 16-18 is exceptional and earns bonus dice. */
export function AttributesStep(props: { store: BuilderStore }) {
  const rollAll = () => props.store.setDraft("attributes", rollAttributes());
  const rerollOne = (code: (typeof ATTRIBUTE_CODES)[number]) =>
    props.store.setDraft("attributes", code, rollAttribute());

  return (
    <section class="space-y-2">
      <h2 class="font-bold">Roll the eight attributes</h2>
      <p>3D6 each — a 16-18 is exceptional and adds a bonus die (two if the first is a 6).</p>
      <button type="button" class="border px-2 py-1" onClick={rollAll}>
        {props.store.draft.attributes ? "Reroll all" : "Roll attributes"}
      </button>
      <Show when={props.store.draft.attributes}>
        {(attributes) => (
          <ul class="space-y-1">
            <For each={ATTRIBUTE_CODES}>
              {(code) => {
                const roll = () => attributes()[code];
                return (
                  <li>
                    <span class="font-bold">{code}</span> {roll().total} ({roll().dice.join(" + ")})
                    <Show when={roll().exceptional}> — exceptional!</Show>{" "}
                    <button type="button" class="border px-1" onClick={() => rerollOne(code)}>
                      reroll
                    </button>
                  </li>
                );
              }}
            </For>
          </ul>
        )}
      </Show>
    </section>
  );
}
