import { A } from "@solidjs/router";
import { MonoLabel } from "../components/ui.tsx";

/** Placeholder — real landing page content (three.js ley-line scene) is post-M4. */
export function LandingPage() {
  return (
    <main class="flex min-h-screen flex-col items-start justify-center px-10 md:px-24">
      <MonoLabel>SYS 09.2 // LEY-LINK ACTIVE</MonoLabel>
      <h1 class="mt-3 font-display text-7xl leading-[0.9] tracking-[0.02em] md:text-8xl">
        RIFT<span class="text-ley">FORGE</span>
      </h1>
      <p class="mt-4 max-w-md text-muted">
        Character builder and live sheets for Rifts®. A salvaged terminal running arcane software —
        your character is a save file with a soul.
      </p>
      <A
        href="/characters"
        class="notch-8 mt-8 inline-block bg-amber px-6 py-2.5 font-hud text-[13px] font-bold uppercase tracking-[0.08em] text-[#191104] no-underline hover:brightness-110"
      >
        Boot the terminal
      </A>
      <p class="mt-16 font-mono text-[10px] tracking-[0.12em] text-dead">
        RIFT-OS v0.9 // RECOVERED HARDWARE // PROPERTY UNKNOWN
      </p>
    </main>
  );
}
