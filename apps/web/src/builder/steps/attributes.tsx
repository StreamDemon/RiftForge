import { ATTRIBUTE_CODES, rollAttribute, rollAttributes } from "@riftforge/rules";
import { For, Show } from "solid-js";
import { Button, Panel } from "../../components/ui.tsx";
import type { BuilderStore } from "../store.ts";

/** Step 1 (RUE p.279): 3D6 each; 16-18 is exceptional and earns bonus dice. */
export function AttributesStep(props: { store: BuilderStore }) {
  const rollAll = () => props.store.setDraft("attributes", rollAttributes());
  const rerollOne = (code: (typeof ATTRIBUTE_CODES)[number]) =>
    props.store.setDraft("attributes", code, rollAttribute());

  return (
    <Panel class="space-y-3 p-5">
      <h2 class="font-display text-2xl tracking-[0.03em]">ROLL THE EIGHT ATTRIBUTES</h2>
      <p class="text-[13.5px] text-muted">
        3D6 each — a 16-18 is exceptional and adds a bonus die (two if the first is a 6).
      </p>
      <Button variant="primary" onClick={rollAll}>
        {props.store.draft.attributes ? "> Reroll All" : "> Roll Attributes"}
      </Button>
      <Show when={props.store.draft.attributes}>
        {(attributes) => (
          <ul class="space-y-1.5">
            <For each={ATTRIBUTE_CODES}>
              {(code) => {
                const roll = () => attributes()[code];
                return (
                  <li class="flex items-center gap-3 border-b border-dotted border-line pb-1.5 font-mono text-[13px]">
                    <span class="w-10 font-data font-semibold text-muted">{code}</span>
                    <span class="w-8 font-data text-lg font-extrabold">{roll().total}</span>
                    <span class="text-muted">[{roll().dice.join("][")}]</span>
                    <Show when={roll().exceptional}>
                      <span class="text-amber [text-shadow:0_0_8px_rgb(255_174_61/0.5)]">
                        EXCEPTIONAL
                      </span>
                    </Show>
                    <button
                      type="button"
                      class="ml-auto cursor-pointer font-mono text-[11.5px] text-muted underline underline-offset-2 hover:text-amber"
                      onClick={() => rerollOne(code)}
                    >
                      reroll
                    </button>
                  </li>
                );
              }}
            </For>
          </ul>
        )}
      </Show>
    </Panel>
  );
}
