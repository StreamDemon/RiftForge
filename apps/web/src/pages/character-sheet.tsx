import { api } from "@riftforge/backend/api";
import type { Id } from "@riftforge/backend/dataModel";
import type { CharacterSheet, Narrative } from "@riftforge/rules";
import { useParams } from "@solidjs/router";
import { createEffect, createSignal, Match, on, Show, Switch, type Accessor } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { NarrativeFields } from "../components/narrative-fields.tsx";
import { SheetView } from "../components/sheet-view.tsx";
import { Alert, Button, MonoLabel, Panel } from "../components/ui.tsx";
import { convex } from "../lib/client.ts";
import { createMutation, createQuery } from "../lib/convex.ts";
import { fromNarrative, toNarrative } from "../lib/narrative.ts";

/** Edit the player-authored file fields in place; saves via updateNarrative. */
function NarrativeEditor(props: { id: Id<"characters">; narrative: Narrative | undefined }) {
  const updateNarrative = createMutation(convex, api.characters.updateNarrative);
  const [open, setOpen] = createSignal(false);
  const [form, setForm] = createStore(fromNarrative(props.narrative));
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<Error>();

  // Never carry one character's draft into another's file: reset the form
  // whenever the route id changes, regardless of mount timing.
  createEffect(
    on(
      () => props.id,
      () => {
        setForm(reconcile(fromNarrative(props.narrative)));
        setOpen(false);
        setError(undefined);
      },
      { defer: true },
    ),
  );

  const save = async () => {
    if (saving()) return;
    setError(undefined);
    setSaving(true);
    try {
      await updateNarrative({ id: props.id, narrative: toNarrative({ ...form }) });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel class="p-4">
      <div class="flex items-baseline gap-3">
        <h2 class="font-display text-[17px] tracking-[0.12em] text-muted">
          <span class="text-dead">// </span>EDIT FILE
        </h2>
        <MonoLabel class="text-dead">EPITHET / APPEARANCE / TRAITS / BACKSTORY</MonoLabel>
        <Button
          variant="ghost"
          class="ml-auto"
          aria-expanded={open()}
          aria-controls="edit-file-fields"
          onClick={() => setOpen((v) => !v)}
        >
          {open() ? "close" : "open"}
        </Button>
      </div>
      <Show when={open()}>
        <div class="mt-3 space-y-3" id="edit-file-fields">
          <NarrativeFields form={form} onChange={(field, value) => setForm(field, value)} />
          <div class="flex items-center gap-3">
            <Button variant="primary" disabled={saving()} onClick={() => void save()}>
              {saving() ? "> Writing…" : "> Commit to File"}
            </Button>
            <Show when={error()}>
              {(err) => <Alert tone="danger">WRITE FAILED — {err().message}</Alert>}
            </Show>
          </div>
        </div>
      </Show>
    </Panel>
  );
}

/** The live sheet: `SheetView` fed by the `characters.sheet` subscription. */
export function CharacterSheetPage() {
  const params = useParams<{ id: string }>();
  const id = () => params.id as Id<"characters">;
  const query = createQuery(convex, api.characters.sheet, () => ({ id: id() }));
  // `characters.sheet` validates as `v.any()` (shape owned by @riftforge/rules),
  // so re-pin the rules-layer type here.
  const sheet = query.data as Accessor<CharacterSheet | null | undefined>;
  const rollVitals = createMutation(convex, api.characters.rollVitals);
  const [rollError, setRollError] = createSignal<Error>();

  const roll = async () => {
    setRollError(undefined);
    try {
      await rollVitals({ id: id() });
    } catch (error) {
      setRollError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  return (
    <div class="mx-auto max-w-4xl">
      <Switch fallback={<p class="font-mono text-[12.5px] text-muted">// loading dossier…</p>}>
        <Match when={query.error()}>
          {(err) => <Alert tone="danger">COULDN'T LOAD DOSSIER — {err().message}</Alert>}
        </Match>
        <Match when={sheet() === null}>
          <Alert tone="warn">NO FILE ON RECORD.</Alert>
        </Match>
        <Match when={sheet()}>
          {(s) => (
            <SheetView
              sheet={s()}
              vitalsExtra={
                <div class="mt-3 space-y-2">
                  <Button variant="primary" onClick={() => void roll()}>
                    {"> Roll Vitals"}
                  </Button>
                  <Show when={rollError()}>
                    {(err) => <Alert tone="danger">ROLL FAILED — {err().message}</Alert>}
                  </Show>
                </div>
              }
            />
          )}
        </Match>
      </Switch>
      {/* Outside the keyed Match: live sheet updates (e.g. rolling vitals
          mid-edit) must not remount the editor and wipe typed text. */}
      <Show when={sheet() != null}>
        <div class="mt-4">
          <NarrativeEditor id={id()} narrative={sheet()?.narrative} />
        </div>
      </Show>
    </div>
  );
}
