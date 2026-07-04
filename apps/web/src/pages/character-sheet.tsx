import { api } from "@riftforge/backend/api";
import type { Id } from "@riftforge/backend/dataModel";
import type { CharacterSheet } from "@riftforge/rules";
import { useParams } from "@solidjs/router";
import { type Accessor, createSignal, Match, Show, Switch } from "solid-js";
import { SheetView } from "../components/sheet-view.tsx";
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
    <Switch fallback={<p>Loading…</p>}>
      <Match when={query.error()}>
        {(err) => <p>Couldn't load this character: {err().message}</p>}
      </Match>
      <Match when={sheet() === null}>
        <p>No such character.</p>
      </Match>
      <Match when={sheet()}>
        {(s) => (
          <SheetView
            sheet={s()}
            vitalsExtra={
              <>
                <button type="button" class="mt-2 border px-2 py-1" onClick={() => void roll()}>
                  Roll vitals
                </button>
                <Show when={rollError()}>
                  {(err) => <p>Couldn't roll vitals: {err().message}</p>}
                </Show>
              </>
            }
          />
        )}
      </Match>
    </Switch>
  );
}
