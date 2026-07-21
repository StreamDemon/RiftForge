import { A, useLocation, type RouteSectionProps } from "@solidjs/router";

const NAV = [
  { href: "/characters", label: "> roster", match: /^\/characters$/ },
  { href: "/characters/new", label: "> forge new", match: /^\/characters\/new$/ },
] as const;

/**
 * The terminal chassis (`/characters/...`): title bar, left nav rail, status
 * strip. A character's dossier lights the rail via the catch-all below.
 */
export function AppLayout(props: RouteSectionProps) {
  const location = useLocation();
  const onDossier = () => /^\/characters\/(?!new$)[^/]+$/.test(location.pathname);

  return (
    <div class="flex min-h-screen flex-col">
      <header class="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5">
        <A href="/" class="font-display text-lg tracking-[0.06em]">
          RIFT<span class="text-ley">FORGE</span>
        </A>
        <span class="font-mono text-xs text-muted">
          LEY-LINK: <span class="text-ok">STABLE</span>
        </span>
      </header>

      <div class="flex flex-1 flex-col sm:flex-row">
        <nav class="w-full shrink-0 border-b border-line bg-surface py-4 sm:w-44 sm:border-r sm:border-b-0">
          <div class="px-4 pb-2 font-display text-[13px] tracking-[0.1em] text-muted">SYSTEM</div>
          {NAV.map((item) => (
            <A
              href={item.href}
              class="block border-l-2 px-4 py-2 font-mono text-[12.5px] no-underline"
              classList={{
                "border-amber bg-amber/5 text-amber": item.match.test(location.pathname),
                "border-transparent text-muted hover:text-fg": !item.match.test(location.pathname),
              }}
            >
              {item.label}
            </A>
          ))}
          <span
            class="block border-l-2 px-4 py-2 font-mono text-[12.5px]"
            classList={{
              "border-amber bg-amber/5 text-amber": onDossier(),
              "border-transparent text-dead": !onDossier(),
            }}
          >
            {"> dossier"}
          </span>
          <span class="block border-l-2 border-transparent px-4 py-2 font-mono text-[12.5px] text-dead">
            {"> table [soon]"}
          </span>
        </nav>

        <main class="min-w-0 flex-1 p-4 sm:p-6">{props.children}</main>
      </div>

      <footer class="flex gap-6 border-t border-line bg-surface px-4 py-1.5 font-mono text-[11.5px] text-muted">
        <span>RIFT-OS v0.9 // RECOVERED HARDWARE</span>
        <span>
          RULES: RUE <span class="text-ok">LOADED</span>
        </span>
      </footer>
    </div>
  );
}
