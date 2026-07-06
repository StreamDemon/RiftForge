<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Design System

Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there
(the "Ley Terminal" system). Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Workflow

- Branch → PR → Cubic AI review → the human maintainer merges. `main` is
  protected; never commit to it directly, and never merge PRs yourself.
- **No AI attribution anywhere on this repo**: no generated-with footers in
  PRs or issues, no Co-Authored-By/attribution trailers in commits.
- Treat every Cubic finding honestly: reproduce/validate it first. If real,
  fix the ROOT CAUSE (the whole bug class, not the flagged instance) and
  reply describing what you found; if invalid, explain why with evidence.
  Cubic re-reviews on every push — iterate until clean.
- Checkpoint-commit long work (e.g. content transcription) every few units
  so partial progress survives.

## Definition of done

- `vp check` and `vp test` clean from the root (root `vp test` runs every
  package's Vitest project).
- Rules changes assert against printed book values, with the page cited in
  content JSON (`page` = printed page number) and exercised in tests.
- User-visible changes are verified LIVE in the browser (roll vitals, deal
  damage, cast, navigate between characters) — tests alone don't count.
  Watch for the navigation-state bug class: param routes don't remount, so
  per-character state must reset on id change, and async guards need
  ownership tokens, not booleans.

## Rules-content fidelity (the heart of the project)

- Every mechanic comes from the rulebook, transcribed from rendered pages —
  NEVER from memory of the Rifts rules, which is unreliable on specifics
  (printed costs, dice, page numbers). If memory and the page disagree, the
  page wins.
- The rulebook PDF lives at `docs/rules/` (gitignored, local-only). It is a
  scanned book with NO text layer — text extraction returns garbage. Use
  the vision pipeline in docs/rules/TRANSCRIPTION.md, with sections indexed
  in docs/rules/PAGE_MAP.md.
- Engine functions return raw book amounts and stay pure and deterministic
  (dice rolls and elapsed time are INPUTS). Clamping and validation live at
  the write: the backend revalidates every mutation through `deriveSheet`,
  so illegal states are unstorable rather than defensively handled.
- When a printed mechanic doesn't fit the schema, extend the schema (with
  refinements that reject contradictions at content-load time) instead of
  flattening the rule into prose.

## Dev loop

- Local Convex: `pnpm exec convex dev` in packages/backend (anonymous LOCAL
  deployment; always `pnpm exec`, never npx). Stop it before pulls — it
  rewrites `convex/_generated`. Killing the CLI can orphan
  `convex-local-backend` on port 3210 with STALE functions still serving;
  kill that process before restarting.
- Web: `vp dev` in apps/web, then verify at localhost:5173.
- Seed test data: `pnpm exec convex run characters:create '{...}'` in
  packages/backend (the CLI may crash with a libuv assertion AFTER the
  mutation succeeds — a returned id means it worked).
