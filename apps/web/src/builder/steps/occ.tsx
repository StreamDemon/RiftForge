import { meetsAttributeRequirements, occRegistry } from "@riftforge/rules";
import { For, Show } from "solid-js";
import { Alert, MonoLabel, Panel } from "../../components/ui.tsx";
import type { BuilderStore } from "../store.ts";

/** Step 5 (RUE p.289): pick an O.C.C., gated on its attribute requirements. */
export function OccStep(props: { store: BuilderStore }) {
  const occs = Object.values(occRegistry);
  const check = (occ: (typeof occs)[number]) => {
    const attrs = props.store.attributeTotals();
    return attrs ? meetsAttributeRequirements(occ, attrs) : undefined;
  };

  return (
    <Panel class="space-y-3 p-5">
      <h2 class="font-display text-2xl tracking-[0.03em]">DECLARE O.C.C.</h2>
      <For each={occs}>
        {(occ) => (
          <label
            class="block cursor-pointer border p-4"
            classList={{
              "border-amber bg-amber/5": props.store.draft.occId === occ.id,
              "border-line bg-inset hover:border-muted": props.store.draft.occId !== occ.id,
            }}
          >
            <div class="flex items-baseline gap-3">
              <input
                type="radio"
                name="occ"
                class="accent-amber"
                checked={props.store.draft.occId === occ.id}
                onChange={() => props.store.setDraft("occId", occ.id)}
              />
              <span class="font-display text-xl tracking-[0.03em]">{occ.name}</span>
              <MonoLabel>{occ.category}</MonoLabel>
            </div>
            <Show when={occ.description}>
              <p class="mt-1 text-[13.5px] text-muted">{occ.description}</p>
            </Show>
            <p class="mt-2 font-mono text-[12px] text-muted">
              REQUIRES:{" "}
              {occ.attributeRequirements.map((r) => `${r.code} ${r.min}+`).join(", ") || "NOTHING"}
            </p>
            <Show when={check(occ)}>
              {(result) => (
                <Show
                  when={result().ok}
                  fallback={
                    <Alert tone="danger" class="mt-2">
                      NOT QUALIFIED:{" "}
                      {result()
                        .failures.map((f) => `${f.code} ${f.actual} (NEEDS ${f.min})`)
                        .join(", ")}{" "}
                      — REROLL ATTRIBUTES TO QUALIFY
                    </Alert>
                  }
                >
                  <Alert tone="ok" class="mt-2">
                    REQUIREMENTS MET — O.C.C. UNLOCKED
                  </Alert>
                </Show>
              )}
            </Show>
          </label>
        )}
      </For>
    </Panel>
  );
}
