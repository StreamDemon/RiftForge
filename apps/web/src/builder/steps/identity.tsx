import { createSignal, Show } from "solid-js";
import { NarrativeFields } from "../../components/narrative-fields.tsx";
import { Button, MonoLabel, Panel, TextInput } from "../../components/ui.tsx";
import type { BuilderStore } from "../store.ts";

export function IdentityStep(props: { store: BuilderStore }) {
  const [showFile, setShowFile] = createSignal(false);

  return (
    <Panel class="space-y-4 p-5">
      <h2 class="font-display text-2xl tracking-[0.03em]">DECLARE IDENTITY</h2>
      <label class="block max-w-sm space-y-1">
        <MonoLabel>CHARACTER NAME</MonoLabel>
        <TextInput
          class="w-full"
          placeholder="ENTER NAME"
          value={props.store.draft.name}
          onInput={(e) => props.store.setDraft("name", e.currentTarget.value)}
        />
      </label>

      <div class="border-t border-line pt-3">
        <div class="flex items-baseline gap-3">
          <h3 class="font-display text-[15px] tracking-[0.1em] text-muted">// PERSONNEL FILE</h3>
          <MonoLabel class="text-dead">OPTIONAL — AUTHOR: PLAYER</MonoLabel>
          <Button
            variant="ghost"
            class="ml-auto"
            aria-expanded={showFile()}
            aria-controls="personnel-file-fields"
            onClick={() => setShowFile((v) => !v)}
          >
            {showFile() ? "collapse" : "expand"}
          </Button>
        </div>
        <Show
          when={showFile()}
          fallback={
            <p class="mt-1 font-mono text-[12px] text-dead">
              // epithet, appearance, traits, backstory — make the file yours (editable later on the
              dossier)
            </p>
          }
        >
          <div class="mt-3" id="personnel-file-fields">
            <NarrativeFields
              form={props.store.draft.narrative}
              onChange={(field, value) => props.store.setDraft("narrative", field, value)}
            />
          </div>
        </Show>
      </div>
    </Panel>
  );
}
