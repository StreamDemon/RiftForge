import { rollPsionics, type PsychicClass } from "@riftforge/rules";
import { For, Show } from "solid-js";
import type { BuilderStore } from "../store.ts";

const CLASSES: { value: PsychicClass; label: string }[] = [
  { value: "ordinary", label: "Not psychic (saves vs psionics at 15+)" },
  { value: "majorOrMinorPsychic", label: "Major or minor psychic (saves at 12+)" },
  { value: "masterPsychic", label: "Master psychic (saves at 10+)" },
];

/** Step 4 (RUE p.289): pick a psychic class, or roll the random table. */
export function PsionicsStep(props: { store: BuilderStore }) {
  const roll = () => {
    const result = rollPsionics();
    props.store.setDraft("psionicsRoll", result);
    props.store.setDraft("psychicClass", result.psychicClass);
  };

  return (
    <section class="space-y-2">
      <h2 class="font-bold">Determine psionics</h2>
      <For each={CLASSES}>
        {(entry) => (
          <label class="block">
            <input
              type="radio"
              name="psychicClass"
              checked={props.store.draft.psychicClass === entry.value}
              onChange={() => props.store.setDraft("psychicClass", entry.value)}
            />{" "}
            {entry.label}
          </label>
        )}
      </For>
      <button type="button" class="border px-2 py-1" onClick={roll}>
        Roll the Random Psionics Table (d%)
      </button>
      <Show when={props.store.draft.psionicsRoll}>
        {(rolled) => (
          <p>
            Rolled {rolled().roll}:{" "}
            {rolled().result === "none" ? "not psychic" : `${rolled().result} psionics`}.
          </p>
        )}
      </Show>
      <p>
        Psionic powers themselves aren't modeled yet (#14) — this sets the save-vs-psionics target
        on the sheet.
      </p>
    </section>
  );
}
