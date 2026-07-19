# Documentation and Tracker Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile RiftForge's living documentation, historical project records,
GitHub issues, and milestone state with the code that exists after PR #49 merged,
without changing application or rules behavior.

**Architecture:** Treat code, tests, routes, and live GitHub state as evidence.
Rewrite living documentation to describe current capabilities, annotate dated plans
and reviews instead of rewriting their history, then apply narrow tracker updates
only after re-fetching each target. Keep all source files untouched and record the
final verification in the approved design and this execution plan.

**Tech Stack:** Markdown, Git, GitHub issues/milestones, GitHub connector, GitHub CLI
for the milestone mutation, Vite+ (`vp`), pnpm workspace.

**Status:** Completed on 2026-07-19.

## Global Constraints

- Work directly in `D:\Projects\riftforge` on branch
  `docs/align-project-state`; do not create a worktree or another branch.
- Treat
  `.codex/superpowers/specs/2026-07-18-docs-tracker-alignment-design.md` as
  the approved contract.
- This plan changes documentation and project trackers only. Do not modify files
  under `apps/`, `packages/`, or any other runtime source directory.
- Preserve the historical body of the 2026-07-17 combat implementation plan, the
  combat design, and the 2026-07-03 rules-layer review. Add status context; do not
  make the original records read as though they were authored after PR #49.
- Keep `.superpowers/sdd/` untouched. It is ignored local execution material, not
  committed project documentation.
- Re-fetch every GitHub issue, comment, and milestone immediately before updating
  it. If any target differs materially from the values in this plan, stop that
  target's write and reconcile the new state before proceeding.
- Update issue bodies and existing progress comments in place. Do not add duplicate
  comments, change labels or assignees, or alter unrelated discussion history.
- Leave issues #28 and #44 open. Leave milestone M3 open and unchanged.
- Close milestone M2 only after all documentation edits have been committed and the
  current milestone read-back still reports zero open issues.
- Use `vp` commands, not plain Vite. Use `pnpm exec`, never `npx`, in
  `packages/backend`; this plan does not require backend commands.
- No browser verification is required because this plan changes no user-visible
  behavior.
- Do not push the branch or open a pull request. Publication requires a separate
  user request. Never merge a pull request.
- Use no AI attribution in commits, issue text, comments, or milestone text.
- After every task, review the diff for unintended source changes and mark the
  task's checkboxes only when the described evidence exists.

---

## File Map

### Existing files modified

- `README.md` — current routes, application features, backend mutations, and
  combat/spell rules APIs.
- `CLAUDE.md` — explicit package-level validation gates.
- `docs/rules/PAGE_MAP.md` — maintained page-rendering workflow and current spell
  catalog coverage.
- `.codex/superpowers/plans/2026-07-17-combat-resolution.md` — historical completion
  banner only.
- `.codex/superpowers/specs/2026-07-17-combat-resolution-design.md` — implemented
  status and PR #49 outcome.
- `docs/reviews/2026-07-03-rules-layer-review.md` — dated snapshot banner and current
  follow-up owner.
- `.codex/superpowers/specs/2026-07-18-docs-tracker-alignment-design.md` — final
  implementation outcome.
- `.codex/superpowers/plans/2026-07-18-docs-tracker-alignment.md` — completed status
  and checked execution record.

### Runtime files modified

- None.

### GitHub records modified

- Issue #16 body and existing progress comment `5002421933`.
- Existing progress comment `5006583446` on issue #20.
- Issue #28 body.
- Issue #44 body.
- Milestone M2 description and state.

---

### Task 1: Align Living Documentation with the Merged Application

**Files:**

- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/rules/PAGE_MAP.md`

- [x] **Step 1: Reconfirm the living-document claims against source**

Run:

```powershell
rg -n 'path:|component:|characters/new|characters/:id' apps/web/src
rg -n '^export const (addItem|removeItem|equipArmor|applyDamage|heal|rest|leyLineDraw|treat|castSpell)' packages/backend/convex/characters.ts
rg -n 'combatResolutionRules|resolveStrike|damageEffect|deriveSpellDamage|rollSpellDamage' packages/rules/src packages/rules/tests
```

Expected:

- Routes exist for `/`, `/characters`, `/characters/new`, and
  `/characters/:id`.
- Backend mutations cover inventory/armor, damage/recovery, ley-line P.P.E.,
  treatment, and spell casting. If an exported mutation uses a different exact
  identifier, describe the implemented behavior rather than inventing the name.
- The rules package exports the page-stamped combat constants, deterministic
  opposed-strike resolver, structured spell-damage schema, derivation, and roll
  APIs.
- There is no equipment-aware A.R. selection/routing or hostile-target persistence
  implementation; those remain #44 scope.

- [x] **Step 2: Replace README's architecture and current-status sections**

In `README.md`, retain the opening description, development commands, source
material, and licensing sections. Replace the architecture code block and the
paragraphs through `### Current status` with the following text:

````markdown
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
source book. Combat APIs expose page-stamped strike constants and deterministic
opposed-roll resolution; spell APIs expose load-validated structured damage,
derivation, and injected-RNG rolling. Equipment-aware A.R. selection, armor-first
routing, M.D.C. application, and hostile-target persistence remain follow-on work.

### Current status

The first vertical slice — the **Ley Line Walker** O.C.C. — runs end to end. The web
app includes a landing page (`/`), character roster (`/characters`), guided builder
(`/characters/new`), and live sheet (`/characters/:id`). Characters can manage
inventory and worn armor, take and recover damage, rest, draw P.P.E. from a ley line,
receive treatment, and cast spells through server-validated state changes, while
ephemeral sheet rolls use the shared rules package client-side.
````

Do not add current test or catalog counts to README. Those values are useful audit
evidence but would become undated drift-prone claims.

- [x] **Step 3: Add package gates to CLAUDE.md**

In `CLAUDE.md`, replace the first bullet under `## Definition of done` with:

```markdown
- Run the affected package gates before pushing:
  `vp run <pkg>#check` and `vp run <pkg>#test`. Root `vp check` is not a
  substitute for the package-level CI task. Then run `vp check` and `vp test`
  from the root (`vp test` runs every package's Vitest project).
```

Leave the Vite+ managed checklist intact. This addition makes the repository's
authoritative contract explicit without duplicating all toolchain documentation.

- [x] **Step 4: Correct PAGE_MAP's extraction workflow and historical slice**

In `docs/rules/PAGE_MAP.md`, replace:

```markdown
The PDF has no extractable text; all content is transcribed from page images via
vision extraction (`scratchpad/extract_pages.py` renders a page to PNG for reading).
```

with:

```markdown
The PDF has no extractable text; all content is transcribed from rendered page
images using the maintained inline rendering and vision workflow in
[`TRANSCRIPTION.md`](./TRANSCRIPTION.md).
```

Rename:

```markdown
## Slice #1 target — Ley Line Walker (pages to extract)
```

to:

```markdown
## Historical Slice #1 extraction target — Ley Line Walker
```

Immediately below that heading, add:

```markdown
This list records the initial vertical-slice extraction target. The committed spell
catalog has since expanded through levels 1–15 (156 entries); use the section tables
above and the transcription runbook for current page coverage.
```

Replace the final bullet:

```markdown
- A handful of low-level spells for the sheet — printed 198–202 (PDF 200–204)
```

with:

```markdown
- Initial low-level spell subset — printed 198–202 (PDF 200–204); the catalog now
  covers spell levels 1–15, printed 197–225 (PDF 199–227)
```

- [x] **Step 5: Format and inspect the living-doc diff**

Run:

```powershell
vp check --fix
git diff --check
git diff -- README.md CLAUDE.md docs/rules/PAGE_MAP.md
git diff --name-only
```

Expected:

- Formatting succeeds.
- `git diff --check` prints nothing.
- The README no longer says the guided builder and sheet are next.
- PAGE_MAP no longer references `scratchpad/extract_pages.py`.
- No file under `apps/` or `packages/` appears in `git diff --name-only`.

---

### Task 2: Mark Prior Plans and Reviews as Historical Records

**Files:**

- Modify: `.codex/superpowers/plans/2026-07-17-combat-resolution.md`
- Modify: `.codex/superpowers/specs/2026-07-17-combat-resolution-design.md`
- Modify: `docs/reviews/2026-07-03-rules-layer-review.md`

- [x] **Step 1: Add the completion banner to the combat implementation plan**

In `.codex/superpowers/plans/2026-07-17-combat-resolution.md`, add the following
immediately after the H1 title and before the existing agentic-workers block:

```markdown
> **Historical execution plan — completed and merged.** This plan was executed on
> `feat/combat-resolution`, reviewed in PR #49, and merged to `main` as `8f58a48`
> on 2026-07-18. Its unchecked boxes and branch, issue, milestone, and expected-output
> passages preserve the original execution instructions; they are not current work
> items. Final state: 260 rules tests and 309 workspace tests. Review hardening landed
> in `eb163f7`, `1a10731`, and `7d23370`; issues #16 and #20 are closed.
```

Do not check, delete, or rewrite the original 54 unchecked checkboxes. Their value is
as an execution record, not as a current task list.

- [x] **Step 2: Record the combat design's implemented outcome**

In `.codex/superpowers/specs/2026-07-17-combat-resolution-design.md`, replace the
two existing status paragraphs under `## Status` with:

```markdown
Approved in conversation on 2026-07-17, implemented on `feat/combat-resolution`,
reviewed in PR #49, and merged to `main` as `8f58a48` on 2026-07-18. This document
preserves the approved architecture, data contract, integration boundary, and
verification strategy.
```

Append this section at the end of the document:

```markdown
## Implementation outcome

PR #49 delivered the approved rules-layer boundary and closed issues #16 and #20.
The final implementation exposes page-stamped p.346 combat constants,
`resolveStrike(input)`, complete Hand-to-Hand bonus projection, and structured finite
spell-damage derivation and rolling. Equipment-aware defense selection, A.R.
penetration, armor-first routing, M.D.C. application, hostile persistence, and combat
UI remain issue #44 scope.

Cubic review produced four accepted fixes and one rejected finding. The accepted
hardening covered Horror Factor bonus aggregation and blank damage prose (`eb163f7`),
strictly positive structured damage (`1a10731`), and safe-integer dice validation
(`7d23370`), in addition to the earlier contradiction fix. The rejected finding
proposed adding P.P. and general Hand-to-Hand strike bonuses to `strikeGuns`. It was
closed with tests and rendered RUE p.360 evidence because those general bonuses do
not apply to modern weapons; `strikeGuns` exposes only the specifically named gun
bonus.

Final verification passed the rules package gates and root gates with 260 rules tests
and 309 workspace tests across 19 files.
```

- [x] **Step 3: Add a current-context banner to the July 3 rules review**

In `docs/reviews/2026-07-03-rules-layer-review.md`, insert the following after the H1
title and before the existing opening paragraph:

```markdown
> **Historical snapshot.** This review describes the pre-app rules layer on
> 2026-07-03. The post-PR #49 baseline is 309 tests across 19 files, 156 spells
> covering levels 1–15, 45 skills, and complete Hand-to-Hand bonus projection. The
> original findings and counts below are preserved as a dated record; remaining
> rules-fidelity and test-quality work is tracked in issue #28.
```

Do not rewrite the original 73-test baseline, the seven-of-ten-lenses statement, or
the individual P1/P2/P3 findings. The banner supplies current context without falsely
claiming every original finding was fixed. The three P1 representation and strict-ID
findings were fixed in `c319cc1`; the discarded H2H projection was fixed through PR
#49, but the original review text remains unchanged.

- [x] **Step 4: Verify that the annotations preserve history**

Run:

```powershell
$uncheckedBefore = (git show HEAD:.codex/superpowers/plans/2026-07-17-combat-resolution.md | Select-String -Pattern '^- \[ \]' | Measure-Object).Count
$uncheckedAfter = (Get-Content -LiteralPath '.codex\superpowers\plans\2026-07-17-combat-resolution.md' | Select-String -Pattern '^- \[ \]' | Measure-Object).Count
Write-Output "before=$uncheckedBefore after=$uncheckedAfter"
rg -n 'Historical execution plan|Implementation outcome|Historical snapshot|issue #28' .codex/superpowers docs/reviews
git diff --check
git diff -- .codex/superpowers/plans/2026-07-17-combat-resolution.md .codex/superpowers/specs/2026-07-17-combat-resolution-design.md docs/reviews/2026-07-03-rules-layer-review.md
```

Expected:

- The checkbox command prints `before=54 after=54`.
- Each new status or outcome section appears exactly once.
- The original review findings remain present.
- `git diff --check` prints nothing.

---

### Task 3: Validate and Commit the Repository Documentation Cleanup

**Files:**

- Verify all six documentation files changed in Tasks 1 and 2.
- Do not modify runtime source files.

- [x] **Step 1: Scan for the exact stale statements this cleanup owns**

Run:

```powershell
rg -n 'guided builder and sheet visual design are next|scratchpad/extract_pages\.py|Approved in conversation on 2026-07-17\. This document|constants never modeled|resolveStrike\(attacker, defender, weapon\)' README.md CLAUDE.md docs/rules/PAGE_MAP.md .codex/superpowers/plans/2026-07-17-combat-resolution.md .codex/superpowers/specs/2026-07-17-combat-resolution-design.md docs/reviews/2026-07-03-rules-layer-review.md
```

Expected: no match. Historical numeric baselines and unchecked boxes may remain only
where their new banners clearly identify them as dated records.

- [x] **Step 2: Run repository documentation validation**

Run:

```powershell
vp check
git diff --check
$changed = git diff --name-only
$changed
$runtimeChanges = $changed | Where-Object { $_ -match '^(apps|packages)/' }
if ($runtimeChanges) { throw "Unexpected runtime changes: $($runtimeChanges -join ', ')" }
```

Expected:

- `vp check` exits zero.
- `git diff --check` prints nothing.
- Exactly these six pre-existing files are changed:
  - `README.md`
  - `CLAUDE.md`
  - `docs/rules/PAGE_MAP.md`
  - `.codex/superpowers/plans/2026-07-17-combat-resolution.md`
  - `.codex/superpowers/specs/2026-07-17-combat-resolution-design.md`
  - `docs/reviews/2026-07-03-rules-layer-review.md`
- The runtime-change guard does not throw.

- [x] **Step 3: Commit the local documentation alignment**

Run:

```powershell
git add -- README.md CLAUDE.md docs/rules/PAGE_MAP.md .codex/superpowers/plans/2026-07-17-combat-resolution.md .codex/superpowers/specs/2026-07-17-combat-resolution-design.md docs/reviews/2026-07-03-rules-layer-review.md
git diff --cached --check
git diff --cached --name-only
git commit -m "docs: align project state after combat merge"
```

Expected:

- The staged diff contains exactly the six intended documentation files.
- The commit succeeds without an attribution trailer.
- The branch is ahead of `main` by the design, plan, and documentation commits.

---

### Task 4: Reconcile GitHub Issues and Milestone M2

**GitHub records:**

- Modify: issue #16 body
- Modify: comment `5002421933` on issue #16
- Modify: comment `5006583446` on issue #20
- Modify: issue #28 body
- Modify: issue #44 body
- Modify: milestone M2 description and state
- Verify only: milestone M3

- [x] **Step 1: Fetch and compare every target before the first write**

Use `mcp__codex_apps__github_fetch_issue` to fetch:

- repository `StreamDemon/RiftForge` issues #16, #20, #28, and #44.

Use `mcp__codex_apps__github_fetch_issue_comments` to fetch issue comments on
#16 and #20, including comment IDs `5002421933` and `5006583446`.

Use GitHub CLI for milestones M2 and M3 because the connector has no milestone
read or mutation surface.

Run this additional milestone check:

```powershell
gh api repos/StreamDemon/RiftForge/milestones/2
gh api repos/StreamDemon/RiftForge/milestones/3
```

Required preconditions:

- PR #49 is merged.
- Issues #16 and #20 are closed.
- Issues #28 and #44 are open.
- M2 is open with zero open issues and three closed issues.
- M3 is open.
- The target comments still exist and are the progress comments audited for this
  cleanup.

If any precondition fails or newer text already supersedes a planned payload, do not
overwrite it. Reconcile the target against the approved design first.

- [x] **Step 2: Replace issue #16's body**

Use `mcp__codex_apps__github_update_issue` for `StreamDemon/RiftForge` issue
#16, passing only `repository_full_name`, `issue_number`, and `body`. Omitting the
other optional fields preserves its title, state, labels, assignees, milestone, and
other metadata. Set its body to exactly:

```markdown
Model the page-stamped strike-resolution constants from RUE p.346 and provide
deterministic opposed strike resolution for completed strike and caller-authorized
parry, dodge, or automatic-dodge rolls.

Delivered in PR #49:

- page-stamped, load-validated p.346 constants;
- pure `resolveStrike(input)` resolution with natural-roll rules, defense ties,
  criticals, damage multiplier, and S.D.C./M.D. classification;
- complete Hand-to-Hand bonus projection through the derived sheet; and
- structured finite spell-damage derivation and injected-RNG rolling used by the
  combat foundation.

Equipment-aware defense selection, A.R. penetration, armor-first routing, M.D.C.
application, hostile-target persistence, and combat UI are intentionally separated
into #44.
```

Read issue #16 back immediately. Confirm it remains closed and the body matches
exactly before continuing.

- [x] **Step 3: Replace issue #16's existing progress comment**

Use `mcp__codex_apps__github_update_issue_comment` to update comment
`5002421933` to exactly:

```markdown
Merged in PR #49 as `8f58a48` on 2026-07-18. The delivered rules-layer boundary
includes the page-stamped p.346 constants, deterministic `resolveStrike(input)`,
complete Hand-to-Hand bonus projection, and structured finite spell damage.

Final verification passed 260 rules tests and 309 workspace tests across 19 files.
Cubic raised five findings: four were fixed at their root cause. The rejected
finding proposed adding P.P. and general Hand-to-Hand strike bonuses to
`strikeGuns`; tests and rendered RUE p.360 evidence showed those general bonuses do
not apply to modern weapons, so `strikeGuns` correctly exposes only the specifically
named gun bonus.

Issues #16 and #20 are closed. Equipment-aware A.R./armor/M.D.C. routing and hostile
state remain in #44.
```

Read the comment back and verify that the existing comment was edited rather than a
new duplicate being added.

- [x] **Step 4: Replace issue #20's existing progress comment**

Use `mcp__codex_apps__github_update_issue_comment` to update comment
`5006583446` to exactly:

```markdown
Completed and merged in PR #49 as `8f58a48` on 2026-07-18. The rules engine now
preserves the raw Hand-to-Hand bonus record and projects the approved named totals
through `combatProfile` and `deriveSheet`, including pull punch, roll with impact,
disarm, automatic dodge, entangle, and other non-basic maneuvers.

The projection is covered by package and sheet tests and was included in the final
260 rules tests / 309 workspace tests. Issue #20 is closed.
```

Read issue #20 and the comment back. Confirm the issue remains closed and the
existing comment was edited in place.

- [x] **Step 5: Replace issue #28's body**

Use `mcp__codex_apps__github_update_issue` for issue #28, passing only
`repository_full_name`, `issue_number`, and `body`. This preserves its title, open
state, labels, assignees, and milestone. Set its body to exactly:

```markdown
This follow-up owns the rulebook-fidelity and test-quality lenses that remained
incomplete in `docs/reviews/2026-07-03-rules-layer-review.md`.

Current baseline (2026-07-18):

- 156 spells covering levels 1–15, including 15 finite spells with structured damage
  effects;
- 45 skills; and
- 309 tests across 19 files.

Issue #13 is closed, so this review applies to the complete current spell catalog
rather than the original levels 1–4 slice.

Scope:

1. Review all 156 spells against rendered rulebook pages for names, levels, P.P.E.,
   range, duration, saving throws, prose, and structured finite damage.
2. Review all 45 skills against rendered pages for base values, per-level gains,
   secondary values, prerequisites, repeatability, and notes.
3. Review test quality across the current suite for meaningful assertions, boundary
   coverage, regression value, and unjustified snapshots or tautologies.

Review page by page using `docs/rules/TRANSCRIPTION.md` and the printed-page index in
`docs/rules/PAGE_MAP.md`. Preserve evidence and page citations for every correction.
The dated July 3 review keeps the historical counts; this issue is the current owner
for the remaining fidelity and test-quality work.
```

Read issue #28 back and confirm it remains open and has the refreshed baseline.

- [x] **Step 6: Replace issue #44's body**

Use `mcp__codex_apps__github_update_issue` for issue #44, passing only
`repository_full_name`, `issue_number`, and `body`. This preserves its title, open
state, labels, assignees, and milestone. Set its body to exactly:

```markdown
Equipment and the pure combat-resolution foundation have landed. This follow-on
connects them into equipment-aware defense selection, A.R./armor routing, M.D.C.
policy, persisted hostile damage, and the combat UI.

Current foundation:

- `combatResolutionRules` load-validates the page-stamped RUE p.346 constants.
- `resolveStrike(input)` resolves a completed strike roll against an optional
  caller-authorized parry, dodge, or automatic dodge and returns the outcome, reason,
  critical state, damage multiplier, and S.D.C./M.D. type.
- The derived combat profile preserves raw Hand-to-Hand bonuses and exposes named
  maneuver totals.
- Equipment content and character inventory/worn-armor state are already available.

Printed behavior to preserve and reverify during implementation:

- For S.D.C. body armor, a successful strike above A.R. hits the wearer's body;
  a successful strike at or below A.R. hits and ablates the armor.
- Natural A.R. uses different semantics: a successful strike at or below A.R. fails
  to penetrate rather than damaging a separate armor pool.
- S.D.C. armor at zero is wrecked, after which damage flows to the wearer according
  to the existing S.D.C.-before-Hit-Points rules.
- One M.D. equals 100 S.D.C. The implementation must make an explicit M.D.C. policy:
  either model M.D.C. pools and S.D.C./M.D. interactions correctly or keep M.D.C.
  items display-only with an explicit S.D.C.-tier boundary.

Rules-engine responsibilities:

- derive the defenses and bonuses allowed by attacker, defender, weapon, range, and
  combat context before calling `resolveStrike(input)`;
- apply S.D.C. armor A.R. penetration rules and armor-type semantics from the printed
  source;
- define the explicit M.D.C. interaction policy; and
- return a routed damage result that identifies armor, personal S.D.C., Hit Points,
  or M.D.C. as the affected pool without mutating state.

Backend responsibilities:

- rederive attacker and defender state inside every mutation;
- validate caller choices against the engine-derived legal actions;
- roll or accept only the inputs authorized by the server contract;
- apply the routed result atomically to the correct persisted pools; and
- reject stale, contradictory, or illegal combat state.

Web responsibilities:

- select a hostile target;
- present only engine-authorized attacks and defenses;
- display strike, defense, A.R., routing, critical, and damage results; and
- reset per-character combat state on route-parameter changes with ownership-token
  protection for asynchronous work.

Out of scope: called shots, hit locations, paired weapons, bursts, payload tracking,
and a generic spell-effect interpreter unless separately designed and approved.
```

Read issue #44 back. Confirm it remains open and accurately treats
`resolveStrike(input)` as an existing pure boundary, not a future three-argument API.

- [x] **Step 7: Update and close milestone M2 last**

Re-run:

```powershell
gh api repos/StreamDemon/RiftForge/milestones/2
```

Proceed only if M2 still has `open_issues: 0` and `closed_issues: 3`. Then run:

```powershell
gh api --method PATCH repos/StreamDemon/RiftForge/milestones/2 -f 'title=M2: Web app (builder + sheet)' -f 'description=A SolidJS/Convex frontend: the guided builder wizard and the interactive character sheet.' -f 'state=closed'
```

The GitHub connector has issue mutation support but no milestone mutation surface, so
this narrowly scoped `gh api` call is intentional.

- [x] **Step 8: Read every tracker value back**

Fetch issues #16, #20, #28, and #44 again with
`mcp__codex_apps__github_fetch_issue`, and fetch both edited comments again with
`mcp__codex_apps__github_fetch_issue_comments`. Run:

```powershell
gh api repos/StreamDemon/RiftForge/milestones/2
gh api repos/StreamDemon/RiftForge/milestones/3
```

Expected final tracker state:

- #16 is closed, its body describes the delivered `resolveStrike(input)` boundary,
  and comment `5002421933` records PR #49's merge.
- #20 is closed and comment `5006583446` records the complete H2H projection.
- #28 is open and owns review of 156 spells, 45 skills, and the current test suite.
- #44 is open and owns equipment-aware defense derivation, A.R./armor/M.D.C.
  routing, backend persistence, and combat UI.
- M2 is closed and its description says SolidJS/Convex.
- M3 is open and otherwise unchanged.

If a read-back differs, correct only the target that failed verification and read it
back again before recording completion.

---

### Task 5: Record the Outcome, Run Final Gates, and Commit the Evidence

**Files:**

- Modify:
  `.codex/superpowers/specs/2026-07-18-docs-tracker-alignment-design.md`
- Modify:
  `.codex/superpowers/plans/2026-07-18-docs-tracker-alignment.md`

- [x] **Step 1: Append the implementation outcome to the approved design**

Append this section to
`.codex/superpowers/specs/2026-07-18-docs-tracker-alignment-design.md`:

```markdown
## Implementation outcome

Completed on `docs/align-project-state` on 2026-07-19.

- Living documentation now describes the merged builder, live sheet, backend
  mutations, and rules APIs while retaining #44's explicit combat-routing boundary.
- The combat plan, combat design, and July 3 review retain their historical content
  with completion or snapshot context.
- Issues #16 and #20 remain closed with merged-outcome comments; issues #28 and #44
  remain open with current scope and baselines.
- Milestone M2 is closed with SolidJS/Convex wording; milestone M3 remains open.
- No runtime source file changed.

Final repository verification passed `vp check`, `vp test`, and `git diff --check`.
The test run completed 309 tests across 19 files.
```

- [x] **Step 2: Mark this plan as completed without rewriting its instructions**

In this plan:

1. Replace `**Status:** Approved and ready to execute on 2026-07-18.` with:

   ```markdown
   **Status:** Completed on 2026-07-19.
   ```

2. Change every execution checkbox in Tasks 1–5 from `- [ ]` to `- [x]` only after
   its described work and evidence are complete.

Do not check a step that was skipped, partially performed, or blocked. Resolve it or
leave it visibly incomplete and report the blocker.

- [x] **Step 3: Run final repository gates**

Run:

```powershell
vp check
vp test
git diff --check
git status --short --branch
git diff --name-only HEAD
```

Expected:

- `vp check` exits zero.
- `vp test` exits zero with 309 tests across 19 files.
- `git diff --check` prints nothing.
- Since the Task 3 commit, only the current alignment design and plan are modified.
- No file under `apps/` or `packages/` is modified.

- [x] **Step 4: Commit the final outcome record**

Run:

```powershell
git add -- .codex/superpowers/specs/2026-07-18-docs-tracker-alignment-design.md .codex/superpowers/plans/2026-07-18-docs-tracker-alignment.md
git diff --cached --check
git diff --cached --name-only
git commit -m "docs: record tracker alignment outcome"
```

Expected:

- Exactly the current alignment design and plan are staged.
- The commit succeeds without an attribution trailer.

- [x] **Step 5: Perform the clean handoff check**

Run:

```powershell
git status --short --branch
git log --oneline --decorate main..HEAD
git diff --name-only main...HEAD
```

Expected:

- The worktree is clean on `docs/align-project-state`.
- The branch contains four focused commits:
  1. `docs: design project-state alignment`
  2. `docs: plan project-state alignment`
  3. `docs: align project state after combat merge`
  4. `docs: record tracker alignment outcome`
- The branch diff contains documentation only and no `apps/` or `packages/` files.
- The branch has not been pushed and no pull request has been opened.

- [x] **Step 6: Report completion with evidence**

The handoff must state:

- the branch name and four commit subjects;
- the living and historical documents updated;
- the final state of #16, #20, #28, #44, M2, and M3;
- exact `vp check`, `vp test`, and `git diff --check` outcomes;
- confirmation that runtime source files were untouched; and
- confirmation that publication has not occurred.

Do not claim completion from expected values. Use the final command output and GitHub
read-backs from this execution.

---

## Final-review correction

The final whole-branch review corrected the rejected Cubic history in this plan and
the combat design. Review comment `3607819653` proposed adding P.P. and general
Hand-to-Hand strike bonuses to `strikeGuns`; tests and rendered RUE p.360 evidence
showed that those general bonuses do not apply to modern weapons and that
`strikeGuns` correctly exposes only the specifically named gun bonus. The alignment
design's Date and Status header lines were also normalized to ordinary Markdown
paragraphs without trailing spaces.

The existing issue #16 comment `5002421933` was updated in place. Live read-back
confirmed the unique ID, the unchanged total of four issue comments, and an exact
match to the corrected payload above. The final outcome commit was amended in place,
preserving the four planned commit subjects. Refreshed `vp check`, `vp test`,
full-range whitespace, history, documentation-only scope, and clean-status gates
passed; the test run remained 309 tests across 19 files.
