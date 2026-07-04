import { meetsAttributeRequirements, occRegistry } from "@riftforge/rules";
import { For, Show } from "solid-js";
import type { BuilderStore } from "../store.ts";

/** Step 5 (RUE p.289): pick an O.C.C., gated on its attribute requirements. */
export function OccStep(props: { store: BuilderStore }) {
  const occs = Object.values(occRegistry);
  const check = (occ: (typeof occs)[number]) => {
    const attrs = props.store.attributeTotals();
    return attrs ? meetsAttributeRequirements(occ, attrs) : undefined;
  };

  return (
    <section class="space-y-2">
      <h2 class="font-bold">Pick an O.C.C.</h2>
      <For each={occs}>
        {(occ) => (
          <label class="block border p-2">
            <input
              type="radio"
              name="occ"
              checked={props.store.draft.occId === occ.id}
              onChange={() => props.store.setDraft("occId", occ.id)}
            />{" "}
            <span class="font-bold">{occ.name}</span> ({occ.category})
            <Show when={occ.description}>
              <p>{occ.description}</p>
            </Show>
            <p>
              Requires:{" "}
              {occ.attributeRequirements.map((r) => `${r.code} ${r.min}+`).join(", ") || "nothing"}
            </p>
            <Show when={check(occ)}>
              {(result) => (
                <Show
                  when={result().ok}
                  fallback={
                    <p>
                      Not qualified:{" "}
                      {result()
                        .failures.map((f) => `${f.code} ${f.actual} (needs ${f.min})`)
                        .join(", ")}{" "}
                      — reroll attributes to qualify.
                    </p>
                  }
                >
                  <p>Requirements met.</p>
                </Show>
              )}
            </Show>
          </label>
        )}
      </For>
    </section>
  );
}
