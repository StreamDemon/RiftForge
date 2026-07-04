import { rollPsionics, type PsychicClass } from "@riftforge/rules";
import { For, Show } from "solid-js";
import { Alert, Button, Panel } from "../../components/ui.tsx";
import type { BuilderStore } from "../store.ts";

const CLASSES: { value: PsychicClass; label: string }[] = [
  { value: "ordinary", label: "NOT PSYCHIC — saves vs psionics at 15+" },
  { value: "majorOrMinorPsychic", label: "MAJOR OR MINOR PSYCHIC — saves at 12+" },
  { value: "masterPsychic", label: "MASTER PSYCHIC — saves at 10+" },
];

/** Step 4 (RUE p.289): pick a psychic class, or roll the random table. */
export function PsionicsStep(props: { store: BuilderStore }) {
  const roll = () => {
    const result = rollPsionics();
    props.store.setDraft("psionicsRoll", result);
    props.store.setDraft("psychicClass", result.psychicClass);
  };

  return (
    <Panel class="space-y-3 p-5">
      <h2 class="font-display text-2xl tracking-[0.03em]">DETERMINE PSIONICS</h2>
      <div class="space-y-1.5">
        <For each={CLASSES}>
          {(entry) => (
            <label
              class="block cursor-pointer border p-3 font-mono text-[13px]"
              classList={{
                "border-amber bg-amber/5": props.store.draft.psychicClass === entry.value,
                "border-line bg-inset hover:border-muted":
                  props.store.draft.psychicClass !== entry.value,
              }}
            >
              <input
                type="radio"
                name="psychicClass"
                class="mr-2 accent-amber"
                checked={props.store.draft.psychicClass === entry.value}
                onChange={() => props.store.setDraft("psychicClass", entry.value)}
              />
              {entry.label}
            </label>
          )}
        </For>
      </div>
      <Button onClick={roll}>{"> Roll the Random Psionics Table (d%)"}</Button>
      <Show when={props.store.draft.psionicsRoll}>
        {(rolled) => (
          <Alert tone={rolled().result === "none" ? "warn" : "info"}>
            ROLLED {rolled().roll} ::{" "}
            {rolled().result === "none"
              ? "NOT PSYCHIC"
              : `${rolled().result.toUpperCase()} PSIONICS`}
          </Alert>
        )}
      </Show>
      <p class="font-mono text-[11.5px] text-dead">
        // psionic powers aren't modeled yet (#14) — this sets the save-vs-psionics target
      </p>
    </Panel>
  );
}
