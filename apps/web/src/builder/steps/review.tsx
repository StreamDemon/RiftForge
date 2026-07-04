import { Show } from "solid-js";
import { SheetView } from "../../components/sheet-view.tsx";
import type { BuilderStore } from "../store.ts";

/**
 * The payoff of the isomorphic engine: the exact sheet this character will
 * have, derived client-side before anything is stored.
 */
export function ReviewStep(props: { store: BuilderStore }) {
  return (
    <section class="space-y-2">
      <h2 class="font-bold">Review</h2>
      <Show
        when={props.store.preview().sheet}
        fallback={<p>Not derivable yet: {props.store.preview().error}</p>}
      >
        {(sheet) => (
          <>
            <p>
              This is the live sheet as it will derive — vitals show ranges until you roll them on
              the sheet page.
            </p>
            <SheetView sheet={sheet()} />
          </>
        )}
      </Show>
    </section>
  );
}
