import { alignments } from "@riftforge/rules";
import { For } from "solid-js";
import { Panel } from "../../components/ui.tsx";
import type { BuilderStore } from "../store.ts";

const CATEGORIES = [
  { id: "good", title: "GOOD" },
  { id: "selfish", title: "SELFISH" },
  { id: "evil", title: "EVIL" },
] as const;

/** Step 6 (RUE pp.289-292): pick one of the seven alignments — no neutral. */
export function AlignmentStep(props: { store: BuilderStore }) {
  return (
    <Panel class="space-y-4 p-5">
      <h2 class="font-display text-2xl tracking-[0.03em]">DECLARE ALIGNMENT</h2>
      <For each={CATEGORIES}>
        {(category) => (
          <div>
            <h3
              class="font-display text-[15px] tracking-[0.12em]"
              classList={{
                "text-blood-text": category.id === "evil",
                "text-muted": category.id !== "evil",
              }}
            >
              // {category.title}
            </h3>
            <div class="mt-1.5 space-y-1.5">
              <For each={alignments.filter((a) => a.category === category.id)}>
                {(alignment) => (
                  <label
                    class="block cursor-pointer border p-3"
                    classList={{
                      "border-amber bg-amber/5": props.store.draft.alignmentId === alignment.id,
                      "border-line bg-inset hover:border-muted":
                        props.store.draft.alignmentId !== alignment.id,
                    }}
                  >
                    <div class="flex items-baseline gap-3">
                      <input
                        type="radio"
                        name="alignment"
                        class="accent-amber"
                        checked={props.store.draft.alignmentId === alignment.id}
                        onChange={() => props.store.setDraft("alignmentId", alignment.id)}
                      />
                      <span class="font-display text-lg tracking-[0.04em]">
                        {alignment.name.toUpperCase()}
                      </span>
                    </div>
                    <p class="mt-1 font-narrative text-[13.5px] text-muted">{alignment.summary}</p>
                  </label>
                )}
              </For>
            </div>
          </div>
        )}
      </For>
    </Panel>
  );
}
