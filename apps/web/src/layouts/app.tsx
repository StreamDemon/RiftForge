import { A, type RouteSectionProps } from "@solidjs/router";

/** Shell for the character app (`/characters/...`). Visual design lands in #10. */
export function AppLayout(props: RouteSectionProps) {
  return (
    <div class="min-h-screen">
      <header class="border-b p-4">
        <nav class="flex gap-4">
          <A href="/">RiftForge</A>
          <A href="/characters">Characters</A>
        </nav>
      </header>
      <main class="p-4">{props.children}</main>
    </div>
  );
}
