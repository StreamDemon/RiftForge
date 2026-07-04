import { initialSpellChoices } from "@riftforge/rules";
import { createMemo, For, Show } from "solid-js";
import { Alert, Panel } from "../../components/ui.tsx";
import type { BuilderStore } from "../store.ts";

/** Initial spell knowledge (e.g. LLW: three from each of spell levels 1-4). */
export function SpellsStep(props: { store: BuilderStore }) {
  const choices = createMemo(() => {
    const occ = props.store.occ();
    return occ ? initialSpellChoices(occ) : [];
  });

  const toggle = (spellId: string, levelIds: Set<string>, max: number) => {
    const current = props.store.draft.spellIds;
    if (current.includes(spellId)) {
      props.store.setDraft(
        "spellIds",
        current.filter((id) => id !== spellId),
      );
      return;
    }
    if (current.filter((id) => levelIds.has(id)).length >= max) return;
    props.store.setDraft("spellIds", [...current, spellId]);
  };

  return (
    <Panel class="space-y-4 p-5">
      <h2 class="font-display text-2xl tracking-[0.03em]">INITIAL SPELL KNOWLEDGE</h2>
      <Show
        when={choices().length > 0}
        fallback={
          <p class="font-mono text-[12.5px] text-dead">// this O.C.C. has no initial spells</p>
        }
      >
        <div class="grid gap-x-8 gap-y-4 md:grid-cols-2">
          <For each={choices()}>
            {(choice) => {
              const levelIds = new Set(choice.options.map((s) => s.id));
              const picked = () =>
                props.store.draft.spellIds.filter((id) => levelIds.has(id)).length;
              return (
                <div>
                  <h3 class="font-display text-[15px] tracking-[0.1em] text-muted">
                    // LEVEL {choice.level} — PICK {choice.choose}{" "}
                    <span
                      classList={{
                        "text-ok": picked() === choice.choose,
                        "text-amber": picked() !== choice.choose,
                      }}
                    >
                      [{picked()}/{choice.choose}]
                    </span>
                  </h3>
                  <div class="mt-1 space-y-0.5">
                    <For each={choice.options}>
                      {(spell) => (
                        <label class="flex cursor-pointer items-center gap-2 font-mono text-[13px] hover:text-amber">
                          <input
                            type="checkbox"
                            class="accent-amber"
                            checked={props.store.draft.spellIds.includes(spell.id)}
                            onChange={() => toggle(spell.id, levelIds, choice.choose)}
                          />
                          {spell.name}{" "}
                          <span class="text-ley [text-shadow:0_0_8px_rgb(79_216_255/0.4)]">
                            {spell.ppe} PPE
                          </span>
                        </label>
                      )}
                    </For>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
      <Show when={props.store.spellErrors().length > 0}>
        <div class="space-y-1.5">
          <For each={props.store.spellErrors()}>
            {(error) => <Alert tone="warn">{error.toUpperCase()}</Alert>}
          </For>
        </div>
      </Show>
    </Panel>
  );
}
