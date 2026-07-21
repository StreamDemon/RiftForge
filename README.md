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
  src/engine/    pure TypeScript derivation, strike resolution, and spell damage
packages/backend/
  convex/        Convex storage, server-derived sheets, roster queries, mutations,
                 and seeded dice rolls
apps/web/
  src/           SolidJS routes, hand-rolled Convex bindings, builder, and live sheet
```

The engine is isomorphic: the Convex backend derives sheets at query time, and the
client imports the same package for ephemeral rolls. The runtime never parses the
source book. Combat APIs support persisted, server-rolled S.D.C. and M.D. weapon
exchanges through one engine-authorized protocol. The delivered core covers
critical-before-conversion damage, S.D.C./M.D.C. cross-tier routing, S.D.C. armor
A.R. and ablation, intact and depleted M.D.C. armor, final-blast absorption with
no spill, immutable route evidence, atomic body damage, and explicit terminal
death. Legacy S.D.C. exchange history remains readable without migration.
Natural A.R. is intentionally absent per RUE p.339. The optional near-fatal M.D.
injury and survival procedure remains deferred to issue #54, and a generic
page-stamped effects pipeline remains roadmap work in issue #53. Spell APIs expose
load-validated structured damage, derivation, and injected-RNG rolling.

### Current status

The first vertical slice — the **Ley Line Walker** O.C.C. — runs end to end. The web
app includes a landing page (`/`), character roster (`/characters`), guided builder
(`/characters/new`), and live sheet (`/characters/:id`). Characters can manage
inventory and worn armor, take and recover damage, rest, draw P.P.E. from a ley line,
receive treatment, and cast spells through server-validated state changes, while
ephemeral sheet rolls use the shared rules package client-side.

## Development

Tooling is [Vite+](https://viteplus.dev) (`vp`) over a pnpm workspace.

```bash
vp install            # install dependencies
vp run rules#test     # run the rules-engine tests
vp run rules#check    # format + lint + typecheck one package (same for backend#, web#)
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
