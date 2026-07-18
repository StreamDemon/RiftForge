# Rules Layer Quality & Correctness Review — 2026-07-03

> **Historical snapshot.** This review describes the pre-app rules layer on
> 2026-07-03. The post-PR #49 baseline is 309 tests across 19 files, 156 spells
> covering levels 1–15, 45 skills, and complete Hand-to-Hand bonus projection. The
> original findings and counts below are preserved as a dated record; remaining
> rules-fidelity and test-quality work is tracked in issue #28.

Multi-lens review of `packages/rules` before starting the app layer (issue #6).
Method: 10 review lenses (5 code, 5 rulebook-fidelity vs the scanned RUE PDF) with
adversarial verification. 7 of 10 lenses completed; findings below were verified
either by two independent adversarial verifiers or directly against the source.

Baseline: 73/73 tests pass, `vp check` clean (format, lint, types), `dist/` gitignored.

---

## Verified clean (high confidence)

- **No P0s. All engine arithmetic is correct.** `deriveSheet` was hand-traced end-to-end
  for a level-1 LLW and probed empirically with a 10-case script: attribute thresholds
  (exactly 16, exactly 30), dice min/max/avg for `3D6*10+20`, HP/SDC/PPE per-level
  arithmetic (no off-by-one), H2H accumulation boundaries, spell-strength gating,
  skill stacking/capping — all correct.
- **Attribute Bonus Chart** (`attribute-bonuses.json`) matches printed p.281
  cell-for-cell: all 8 attributes × values 16–30, including the non-linear runs
  (M.E. 20/21, M.A. 80→97, P.B. 80→92, P.E. coma 6→8 skip at 19).
- **Ley Line Walker entry** (pp.113–116): zero transcription errors. Requirements,
  P.P.E. (3D6×10+20+P.E., +3D6/level from 2, recovery 7/15), all 13 abilities,
  17 Rift & Ley Line spell costs, all skills/bonuses, equipment, money — exact.
- **H2H: Basic** matches p.347 for all 15 levels (not confused with Expert).
  **Saving throws** match p.346 exactly incl. psionics by saver class.
  **Vitals** (HP = P.E.+1D6 at L1, +1D6/level; SDC 2D6+12; coma floor −P.E.) match pp.286–287.
- **Referential integrity**: every skillId/hthId the LLW references resolves; no
  duplicate ids; initial spell selection satisfiable (10/5/10/5 spells at levels 1–4 ≥ 3 picks).
- **Convex-ready** (issue #6): `deriveSheet` output passes `convexToJson` (explicit-
  `undefined` fields stripped, not thrown); no Maps/classes/Dates; Convex's esbuild
  handles the `with { type: "json" }` import attributes.

---

## P1 — fix before building on top

### 1. A by-the-book LLW cannot be represented: duplicate-skillId refine vs "Language: Other × 2"

`schema/character.ts:43-48` rejects any repeated `skillId`. The LLW's own O.C.C. grant is
`{ "skillId": "language-other", "choose": 2 }`, and the catalog note on `language-other`
says "Can be taken repeatedly; one language per selection." Representing both picks
throws inside `deriveSheet` (`characterSchema.parse`).
**Fix:** allow repeats for skills flagged repeatable in the catalog (and ideally carry a
`label`/instance discriminator, e.g. which language).

### 2. Unknown skill/spell ids are silently dropped from the sheet

`engine/character.ts:134` and `:138` filter out unresolvable ids; the sheet renders with
skills missing and `spells.count` silently wrong. Directly dangerous while the spell
catalog is incomplete (#13): a stored character with a level-5 spell would silently lose
it. Inconsistent with the codebase's own pattern — unknown O.C.C. and H2H ids throw.
**Fix:** throw (or collect into a `problems` list on the sheet) like `getOcc`/H2H do.

### 3. The Native Tongue flat-98% grant is unreachable — O.C.C. skill grants are dead data

Content encodes `occSkills[0] = { skillId: "language-native-tongue", atLevel1: 98, fixed: true }`;
the engine even has `ResolveSkillOptions.overrideValue` (tests-only). But `deriveSheet`
never reads `occ.occSkills`, and `characterSkillSchema` has no field to carry an override,
so every derived LLW shows 88% (+IQ) instead of 98%.
_Caveat:_ issue #11 (O.C.C.-skill auto-assembly) covers applying grants — but the schema
gap (no override channel) will block #11 as designed, so it belongs on that issue's
acceptance criteria. Until #11 lands, sheets are wrong for a core LLW skill.

## P2 — hardening before the Convex layer

4. **[CONFIRMED 2/2] pullPunch / rollWithImpact / disarm computed then discarded** —
   `hthBonuses` accumulates them from content (test-asserted), but `CombatProfile`
   (`combat.ts:144-162`) and the sheet (`character.ts:146-152`) carry only
   strike/parry/dodge/damage. Carry all bonus keys through.
5. **Attribute-chart schema doesn't enforce `byValue` coverage of 16–30** — a missing row
   validates and `effectBonus`'s `?? 0` (`attributes.ts:41`) turns a transcription hole into
   a silent +0, contradicting the module's documented "bad data can never reach the app"
   guarantee. Add a coverage refine (+ one-definition-per-code).
6. **Dangling `requires` ids in skills.json** — `literacy`, `basic-mechanics`,
   `basic-electronics` don't exist in the catalog; nothing validates prerequisite ids.
7. **Attributes > 30 silently clamp** — `isBeyondChart()` exists but nothing consults it;
   schema has no upper bound; the book continues P.S. damage / P.E. coma / I.Q. tracks
   beyond 30. Surface a flag on the sheet (or reject until Beyond-30 is modeled).
8. **Low-attribute penalties (pp.282–283) unencoded** — attributes ≤ 8 should carry
   negative modifiers; sheets silently omit them. Untracked scope gap → file an issue.
9. **S.D.C. has no additive mechanism** — sheet S.D.C. is always bare 2D6+12; the book's
   accumulative O.C.C./Physical-skill S.D.C. bonuses have no channel in schema/content/engine.
10. **LLW attribute requirements + related-skill category rules are inert** — I.Q. 10 /
    P.E. 12 and the 17 category rules are transcribed but unenforceable free text; also the
    catalog has one Science skill (`math-basic`) vs the LLW's "min 2 Science" constraint —
    unsatisfiable until more skills are transcribed. (Builder-layer concern: #9/#11/#12.)

## P3 — polish / latent traps (verified real, low urgency)

- Sheet `saves` omits four transcribed kinds: disease, non-lethal poison, harmful drugs, ritual magic.
- P.E. save prose (p.281) also covers disease/all poisons; content maps only magic + lethal poison.
- Spd derives nothing (book: ×20 yds/min, ×5 per melee round).
- `level` unbounded (99 validates and extrapolates past the level-15 tables); `rolled`
  values not checked against the derivable min/max.
- `occSpellStrength` takes the **first** spellStrength bonus (`.find`) while `occSaveBonus`
  sums all — order-dependent silent drops on schema-valid multi-entry content.
- Empty `atLevels: []` flips a level-gated bonus into an always-on flat bonus.
- `resolveSkill` has no 0 floor (negative % representable); `overrideValue` path drops `value2`.
- `spells.known` returns live references into the module-level catalog (mutation hazard).
- `schema/dice.ts` is missing from `src/index.ts` exports.
- H2H type index is last-wins on duplicate ids (skills/spells fail fast).
- Schema strictness: `category` is a free string; `occBonusSchema` barely discriminates;
  `spellKnowledge` accepts negative/zero picks; `package.json` has no `types` field and
  `vp pack`'s dist is orphaned (fine while private/source-consumed).

---

## Not covered (review gaps — agents died on session limits)

1. **Spells fidelity**: `spells.json` (levels 1–4) vs printed pp.197–206 + Principles of
   Magic pp.185–190. _Partial mitigation:_ the LLW lens verified all 17 Rift & Ley Line
   spell costs; P.P.E./spell-strength engine mechanics verified level-aware in PR #5.
2. **Skills fidelity**: the 39 catalog skills' base% / per-level vs pp.304–329.
3. **Test-quality lens** (coverage gaps, tautological assertions) never ran.

Recommended follow-up: targeted inline spot-checks of (1) and (2) — a few PDF pages,
no subagents — before or alongside issue #6.
