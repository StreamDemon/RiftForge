# Documentation and Tracker Alignment Design

**Date:** 2026-07-18  
**Status:** Approved in conversation  
**Branch:** `docs/align-project-state`

## Goal

Reconcile RiftForge's living documentation and GitHub trackers with the project
state after PR #49 merged, while preserving implementation plans and dated
reviews as historical records rather than rewriting their original context.

This is a documentation and project-tracking change only. It does not alter
rules content, schemas, engine behavior, backend mutations, or web UI behavior.

## Verified starting state

- `main` contains PR #49 at merge commit `8f58a48`.
- The repository test suite passes 309 tests across 19 files.
- Current catalogs contain 156 spells, 15 structured-damage spells, 45 skills,
  six Hand-to-Hand types, and 34 items.
- Issues #16 and #20 are closed as completed.
- Milestone M2 has no open issues but remains open and still says React.
- Milestone M3 remains open with three open issues and four closed issues.
- Issues #28 and #44 remain open and contain pre-merge counts or API wording.

These values are evidence for this cleanup, not permanent counters. Future
documentation must avoid presenting them as timeless facts unless the section
is explicitly dated.

## Documentation strategy

### Living documentation

Living documentation states what the project does now and must be rewritten to
match the merged code.

- `README.md`
  - Replace the stale "builder and sheet are next" status.
  - Describe the landing page, roster, guided builder, live sheet, inventory,
    armor, damage, recovery, spell casting, and treatment surfaces.
  - Expand the rules architecture summary to include the opposed-strike and
    structured spell-damage APIs without claiming that A.R. routing or hostile
    persistence already exists.
  - Keep the existing Vite+ task examples, which match CI task aliases.
- `CLAUDE.md`
  - Add the explicit package-level `vp run <pkg>#check` and
    `vp run <pkg>#test` requirement already enforced by CI and mirrored in the
    local `AGENTS.md`.
- `docs/rules/PAGE_MAP.md`
  - Remove the reference to missing `scratchpad/extract_pages.py` and point to
    the maintained inline rendering workflow in `TRANSCRIPTION.md`.
  - Label the Slice #1 section as a historical extraction target and record
    that the spell catalog has since expanded through level 15.

`DESIGN.md`, `docs/rules/TRANSCRIPTION.md`, and `.github/workflows/ci.yml` are
already aligned and do not need content changes.

### Historical documentation

Historical documents retain their original instructions and findings. They
receive prominent status banners and concise outcome annotations so readers do
not mistake old branch state, counts, or checkboxes for current work.

- `.codex/superpowers/plans/2026-07-17-combat-resolution.md`
  - Preserve the original 54 unchecked execution checkboxes.
  - Add a completion banner explaining that the plan was executed, reviewed,
    and merged through PR #49.
  - State that branch, issue, milestone, and expected-output passages describe
    the pre-merge execution phase and are no longer live instructions.
  - Record the post-review hardening commits and final verification totals.
- `.codex/superpowers/specs/2026-07-17-combat-resolution-design.md`
  - Change the status from conversation approval alone to implemented and
    merged.
  - Record PR #49, merge commit `8f58a48`, final checks, and the review fixes.
  - Preserve the approved architecture and scope boundary, including #44's
    ownership of A.R., armor routing, M.D.C. application, and hostile damage.
- `docs/reviews/2026-07-03-rules-layer-review.md`
  - Add a dated historical-snapshot banner.
  - Record that its 73-test baseline, levels 1-4 catalog, and discarded H2H
    finding are superseded.
  - Point unresolved fidelity/test-quality work to the refreshed issue #28.
  - Do not rewrite the original review findings or imply that every finding is
    fixed.

Ignored `.superpowers/sdd/` briefs and reports remain untouched. They are local
execution artifacts, not committed project documentation.

## GitHub tracker strategy

Tracker writes are narrow replacements of verified stale statements. Existing
discussion history, labels, assignees, and unrelated scope remain unchanged.

- Issue #16 (closed)
  - Clarify that the delivered resolver covers page-stamped strike constants
    and opposed parry/dodge resolution.
  - State that equipment-aware A.R. and armor routing were split to #44.
  - Update the existing progress comment to record PR #49's merge and closure.
- Issue #20 (closed)
  - Update the existing progress comment to record PR #49's merge and closure.
- Issue #28 (open)
  - Replace the obsolete levels 1-4, 39-skill, and seven-test-file counts.
  - Reframe the remaining work as fidelity review of the current 156-spell and
    45-skill catalogs plus a test-quality pass over the current suite.
  - Remove sequencing language that says the work should happen before #13,
    which is already closed.
- Issue #44 (open)
  - Remove the claim that p.346 strike constants are unmodeled.
  - Describe the existing `resolveStrike(input)` boundary accurately.
  - Keep #44 responsible for choosing defenses from attacker/defender/equipment
    context, applying A.R., routing damage, M.D.C. policy, and hostile state.
- Milestone M2
  - Replace React with SolidJS in the description.
  - Close the milestone because all three assigned issues are completed and the
    builder/live-sheet milestone outcome exists in the merged application.
- Milestone M3
  - Leave it open and otherwise unchanged.

If any target changed after the audit, its write is paused and reconciled
against the new value instead of overwriting concurrent work.

## Sequencing and safety

1. Commit this approved design specification.
2. Create and approve a detailed implementation plan.
3. Apply committed documentation edits and validate the diff.
4. Commit the documentation cleanup.
5. Re-fetch every GitHub target immediately before mutation.
6. Apply tracker updates sequentially and read each value back.
7. Run repository verification and report the exact final state.

No branch is pushed and no pull request is opened unless the user requests
publication. The human maintainer remains the only merger.

## Verification

The completed cleanup requires:

```text
git diff --check
vp check
vp test
```

It also requires read-back verification that:

- README claims match implemented routes and backend/rules capabilities;
- historical banners distinguish snapshot facts from current state;
- issue #16 and #20 comments record the merge;
- issues #28 and #44 remain open with corrected bodies;
- M2 is closed with SolidJS wording;
- M3 remains open; and
- the worktree is clean on `docs/align-project-state` after commits.

Browser verification is not required because no user-visible behavior changes.

## Success criteria

- A new contributor can read `README.md` without being told completed features
  are still future work.
- An agent following `CLAUDE.md` runs both package-level and root validation.
- The rulebook page map contains no link to a missing extraction script.
- Historical plans and reviews remain intact but cannot be mistaken for live
  project status.
- GitHub issues and milestones describe the APIs, counts, sequencing, and
  completion state that exist after PR #49.
- Engine, backend, and frontend source files are unchanged.
