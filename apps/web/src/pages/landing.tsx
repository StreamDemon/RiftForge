import { A } from "@solidjs/router";

/** Placeholder — real landing page content is post-M4. */
export function LandingPage() {
  return (
    <main class="p-4">
      <h1 class="text-2xl font-bold">RiftForge</h1>
      <p>Character builder and live sheets for Rifts®.</p>
      <A href="/characters" class="underline">
        Open the character app
      </A>
    </main>
  );
}
