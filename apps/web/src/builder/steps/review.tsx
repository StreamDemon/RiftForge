import { Show } from "solid-js";
import { SheetView } from "../../components/sheet-view.tsx";
import { Alert, MonoLabel } from "../../components/ui.tsx";
import type { BuilderStore } from "../store.ts";

/**
 * The payoff of the isomorphic engine: the exact sheet this character will
 * have, derived client-side before anything is stored.
 */
export function ReviewStep(props: { store: BuilderStore }) {
  return (
    <section class="space-y-3" aria-labelledby="review-heading">
      <h2 id="review-heading" class="font-display text-2xl tracking-[0.03em]">
        REVIEW
      </h2>
      <Show
        when={props.store.preview().sheet}
        fallback={<Alert tone="danger">NOT DERIVABLE YET — {props.store.preview().error}</Alert>}
      >
        {(sheet) => (
          <>
            <MonoLabel>
              // PRE-FORGE PREVIEW — vitals show ranges until rolled on the dossier
            </MonoLabel>
            <SheetView sheet={sheet()} />
          </>
        )}
      </Show>
    </section>
  );
}
