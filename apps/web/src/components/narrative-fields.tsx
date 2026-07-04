import { For } from "solid-js";
import type { NarrativeForm } from "../lib/narrative.ts";
import { MonoLabel, TextInput } from "./ui.tsx";

// maxLength mirrors the rules-layer schema caps so writes can't be rejected
// for length (appearanceSchema / narrativeSchema in @riftforge/rules).
const APPEARANCE_FIELDS = [
  ["height", "HEIGHT", 40],
  ["weight", "WEIGHT", 40],
  ["age", "AGE", 40],
  ["eyes", "EYES", 80],
  ["origin", "ORIGIN", 120],
  ["disposition", "DISPOSITION", 120],
] as const satisfies readonly (readonly [keyof NarrativeForm, string, number])[];

/** 12 traits × 60 chars + separators — the schema's worst legal case. */
const TRAITS_INPUT_MAX = 12 * 60 + 11 * 2;

/**
 * The player-authored identity fields — shared by the wizard's identity step
 * and the dossier's edit panel. All optional: story, not mechanics.
 */
export function NarrativeFields(props: {
  form: NarrativeForm;
  onChange: <K extends keyof NarrativeForm>(field: K, value: string) => void;
}) {
  return (
    <div class="space-y-3">
      <label class="block space-y-1">
        <MonoLabel>EPITHET — one line under the name</MonoLabel>
        <TextInput
          class="w-full"
          maxLength={200}
          placeholder='"The ley lines whisper, and she whispers back."'
          value={props.form.epithet}
          onInput={(e) => props.onChange("epithet", e.currentTarget.value)}
        />
      </label>
      <div class="grid grid-cols-2 gap-2 md:grid-cols-3">
        <For each={APPEARANCE_FIELDS}>
          {([field, label, max]) => (
            <label class="block space-y-1">
              <MonoLabel>{label}</MonoLabel>
              <TextInput
                class="w-full"
                maxLength={max}
                value={props.form[field]}
                onInput={(e) => props.onChange(field, e.currentTarget.value)}
              />
            </label>
          )}
        </For>
      </div>
      <label class="block space-y-1">
        <MonoLabel>TRAITS — comma-separated, up to 12 (60 chars each)</MonoLabel>
        <TextInput
          class="w-full"
          maxLength={TRAITS_INPUT_MAX}
          placeholder="Magic Zone survivor, Coalition watchlist, D-Bee sympathizer"
          value={props.form.traits}
          onInput={(e) => props.onChange("traits", e.currentTarget.value)}
        />
      </label>
      <label class="block space-y-1">
        <MonoLabel>BACKSTORY — your words, the machine won't touch them</MonoLabel>
        <textarea
          rows={6}
          maxLength={20_000}
          class="notch-8 w-full border border-line bg-noir px-3 py-2 font-narrative text-[14px] text-fg placeholder:text-dead focus:border-amber"
          placeholder="She walked out of the Magic Zone on her fourteenth birthday…"
          value={props.form.backstory}
          onInput={(e) => props.onChange("backstory", e.currentTarget.value)}
        />
      </label>
    </div>
  );
}
