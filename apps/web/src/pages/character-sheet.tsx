import { api } from "@riftforge/backend/api";
import type { Id } from "@riftforge/backend/dataModel";
import type { CharacterSheet } from "@riftforge/rules";
import { useParams } from "@solidjs/router";
import { type Accessor, createSignal, Match, Show, Switch } from "solid-js";
import { SheetView } from "../components/sheet-view.tsx";
import { Alert, Button } from "../components/ui.tsx";
import { convex } from "../lib/client.ts";
import { createMutation, createQuery } from "../lib/convex.ts";

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
    </div>
  );
}
