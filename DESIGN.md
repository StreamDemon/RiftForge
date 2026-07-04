# Design System — RiftForge

**"Ley Terminal"** — a AAA character screen running on a salvaged pre-Rifts CRT.
Cyberpunk 2077's angular HUD language, Fallout's phosphor-and-grime, Watchmen's noir dread.
Your character isn't a form. It's a save file with a soul.

## Product Context

- **What this is:** Character builder + live character sheet for the Rifts TTRPG (Palladium Books) — "D&D Beyond for Rifts." Live data everywhere: dice rolls and derived stats stream in over Convex subscriptions.
- **Who it's for:** Rifts players — nostalgic 90s TTRPG fans and new players.
- **Space/industry:** Digital TTRPG tools. Peers: D&D Beyond, Demiplane, Alchemy RPG — all ship dark *cinematic fantasy* (painted art, portals, glow). None own a technical/HUD language. That's our lane.
- **Project type:** Dark-mode-first web app (SolidJS + Tailwind v4). Surfaces: builder wizard, live sheet, roster; future landing page (`/`) and VTT (`/table/:id`).
- **The memorable thing:** *A AAA game character screen on a salvaged CRT — gritty tech-magic rendered with heirloom care. Users own their characters.*

## Aesthetic Direction

- **Direction:** Industrial/utilitarian AAA game HUD — CP2077 angles × Fallout phosphor × Watchmen noir.
- **Decoration level:** Intentional — CRT scanlines + vignette overlay on the chassis, subtle grunge/noise on panels, glitch chromatic-aberration accents on display type. No fog, no blobs, no glassmorphism.
- **Mood:** Dense, legible, dangerous. The terminal is old, recovered, and running software it was never meant to run.
- **Hard rule — zero painted fantasy art.** Schematic linework, halftone, and typography carry all flavor. This is the loudest anti-D&D-Beyond signal available.
- **Reference points:** CP2077 character/inventory screens (angular panels, notched corners), Fallout Pip-Boy (phosphor mono telemetry), Watchmen (noir chassis, blood-red punctuation).

## Typography

| Role | Font | Why |
|---|---|---|
| **Display / headers** | Staatliches | Condensed industrial stencil caps — Coalition-propaganda flavor. Discipline required: headers and badges only, never body. |
| **HUD chrome / labels / buttons** | Chakra Petch | Squared game-HUD sans; the machine's interface voice. 400/500/600/700. |
| **The human voice** | IBM Plex Serif | Reserved EXCLUSIVELY for player-authored content: backstory, epithet, lore quotes. Your words look different from the machine's. Italic for epithets. |
| **Stats / numbers** | Martian Mono | Every attribute, vital, percentage, and modifier. Chunky, wide, mechanical. Numbers are the heroes. 400/600/800. |
| **Telemetry / terminal log** | IBM Plex Mono | The streaming voice of the websocket: `> ROLL 3d6 :: [5][6][3] = 14 → P.E. 14 LOCKED`. |

- **Loading:** Google Fonts (all free), self-host later for prod. `family=Staatliches&family=Chakra+Petch:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&family=Martian+Mono:wght@400;600;800`
- **Scale:** 11.5px mono captions · 13px HUD labels · 15px body · 18–20px panel data · 26px section headers (Staatliches) · 44–64px character name · 84px brand. Line-height 1.55 body, 0.9–0.95 display.

## Color

**Approach:** Restrained phosphor monochrome + two punctuation colors. One warm family reads as one physical machine.

### Chassis (noir)
- **Background:** `#0B0D0F`
- **Surface (panels):** `#14181C` · **Inset:** `#1B2127` · **Hairline borders:** `#2C343B`
- **Primary text:** `#E6ECEF` · **Muted:** `#7E8A92` · **Dead/disabled:** `#40484F`
- **Rust / worn metal trim:** `#A87932`

### Signals (meaning, not decoration)
- **Phosphor amber `#FFAE3D`** — the machine's voice: primary actions, focus rings, prompts, warnings, locked rolls.
- **Ley amber `#C9821F`** (deep amber) — magic & live data: P.P.E., spell strength, streaming values, live indicators, portrait linework. *Bright amber = the machine speaks; deep amber = the magic hums.*
- **Blood red `#E23B2E`** — damage, dread, failed requirements, alignment badges. (Text-on-dark variant: `#FF6A5E`.)
- **Confirmed green `#57E389`** — legal builds, passing checks, stable sync.

### Rules
- Color is semantic. Nothing is colored for decoration; if it glows, it means something.
- Glows are real: signal values on dark get a matching `text-shadow`/`box-shadow` at 25–60% alpha.
- Dark mode IS the product. No light theme; print/export styling may come later.

## Spacing

- **Base unit:** 4px. **Density:** compact — this is an instrument, not a brochure.
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout

- **Approach:** Grid-disciplined app shell under hard asymmetric composition. Never centered-everything.
- **Character screen composition (ownership first):** identity band on top (portrait frame · name/epithet/traits · physicals · alignment badge), HUD stat modules below, telemetry rail on the right.
- **Wizard composition:** steps as a boot/mission sequence (`▸ 04/09 :: DECLARE ALIGNMENT`), not checkout dots.
- **Panels:** notched corners via `clip-path` (12px notch on panels, 8px on buttons/inputs, 6px on chips) — **no border-radius anywhere**. Each panel gets a 1px hairline border and an amber top-edge gradient accent.
- **Max content width:** 1240px. Telemetry rail ~300px. Portrait frame 210×240.
- **Vitals as resource bars:** H.P. (blood gradient), S.D.C. (amber gradient), P.P.E. (ley gradient + glow), with `current / max` in Martian Mono.

## Motion

- **Approach:** Intentional. The machine responds; it does not perform.
- **Signature moves:** dot-matrix strike flash when a live stat updates (brief deep-amber underprint); phosphor cursor blink in the telemetry log; scanline reveal on sheet load; occasional 1-frame glitch offset on Staatliches display type (hover/entrance only).
- **Bans:** no 3D dice, no particle systems, no parallax fantasy scenes. Rolls are telemetry, not theater.
- **Easing:** enter `ease-out`, exit `ease-in`, move `ease-in-out`. **Durations:** micro 50–100ms · short 150–250ms · medium 250–400ms · long 400–700ms.
- **Libraries:** solid-motionone for transitions; Lenis only if smooth scroll earns its keep; three.js reserved for the landing page ley-line scene and future VTT — not the app shell.
- Respect `prefers-reduced-motion`: glitch and flash effects collapse to opacity fades.

## Character Ownership (spec for #10+)

Users must be able to **own** their characters. New optional, player-authored fields (schema + backend + wizard/sheet):

- `epithet` — one-line quote/tagline, rendered in Plex Serif italic under the name.
- `appearance` — height, weight, age, eyes, origin, disposition (mono readout block).
- `traits` — short label chips (e.g. "MAGIC ZONE SURVIVOR", "COALITION WATCHLIST"); notched chip styling.
- `backstory` — long-form prose, rendered in the Plex Serif "PERSONNEL FILE — NARRATIVE" panel. Optional redaction styling (`█████`) as a flavor affordance.
- `portrait` — image upload (future; frame ships first with schematic-silhouette placeholder: "NO IMAGE ON FILE — UPLOAD").

All optional; the identity band renders gracefully when empty. The rules engine ignores these fields — they are narrative, not mechanics.

## Voice & Microcopy

- The terminal speaks in mono uppercase: `LEY-LINK: STABLE`, `BUILD LEGAL — 26 SKILLS RESOLVED`, `P.E. 9 — REQUIREMENT NOT MET`.
- File/serial flavor: characters get a display serial (`FILE № RF-0447-K`).
- Never cutesy. The machine is terse; the player's serif voice is the only warmth.

## Anti-Slop (hard bans)

Purple gradients · 3-column icon grids · centered hero/paragraph/CTA stacks · glassmorphism · decorative blobs/orbs/nebulae · uniform bubbly border-radius (no border-radius at all — notches only) · painted fantasy splash art · stock-photo heroes · Inter/Roboto/system-ui anywhere.

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-04 | Initial system created by /design-consultation | Research (D&D Beyond, Demiplane, Alchemy) + two independent outside voices (Codex, Claude subagent) converged on terminal/dossier direction; user brief: gritty tech-magic × premium artifact. |
| 2026-07-04 | Pivot from "paper dossier artifact" (v1) to AAA HUD "Ley Terminal" (v2) | User direction: CP2077 × Fallout × Watchmen; keep terminal + CRT. Paper dossier concept retired (may return as print/export view someday). |
| 2026-07-04 | Ownership-first identity band + optional narrative fields | User: "users need to own their characters" — epithet/appearance/traits/backstory/portrait spec'd for #10+. |
| 2026-07-04 | Ley cyan `#4FD8FF` → deep ley amber `#C9821F` | User call: full phosphor monochrome. Magic vs machine is now brightness, not hue — tighter, more period-correct CRT. |
