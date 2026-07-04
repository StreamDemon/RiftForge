import { alignments } from "@riftforge/rules";
import { For } from "solid-js";
import type { BuilderStore } from "../store.ts";

const CATEGORIES = [
  { id: "good", title: "Good" },
  { id: "selfish", title: "Selfish" },
  { id: "evil", title: "Evil" },
] as const;

/** Step 6 (RUE pp.289-292): pick one of the seven alignments — no neutral. */
export function AlignmentStep(props: { store: BuilderStore }) {
  return (
    <section class="space-y-2">
      <h2 class="font-bold">Pick an alignment</h2>
      <For each={CATEGORIES}>
        {(category) => (
          <div>
            <h3 class="font-bold">{category.title}</h3>
            <For each={alignments.filter((a) => a.category === category.id)}>
              {(alignment) => (
                <label class="block border p-2">
                  <input
                    type="radio"
                    name="alignment"
                    checked={props.store.draft.alignmentId === alignment.id}
                    onChange={() => props.store.setDraft("alignmentId", alignment.id)}
                  />{" "}
                  <span class="font-bold">{alignment.name}</span>
                  <p>{alignment.summary}</p>
                </label>
              )}
            </For>
          </div>
        )}
      </For>
    </section>
  );
}
