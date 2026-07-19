import { createEffect, For, on, type JSX } from "solid-js";
import type { TelemetryEntry, TelemetryTone } from "../lib/telemetry.ts";

const toneClass: Record<TelemetryTone, string> = {
  machine: "text-amber",
  magic: "text-ley",
  good: "text-ok",
  bad: "text-blood-text",
  dim: "text-dead",
};

/**
 * The right-hand field-telemetry band (DESIGN.md): rolls print here like
 * incoming field data, with quick actions below.
 */
export function TelemetryRail(props: { entries: TelemetryEntry[]; actions?: JSX.Element }) {
  let logEl: HTMLDivElement | undefined;

  // Follow the feed: newest entry scrolls into view as it prints.
  createEffect(
    on(
      () => props.entries.length,
      () => logEl?.scrollTo({ top: logEl.scrollHeight }),
      { defer: true },
    ),
  );

  return (
    <section class="flex min-h-0 flex-col gap-2.5" aria-label="Field telemetry">
      <h2 class="font-display text-[15px] tracking-[0.12em] text-muted">
        <span class="text-dead">// </span>FIELD TELEMETRY
      </h2>
      <div
        ref={(el) => (logEl = el)}
        role="log"
        class="max-h-[420px] min-h-[220px] flex-1 overflow-y-auto border border-line bg-noir p-3 font-mono text-[11.5px] leading-[1.95]"
      >
        <For each={props.entries}>
          {(entry) => <div class={toneClass[entry.tone]}>{entry.text}</div>}
        </For>
        <div class="cursor-blink text-amber" aria-hidden="true">
          █
        </div>
      </div>
      {props.actions}
    </section>
  );
}
