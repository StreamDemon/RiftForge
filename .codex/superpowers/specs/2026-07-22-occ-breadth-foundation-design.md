# O.C.C. Breadth Foundation and Coalition Grunt Design

**Date:** 2026-07-22

**Status:** Approved; #60 foundation implemented on PR #63, later phases not started

**Design branch:** `docs/occ-breadth-foundation-design`

**Umbrella issue:** [#12 — Additional O.C.C.s beyond the Ley Line Walker](https://github.com/StreamDemon/RiftForge/issues/12)

**Delivery issues:** [#60](https://github.com/StreamDemon/RiftForge/issues/60) -> [#61](https://github.com/StreamDemon/RiftForge/issues/61) -> [#62](https://github.com/StreamDemon/RiftForge/issues/62) -> [#57](https://github.com/StreamDemon/RiftForge/issues/57)

## Goal

Establish Coalition Grunt as RiftForge's second complete playable O.C.C. and
prove that the Ley Line Walker vertical generalizes without pulling power armor,
augmentation, playable Psi-Stalkers, or a full psionics system into the same
delivery.

The work is deliberately split into three reusable prerequisites followed by a
focused integration:

1. species identity and O.C.C. eligibility;
2. authoritative skill legality and additive physical S.D.C.;
3. structured starting loadouts and atomic provisioning; and
4. Coalition Grunt content and end-to-end integration.

Each prerequisite ships through its own branch and pull request. The next slice
does not start until the preceding PR is merged by the human maintainer, local
`main` is synchronized, dependencies are installed, and the repository gates
pass. The split changes delivery order, not the final acceptance standard.

## Approved decisions

1. **Foundation first.** Coalition Grunt is the first new O.C.C.; Glitter Boy
   and Juicer follow only after the shared foundation and Grunt integration.
2. **Separate prerequisite PRs.** Issues #60, #61, #62, and #57 are independently
   reviewable and merge sequentially.
3. **Human is the compatibility species.** Human is playable and the default
   identity for legacy records. Psi-Stalker is recorded only as deferred Grunt
   eligibility.
4. **Choices, not bonuses, cross the authority boundary.** New builds persist
   player skill decisions; the rules engine derives grants and bonuses.
5. **Starting inventory is server-authored.** The client submits loadout choices;
   the backend resolves and provisions inventory atomically.
6. **New Ley Line Walkers use the loadout foundation.** Their current prose
   equipment is migrated to structured content for new character creation.
   Existing characters are never backfilled or rewritten.
7. **No class-specific engine branches.** O.C.C. differences live in validated,
   page-stamped content rather than `occId` conditionals.
8. **Missing subsystems remain visible.** Every affected O.C.C. issue keeps its
   `needs:*` labels until the dependency is actually implemented and verified.

## Rendered rules evidence

The local Rifts Ultimate Edition PDF is scanned and has no reliable text layer.
The following source areas were rendered and visually inspected during design;
implementation must rerender the exact pages it transcribes and follow
`docs/rules/TRANSCRIPTION.md`.

| Printed pages | Design use                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| 67-73         | Glitter Boy boundary and the need for a future power-armor subsystem.                                                |
| 78-80         | Juicer boundary and the need for augmentation, additive bonuses, and attributes above 30.                            |
| 113-116       | Existing Ley Line Walker skills, equipment, weapons, money, and vehicle guidance.                                    |
| 118-119       | Mystic boundary and the future psionics dependency.                                                                  |
| 231-233       | Coalition military context and the complete Coalition Grunt entry; p.233 supplies the Human/Psi-Stalker restriction. |
| 286-287       | Physical S.D.C. base and accumulation boundary.                                                                      |
| 304-329       | Skill descriptions and prerequisites required by the Grunt; complete touched sections must be transcribed.           |

No mechanic, amount, option, item, skill, or page reference may be filled from
memory. If rendered text conflicts with this design, the rendered page wins and
the discrepancy is brought back for approval.

## Delivery architecture

| Order | Issue | Deliverable                             | Activation rule                                                                  |
| ----- | ----- | --------------------------------------- | -------------------------------------------------------------------------------- |
| 1     | #60   | Species identity and O.C.C. eligibility | Sole `next-up` issue now.                                                        |
| 2     | #61   | Skill legality and additive S.D.C.      | Becomes `next-up` only after #60 is merged, synchronized, validated, and closed. |
| 3     | #62   | Structured starting loadouts            | Becomes `next-up` only after #61 completes under the same gate.                  |
| 4     | #57   | Coalition Grunt integration             | Starts only after all three foundations are on validated `main`.                 |
| 5     | #58   | Glitter Boy                             | Starts only after #57 is merged and validated.                                   |
| 6     | #59   | Juicer                                  | Starts only after #58 is merged and validated.                                   |

Every slice uses the normal protected-main workflow:

```text
validated main -> feature branch -> implementation and evidence
              -> active automated review -> human merge
              -> sync and validate main -> activate successor
```

The agent never commits directly to `main`, merges a PR, or manually retriggers
an automated reviewer that already reviews new commits.

## Species identity and eligibility (#60)

### Content model

Introduce a small source-stamped species catalog. Its first entries are:

- Human: playable;
- Psi-Stalker: known but deferred and nonplayable.

O.C.C. content replaces the current free-text racial requirement with a
discriminated eligibility rule:

- `any`; or
- `oneOf` with explicit species IDs.

Catalog validation rejects duplicate or unknown species IDs, empty `oneOf`
lists, and references that do not resolve. Production Coalition Grunt content
remains in #57; #60 uses a focused p.233 fixture to prove the first restricted
consumer.

### Character and engine behavior

- New characters write an explicit `speciesId`.
- Legacy characters without the field derive as Human without a data rewrite.
- A pure eligibility validator resolves species identity, playability, O.C.C.
  species rules, and existing attribute requirements.
- The builder, `deriveSheet`, and backend writes call the same validator.
- Unknown or unavailable species fail closed. Deferred Psi-Stalker may appear in
  explanatory eligibility text but cannot be selected or persisted.

### Builder and sheet

While Human is the only playable species, the builder shows it as a locked
identity field rather than adding an empty wizard step. The resolved sheet also
displays species. Tests cover explicit Human, the legacy default, unknown IDs,
deferred identity rejection, restricted O.C.C. eligibility, attribute failure,
backend rejection, and the live locked-field flow.

### Explicit exclusions

Playable Psi-Stalker content, R.C.C./O.C.C. interaction, I.S.P., psychic powers,
and psionics rules remain deferred to dedicated work and issue #14.

## Skill legality and additive S.D.C. (#61)

### Authoritative player choices

New character builds store the decisions a player actually made:

- picks for each O.C.C. choice slot;
- related-skill picks;
- secondary-skill picks;
- labels distinguishing repeatable skills; and
- the selected Hand-to-Hand option.

O.C.C. bonuses, related-category bonuses, and fixed percentage overrides are no
longer client-authorable. A single pure assembler validates the choices and
derives the canonical fixed grants, chosen skills, bonuses, and Hand-to-Hand
result for builder preview, `deriveSheet`, and backend writes.

Existing flattened Ley Line Walker skill records remain readable and usable.
New build writes cannot introduce or alter legacy bonus metadata. Editing a
legacy build requires resubmitting authoritative selections; unrelated combat,
resource, inventory, and narrative mutations continue to preserve it.

### Typed skill restrictions

Replace the current free-text related-skill rules with explicit policies over
catalog IDs:

- `any`;
- `none`;
- `include`; or
- `exclude`.

Exceptional costs such as one skill consuming two selections are structured
data. The printed Secondary Skills pool is modeled independently instead of
reusing the related-skill pool.

Content loading fails for:

- dangling prerequisites or grant references;
- unknown category or skill IDs;
- a referenced skill in the wrong category;
- duplicate or contradictory grants/rules;
- invalid exceptional costs; or
- minimum-pick constraints that the available pool cannot satisfy.

The completed build must satisfy every selected skill's prerequisites. Missing
catalog prerequisites tracked by #22 are transcribed or corrected from rendered
source, never guessed.

### Additive physical S.D.C.

Add only the narrow channels required by the printed rules:

- a fixed-or-dice S.D.C. bonus formula on a skill; and
- a typed O.C.C. S.D.C. bonus entry.

The pure engine sums the printed physical S.D.C. base with every applicable
O.C.C. and selected-skill contribution. The derived sheet exposes the total
range and a source breakdown; it does not roll dice.

`rollVitals` rolls the base and each applicable component server-side through an
injected random source, then persists only the final S.D.C. maximum. A stored
maximum outside the currently derived legal range is rejected, and current S.D.C.
continues to be constrained by that maximum.

### Proof and issue reconciliation

Rules, backend, and web tests cover exact rendered values, restrictions,
exceptional costs, prerequisites, legacy compatibility, S.D.C. accumulation and
ranges, and hostile payloads. Live acceptance creates a legal Ley Line Walker,
confirms its engine-derived bonuses, rolls the expanded S.D.C. path, and proves
that illegal selections cannot be submitted.

Issues #22, #25, and #26 are audited after implementation. An issue closes only
if its complete current scope is proven satisfied; otherwise its body is updated
with the precise remaining gap.

## Structured starting loadouts (#62)

### Content model

Each participating O.C.C. gains a source-stamped `startingLoadout` containing:

- fixed catalog grants;
- fixed or dice-based quantities;
- named choice groups with exact selection counts;
- explicit item IDs or printed item-category constraints; and
- checklist-only entries for benefits without a real subsystem.

Prose is never parsed to create inventory. Content loading rejects unknown item
IDs, empty or unsatisfiable choice groups, invalid quantities, duplicate keys,
contradictory options, and category mismatches.

Vehicles, loose ammunition, credits, and incidental non-catalog gear remain
visible page-stamped checklist guidance. They never become invented inventory,
wallet, vehicle, or ammunition state.

### Pure planning and builder behavior

The authority flow is:

```text
O.C.C. loadout content -> pure plan -> player choices
                      -> backend revalidation -> server rolls
                      -> stored inventory -> derived sheet
```

One pure planner returns fixed grants, legal choices, quantity ranges, and
checklist guidance. The builder adds an applicable loadout step, stores only
player selections, and clears selections owned by a previously selected O.C.C.

Review shows fixed and selected items, ranges for quantities and armor capacity
that are not rolled yet, and a separate checklist. A printed category choice
offers only source-verified catalog items matching that structured category.

### Atomic provisioning

Character creation accepts loadout selections, not a client-authored starting
inventory. In one Convex mutation the backend:

1. reloads authoritative O.C.C. content;
2. validates every selection;
3. rolls dice quantities and every dice-capacity armor instance;
4. constructs the item instances;
5. validates the complete character; and
6. inserts the character and inventory atomically.

Any failure aborts the complete creation. Starting armor is granted as owned but
unworn; equipping is an explicit player action. After creation, inventory is
ordinary mutable state, so disposing of original equipment never invalidates the
character build.

### Ley Line Walker migration boundary

The existing Ley Line Walker prose equipment and weapon fields move to the
structured model. Newly forged Ley Line Walkers receive their catalog-backed
starting inventory. Existing characters receive no retroactive grants, rerolls,
replacement items, or document rewrites.

Tests cover exact plans, malformed content, tampered choices, transactional
failure, quantity and per-suit armor rolls, builder reset behavior, review
presentation, and unchanged legacy characters. Live acceptance forges a new Ley
Line Walker, verifies its inventory and concrete armor roll after navigation and
reload, equips the armor, and confirms an older character remains unchanged.

## Coalition Grunt integration (#57)

### Content

Transcribe the complete Coalition Grunt entry from rendered RUE pp. 231-233,
then render and transcribe every referenced skill and equipment source required
by the implementation. Production content includes:

- requirements and Human/Psi-Stalker eligibility;
- fixed and selectable O.C.C. skills;
- related and secondary skill rules;
- O.C.C. and skill-derived bonuses;
- the complete starting loadout;
- pay; and
- cybernetics restrictions.

All mechanics use the generic foundations from #60, #61, and #62. Pay, optional
augmentation guidance, and other non-live facts remain structured dossier or
checklist content rather than inventing absent subsystems.

Only source-required catalog entries are added. The implementation does not add
SAMAS Pilot, Military Specialist, Technical Officer, Glitter Boy, Juicer,
Cyber-Knight, Mystic, or unrelated generic effect machinery.

### Builder and live sheet

- Human remains the locked playable species.
- Psi-Stalker is visible only as deferred eligibility information.
- Fixed skills are automatic; every required skill and loadout choice is
  collected and validated.
- A non-caster path skips spell selection instead of presenting an empty step.
- Changing O.C.C. clears prior O.C.C.-owned skills, spells, and loadout choices.
- Review and sheet show species, O.C.C., resolved bonuses, accumulated S.D.C.,
  skills, provisioned inventory, and page-stamped dossier/checklist information.

The implementation must not contain a Coalition-specific validation or
provisioning path. A legal Grunt is evidence that the content-driven system
works, not a second hard-coded vertical.

### Backend boundary

The generic eligibility, skill, S.D.C., and loadout pipelines revalidate the
complete build. Unknown/unavailable species, deferred Psi-Stalker, illegal
skills, client-authored bonuses, invalid equipment choices, client-authored
starting inventory, and illegal S.D.C. fail before insertion. Creation and all
server-owned rolls remain atomic.

## Error handling

Failures are owned by the layer with enough information to explain them:

- catalog contradictions fail synchronously at content load;
- the pure planner/assembler returns actionable builder violations;
- the builder blocks progression while showing the violated rule;
- the backend reruns the same validation and rejects stale or hostile payloads;
  and
- no write path silently clamps, drops, substitutes, or invents a rules value.

Unavailable content is distinct from unknown content. A known deferred
Psi-Stalker can be explained to the player; an unknown species ID is corrupt
input. Likewise, checklist-only gear is intentionally unmodeled rather than
silently omitted.

## Compatibility and migration

- `speciesId` defaults to Human only for legacy records; no storage migration is
  required.
- Legacy flattened skills remain runtime-compatible but cannot be authored by
  new build writes.
- Existing inventories remain byte-for-byte unchanged by loadout delivery.
- New Ley Line Walkers and Grunts use authoritative selection/provisioning paths.
- Starting-loadout validity applies at creation only; later inventory mutations
  do not need to reproduce the starting manifest.
- Existing Ley Line Walker magic, combat, healing, navigation, and inventory
  behavior remains regression-covered.

## Testing strategy

### Rules package

- Pin page stamps and exact rendered values for every new source.
- Reject malformed species, eligibility, skill, S.D.C., and loadout content.
- Test legal and illegal eligibility, including legacy Human and deferred
  Psi-Stalker.
- Test complete skill assembly, prerequisites, restrictions, costs, duplicates,
  repeatable labels, and derived bonuses.
- Test S.D.C. contribution ranges and deterministic minimum/maximum rolls.
- Test loadout planning, category constraints, quantities, and checklist output.
- Run complete legal Ley Line Walker and Coalition Grunt derivations through the
  same public functions.

### Backend

- Reject hostile or stale identity, skill, bonus, loadout, inventory, and rolled
  S.D.C. input.
- Prove character creation is atomic across validation, quantity rolls, armor
  rolls, and insertion.
- Reload new Ley Line Walker and Grunt documents and derive identical sheets.
- Preserve legacy documents through resource, inventory, narrative, and combat
  mutations.
- Prove an invalid request consumes no persistent write.

### Web

- Show locked Human identity and deferred eligibility clearly.
- Derive every skill bonus rather than trusting form state.
- Reset O.C.C.-owned choices when O.C.C. or route ownership changes.
- Skip inapplicable spell selection for the Grunt.
- Present unrolled loadout ranges, concrete post-create inventory, and checklist
  guidance without implying unimplemented mechanics.
- Preserve accessible names, non-color status cues, narrow-layout containment,
  and the Ley Terminal design system.

## Live-browser acceptance

Use local Convex and the real SolidJS app to verify the complete user-visible
story:

1. Forge a Coalition Grunt.
2. Confirm Human identity, O.C.C., skills, S.D.C. range, inventory, and checklist.
3. Roll vitals, equip armor, and deal damage.
4. Navigate between the Grunt and a Ley Line Walker without a document remount;
   confirm all route-owned drafts and async results reset correctly.
5. Cast with the Ley Line Walker to prove the magic vertical remains intact.
6. Reload both dossiers and confirm persisted state.
7. Forge a new Ley Line Walker through the shared loadout path and confirm its
   provisioned inventory and armor roll.
8. Confirm a character created before #62 remains unchanged.
9. Check desktop and narrow layouts, keyboard operation, explicit labels, and a
   clean browser console.

## Validation gates

Each implementation PR runs the affected package gates before publication. The
final evidence for every slice includes fresh, time-scoped results for:

```text
vp run @riftforge/rules#check
vp run @riftforge/rules#test
vp run @riftforge/backend#check    # when backend is affected
vp run @riftforge/backend#test     # when backend is affected
vp run @riftforge/web#check        # when web is affected
vp run @riftforge/web#test         # when web is affected
vp check
vp test
git diff --check
```

User-visible changes additionally require the live-browser acceptance relevant
to that slice. Test counts are reported only as observations from the validated
revision.

## Tracker and missing-subsystem labels

The approved queue and dependency labels are:

| Issue | O.C.C./foundation       | Required labels while missing                                                           |
| ----- | ----------------------- | --------------------------------------------------------------------------------------- |
| #60   | Species foundation      | `needs:species`, `next-up`                                                              |
| #61   | Skill/S.D.C. foundation | `needs:sdc-bonuses`                                                                     |
| #62   | Loadout foundation      | `needs:loadouts`                                                                        |
| #57   | Coalition Grunt         | `needs:species`, `needs:sdc-bonuses`, `needs:loadouts`                                  |
| #58   | Glitter Boy             | `needs:species`, `needs:power-armor`, `needs:sdc-bonuses`, `needs:loadouts`             |
| #59   | Juicer                  | `needs:augmentation`, `needs:sdc-bonuses`, `needs:attributes-30-plus`, `needs:loadouts` |

`needs:psionics` is reserved for future Cyber-Knight, Mystic, Psi-Stalker, or
other O.C.C./R.C.C. issues that genuinely require the unimplemented psionics
subsystem.

A dependency label is removed only after its implementing PR is merged and the
result is synchronized and verified on local `main`. Exactly one issue carries
`next-up`. After #57 completes, #58 becomes that issue. #59 remains queued
after #58.

## Success criteria

This design is fully delivered when:

- #60, #61, and #62 have each merged through their independent review gates;
- their dependency labels have been removed only from issues they genuinely
  unblock;
- Coalition Grunt is a complete, source-faithful, playable second O.C.C.;
- new Ley Line Walkers and Grunts use the same authoritative skill and loadout
  machinery;
- existing characters remain compatible and unmodified;
- hostile clients cannot author species eligibility, skill bonuses, starting
  inventory, armor rolls, or S.D.C. totals outside the approved boundaries;
- package, root, diff, and live-browser gates pass with fresh evidence;
- #57 is reviewed and merged by the human maintainer; and
- #58 is the sole `next-up` issue with every still-missing subsystem visibly
  tagged.
