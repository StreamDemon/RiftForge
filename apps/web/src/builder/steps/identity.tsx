import type { BuilderStore } from "../store.ts";

export function IdentityStep(props: { store: BuilderStore }) {
  return (
    <section class="space-y-2">
      <h2 class="font-bold">Who are you?</h2>
      <label>
        Character name{" "}
        <input
          type="text"
          class="border px-2 py-1"
          value={props.store.draft.name}
          onInput={(e) => props.store.setDraft("name", e.currentTarget.value)}
        />
      </label>
    </section>
  );
}
