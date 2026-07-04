import { api } from "@riftforge/backend/api";
import { A } from "@solidjs/router";
import { For, Match, Switch } from "solid-js";
import { convex } from "../lib/client.ts";
import { createQuery } from "../lib/convex.ts";

/** The character roster; new characters come from the builder wizard (#9). */
export function CharactersPage() {
  const characters = createQuery(convex, api.characters.list, {});

  return (
    <section class="space-y-4">
      <h1 class="text-xl font-bold">Characters</h1>
      <A href="/characters/new" class="inline-block border px-2 py-1">
        New character
      </A>
      <Switch fallback={<p>Loading…</p>}>
        <Match when={characters.error()}>
          {(err) => <p>Couldn't load characters: {err().message}</p>}
        </Match>
        <Match when={characters.data()}>
          {(list) => (
            <ul class="list-disc pl-6">
              <For each={list()} fallback={<li>No characters yet.</li>}>
                {(character) => (
                  <li>
                    <A href={`/characters/${character._id}`} class="underline">
                      {character.name}
                    </A>{" "}
                    — level {character.level} {character.occId}
                  </li>
                )}
              </For>
            </ul>
          )}
        </Match>
      </Switch>
    </section>
  );
}
