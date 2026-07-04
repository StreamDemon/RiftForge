import { MonoLabel, Panel, TextInput } from "../../components/ui.tsx";
import type { BuilderStore } from "../store.ts";

export function IdentityStep(props: { store: BuilderStore }) {
  return (
    <Panel class="space-y-3 p-5">
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
    </Panel>
  );
}
