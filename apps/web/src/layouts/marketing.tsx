import type { RouteSectionProps } from "@solidjs/router";

/** Shell for the public-facing pages (`/`). Landing page content lands post-M4. */
export function MarketingLayout(props: RouteSectionProps) {
  return <div class="min-h-screen">{props.children}</div>;
}
