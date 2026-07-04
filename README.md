# RiftForge

A smart character builder and interactive character sheet for the **Rifts®** TTRPG
(Palladium Books, _Rifts Ultimate Edition_) — think "D&D Beyond, but for Rifts."

Two halves:

1. **Guided builder** — a step-by-step wizard that walks you from a blank slate to a
   rules-legal character, enforcing the rules as you go.
2. **Live character sheet** — roll saves, attacks, skill checks, and damage with every
   modifier already derived from the build.

## Architecture

The hard part isn't the web app — it's encoding the game rules. Those live in a
standalone, framework-agnostic package so they can be validated and tested in isolation:

```
packages/rules/
  src/content/   rules as page-stamped JSON (transcribed from the rulebook)
  src/schema/    Zod schemas that validate the content at load
  src/engine/    pure TypeScript that derives every number (no backend, no UI)
packages/backend/
  convex/        Convex backend: character storage, derived-sheet + roster queries,
                 seeded dice rolls (rollVitals)
apps/web/
  src/           SolidJS app: routing, hand-rolled Convex bindings, live sheet
```

The engine is isomorphic: the Convex backend derives sheets at query time, and the
client imports the same package for ephemeral rolls. The runtime never parses the
source book.

### Current status

First vertical slice — the **Ley Line Walker** O.C.C. — runs end to end: attributes →
O.C.C. → P.P.E. → combat/HP → skills → spells, stored in Convex and rendered live at
`/characters/:id`. The guided builder and sheet visual design are next.

## Development

Tooling is [Vite+](https://viteplus.dev) (`vp`) over a pnpm workspace.

```bash
vp install            # install dependencies
vp run rules#test     # run the rules-engine tests
vp run rules#check    # format + lint + typecheck (also backend#/web#)
vp run ready          # check + test + build across the workspace

vp run backend#dev    # local anonymous Convex deployment (http://127.0.0.1:3210)
vp run web#dev        # SolidJS dev server, pointed at the local deployment
```

## Source material

The `Rifts Ultimate Edition` rulebook PDF is **not** committed (it's copyrighted by
Palladium Books); it lives locally under `docs/rules/` and is git-ignored.
`docs/rules/PAGE_MAP.md` indexes where each rule is transcribed from.

## License & intellectual property

The RiftForge **software** — the code, schemas, and engine — is licensed under the
[MIT License](LICENSE).

The **Rifts® game rules content** transcribed from _Rifts® Ultimate Edition_ (the data
under `packages/rules/src/content/` and `docs/`) is **© Palladium Books Inc.** and is
**not** covered by the MIT license. Rifts® is a registered trademark of Kevin Siembieda
and Palladium Books Inc. That content is included here for personal reference only and
is not licensed for redistribution. RiftForge is an unofficial, fan-made project and is
not affiliated with or endorsed by Palladium Books.
