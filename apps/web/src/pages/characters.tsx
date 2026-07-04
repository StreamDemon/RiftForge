import { api } from "@riftforge/backend/api";
import { A } from "@solidjs/router";
import { For, Match, Switch } from "solid-js";
import { Alert, MonoLabel, Panel, SectionTitle } from "../components/ui.tsx";
import { convex } from "../lib/client.ts";
import { createQuery } from "../lib/convex.ts";

/** The character roster; new characters come from the builder wizard (#9). */
export function CharactersPage() {
  const characters = createQuery(convex, api.characters.list, {});

  return (
    <div class="mx-auto max-w-3xl space-y-5">
      <div class="flex items-end justify-between">
        <div>
          <MonoLabel>PERSONNEL INDEX</MonoLabel>
          <h1 class="font-display text-4xl tracking-[0.02em]">ROSTER</h1>
        </div>
        <A
          href="/characters/new"
          class="notch-8 bg-amber px-5 py-2 font-hud text-[13px] font-bold uppercase tracking-[0.08em] text-[#191104] no-underline hover:brightness-110"
        >
          Forge new
        </A>
      </div>

      <Switch fallback={<p class="font-mono text-[12.5px] text-muted">// loading…</p>}>
        <Match when={characters.error()}>
          {(err) => <Alert tone="danger">COULDN'T LOAD ROSTER — {err().message}</Alert>}
        </Match>
        <Match when={characters.data()}>
          {(list) => (
            <Panel class="p-4">
              <SectionTitle>ACTIVE FILES</SectionTitle>
              <ul class="mt-3">
                <For
                  each={list()}
                  fallback={
                    <li class="font-mono text-[12.5px] text-dead">
                      // no files on record — forge one
                    </li>
                  }
                >
                  {(character) => (
                    <li class="border-b border-line/60 last:border-b-0">
                      <A
                        href={`/characters/${character._id}`}
                        class="flex items-baseline justify-between px-2 py-2.5 no-underline hover:bg-inset"
                      >
                        <span class="font-display text-xl tracking-[0.03em] text-fg">
                          {character.name}
                        </span>
                        <span class="font-mono text-[11.5px] text-muted">
                          LVL {character.level} //{" "}
                          {character.occId.toUpperCase().replaceAll("-", " ")}
                        </span>
                      </A>
                    </li>
                  )}
                </For>
              </ul>
            </Panel>
          )}
        </Match>
      </Switch>
    </div>
  );
}
