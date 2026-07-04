import { api } from "@riftforge/backend/api";
import { A, useNavigate } from "@solidjs/router";
import { For, Show } from "solid-js";
import { vesper } from "../dev/vesper.ts";
import { convex } from "../lib/client.ts";
import { createMutation, createQuery } from "../lib/convex.ts";

/** Dev-grade character list: roster + a seed button until the builder (#9). */
export function CharactersPage() {
  const characters = createQuery(convex, api.characters.list, {});
  const create = createMutation(convex, api.characters.create);
  const navigate = useNavigate();

  const seedVesper = async () => {
    const id = await create(vesper);
    navigate(`/characters/${id}`);
  };

  return (
    <section class="space-y-4">
      <h1 class="text-xl font-bold">Characters</h1>
      <button type="button" class="border px-2 py-1" onClick={() => void seedVesper()}>
        Create Vesper (dev seed)
      </button>
      <Show when={characters()} fallback={<p>Loading…</p>}>
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
      </Show>
    </section>
  );
}
