# Full M.D.C. Combat Exchange Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver issue #51 by extending the persisted combat exchange through the complete S.D.C./M.D.C. routing matrix, including deterministic fatal overflow and a terminal dead-dossier state, while preserving legacy exchange history.

**Architecture:** Extend the page-stamped rules boundary and existing pure combat resolver rather than creating a second M.D.C. path. Every newly resolved hit emits a version-2 evidence route containing native damage, conversion, protection/body deltas, final-blast absorption, and life-state outcome. Convex remains the sole dice and persistence authority and applies the route atomically. SolidJS exposes legal M.D. weapons, explicit units/history, and a readable terminal state within the existing Ley Terminal design.

**Tech Stack:** TypeScript, Zod, JSON rules content, Convex 1.42, SolidJS 1.9, Tailwind CSS 4, Vite+ (`vp`), Vite+ Test, pnpm 11.

## Global Constraints

- Work directly in `D:\Projects\riftforge` on `feat/mdc-combat-exchange`; do not create a worktree.
- Treat `.codex/superpowers/specs/2026-07-21-mdc-combat-exchange-design.md` as the approved contract and rendered RUE pp. 287, 288, and 354-359 as rules authority.
- Keep optional pp. 358-359 injury/survival work in issue #54 and the generic effects pipeline in issue #53; neither belongs in #51.
- Use the existing persisted exchange, not a parallel M.D.C. resolver. Keep `characters.applyDamage` S.D.C.-only; hostile M.D. writes occur only through exchanges.
- Multiply critical damage in the native tier before conversion. `totalDamage` remains the native completed weapon total.
- Apply A.R. to S.D.C. armor for both tiers. M.D.C. armor has no A.R. The final M.D.C. absorbs the full destroying blast with no spill.
- A depleted M.D.C. shell stops S.D.C. strike totals 1-7, admits 8+, and does not stop M.D.
- Raw H.P. below `-P.E.` is fatal; exactly `-P.E.` is coma. Fatal persistence is S.D.C. `0`, H.P. at the floor, `current.lifeState = "dead"`.
- Rules remain pure/deterministic. Convex owns dice and state. Clients never choose damage tier, route, conversion, or after-values.
- Preserve exact legacy route validation/history without migration. Old/racing pending exchanges stale safely.
- Preserve route-epoch and exchange-ID ownership guards because parameterized routes do not remount.
- Use stable `ConvexError` codes for expected combat refusals; the web must not parse English messages.
- Use Vite+; in `packages/backend` use `pnpm exec`, never `npx`.
- Work red -> green -> refactor. Run package gates before root gates. Checkpoint-commit every task.
- No AI attribution. Never commit to `main`, merge, or manually close #51; the human maintainer merges.
- Live-browser acceptance is mandatory for this user-visible change.

### Frontend direction

- Continue the compact Ley Terminal command rail; add no rounded card system, decorative art, or cyan M.D.C. language.
- Use amber for stopped/armor absorption, blood red for body/fatal harm, and green for defended/safely settled results.
- Label every amount `S.D.C.` or `M.D.`; color is never the only signal.
- Keep a dead dossier, equipment, inventory management, narrative, cancellation cleanup, and history readable while disabling gameplay actions with an explicit reason.

---

## File Map

### Rules

- `packages/rules/src/schema/combat-exchange.ts` and `src/content/combat/combat-exchange.json`: page-stamped M.D.C. constants and stable errors.
- `packages/rules/src/schema/character.ts`: optional persisted terminal marker only.
- `packages/rules/src/engine/combat.ts`: fatal-aware body damage plus legacy pool wrapper.
- `packages/rules/src/engine/character.ts`: derived `alive | coma | dead` and terminal invariants.
- `packages/rules/src/engine/combat-exchange.ts`: legal M.D. profiles, M.D.C. readiness, v2 tokens, complete routing matrix.
- `packages/rules/src/index.ts`: additive exports.
- `packages/rules/tests/{combat,character,combat-exchange}.test.ts`: pure boundaries and matrix.

### Backend

- `packages/backend/convex/schema.ts`: optional dead marker.
- `packages/backend/convex/character_state.ts`: shared living guard.
- `packages/backend/convex/characters.ts`: fatal manual S.D.C. damage and terminal guards.
- `packages/backend/convex/combat_values.ts`: exact union of legacy and v2 routes.
- `packages/backend/convex/combat.ts`: target readiness, legal M.D. declarations, atomic route writes.
- `packages/backend/convex/_generated/{api,dataModel}.d.ts`: regenerate only if codegen changes them.
- `packages/backend/tests/{characters,combat}.test.ts`: mutation, compatibility, race, atomicity tests.

### Web and delivery

- `apps/web/src/lib/combat-exchange.ts`: version-aware presentation and disabled reasons.
- `apps/web/src/components/combat-exchange-panel.tsx`: M.D. selection/results and terminal mode.
- `apps/web/src/components/sheet-view.tsx`: derived life-state presentation and gameplay disabling.
- `apps/web/src/pages/character-sheet.tsx`: terminal command rail and navigation ownership.
- `apps/web/tests/combat-exchange.test.ts`: selection, labels, routes, tones, ownership.
- Create `apps/web/tests/character-sheet.test.ts`: terminal dossier behavior.
- `README.md`, approved design, and this plan: final aligned evidence.

---

### Task 1: Page-Stamped M.D.C. Rules Boundary

**Files:** Modify `packages/rules/src/schema/combat-exchange.ts`, `packages/rules/src/content/combat/combat-exchange.json`, `packages/rules/src/index.ts`, and `packages/rules/tests/combat-exchange.test.ts`.

**Contract:**

```ts
pages: {
  megaDamageIntro: 288;
  megaDamageCombat: 355;
}
rules: {
  sdcPerMd: 100;
  minimumSdcToDamageMdc: 100;
  depletedMdcArmorBypassStrike: 8;
  finalMdcAbsorbsDestroyingBlast: true;
}
```

- [x] Add failing tests asserting all six exact values and negative schema tests for altered literals.
- [x] Run `vp test packages/rules/tests/combat-exchange.test.ts`; observe missing-field failure.
- [x] Add `z.literal(...)` fields under the existing `pages`/`rules` objects and matching JSON values; retain all existing constants/exports.
- [x] Run `vp test packages/rules/tests/combat-exchange.test.ts`, `vp run @riftforge/rules#check`, and `vp run @riftforge/rules#test`; expect PASS.
- [x] Commit:

```text
git add -- packages/rules/src/schema/combat-exchange.ts packages/rules/src/content/combat/combat-exchange.json packages/rules/src/index.ts packages/rules/tests/combat-exchange.test.ts
git commit -m "feat(rules): stamp mega-damage exchange rules"
```

---

### Task 2: Fatal-Aware Body Damage and Derived Life State

**Files:** Modify `packages/rules/src/schema/character.ts`, `packages/rules/src/engine/{combat,character}.ts`, `packages/rules/src/index.ts`, and `packages/rules/tests/{combat,character}.test.ts`.

**Contract:**

```ts
export type LifeState = "alive" | "coma" | "dead";
export interface BodyDamageResult {
  before: VitalsPool;
  after: VitalsPool;
  rawHitPoints: number;
  lifeState: LifeState;
}
export function applyBodyDamage(
  pool: VitalsPool,
  damage: number,
  comaDeathFloor: number,
): BodyDamageResult;
```

Persist only `lifeState: z.literal("dead").optional()`; add `lifeState` to `CharacterSheet.vitals`.

- [x] Add a table for `{sdc:0, hitPoints:1}`, floor `-10`: damage `1 -> coma/0`, `11 -> coma/-10`, `12 -> dead/-10` with raw `-11`. Prove S.D.C. drains first and existing `applyDamage` still returns the clamped pool.
- [x] Add character tests: positive H.P. => alive; H.P. `0` through floor => coma; dead marker valid only with rolled vitals, S.D.C. `0`, H.P. exactly floor; contradictory/unrolled dead state rejected; legacy marker-absent documents valid.
- [x] Run `vp test packages/rules/tests/combat.test.ts packages/rules/tests/character.test.ts`; observe failure.
- [x] Implement:

```ts
const sdcDamage = Math.min(pool.sdc, damage);
const rawHitPoints = pool.hitPoints - (damage - sdcDamage);
const lifeState = rawHitPoints < comaDeathFloor ? "dead" : rawHitPoints <= 0 ? "coma" : "alive";
const after = {
  sdc: pool.sdc - sdcDamage,
  hitPoints: Math.max(comaDeathFloor, rawHitPoints),
};
```

Keep integer/nonnegative validation. Make `applyDamage(...)` return `applyBodyDamage(...).after` for compatibility.

- [x] In `deriveSheet`, validate terminal invariants after pools/floor are known and derive unpersisted alive/coma from current H.P.
- [x] Run focused tests and rules check/test; expect PASS.
- [x] Commit:

```text
git add -- packages/rules/src/schema/character.ts packages/rules/src/engine/combat.ts packages/rules/src/engine/character.ts packages/rules/src/index.ts packages/rules/tests/combat.test.ts packages/rules/tests/character.test.ts
git commit -m "feat(rules): derive terminal life state"
```

---

### Task 3: Legal M.D. Profiles, M.D.C. Readiness, and v2 Tokens

**Files:** Modify `packages/rules/src/schema/combat-exchange.ts`, `packages/rules/src/engine/combat-exchange.ts`, and `packages/rules/tests/combat-exchange.test.ts`.

**Contract:** Supported `AttackProfile.damageType` is `"sdc" | "md"`. Preserve M.D.C. protection even at current `0`; worn unrolled armor derives `mdcArmor` with absent max/current. Add `combatantDead` and `armorNotReady` errors, but retain legacy unsupported error values for persisted data.

- [x] Replace M.D. refusal tests with legal energy-pistol/rifle profiles, printed formulas, unchanged strike/critical data, and `damageType: "md"`.
- [x] Test full/partial/depleted M.D.C. armor stays `mdcArmor`; unrolled armor exposes absent pools; depleted S.D.C. armor retains current no-protection behavior.
- [x] Test attacker token changes with damage tier/selected weapon. Defender token changes with life state, tier, M.D.C. readiness/max/current. Narrative, P.P.E., unrelated inventory remain excluded.
- [x] Run focused rules test; observe current refusal/collapse failure.
- [x] Return the validated item tier directly in supported profiles. Preserve all worn M.D.C. armor in `deriveProtection`.
- [x] Prefix explicit ordered token tuples `attacker-v2`/`defender-v2`; include the new relevant fields without serializing the whole sheet.
- [x] Run focused test and rules check/test; expect PASS.
- [x] Commit:

```text
git add -- packages/rules/src/schema/combat-exchange.ts packages/rules/src/engine/combat-exchange.ts packages/rules/tests/combat-exchange.test.ts
git commit -m "feat(rules): authorize mega-damage attacks"
```

---

### Task 4: Version-2 Tiered Routing and Resolution

**Files:** Modify `packages/rules/src/engine/combat-exchange.ts`, `packages/rules/src/index.ts`, and `packages/rules/tests/combat-exchange.test.ts`.

**Contract:**

```ts
export type DamageAmount = { type: "sdc" | "md"; value: number };
export type ProtectionDamageSnapshot = {
  kind: "sdcArmor" | "mdcArmor";
  itemId: string;
  name: string;
  before: number;
  after: number;
};
export type BodyDamageSnapshot = { before: VitalsPool; after: VitalsPool };
```

`TieredDamageRoute` is an exact union:

- `{routingVersion:2, kind:"stopped", reason:"intactMdcImpervious"|"depletedMdcShell", nativeDamage, armor, body}`
- `{routingVersion:2, kind:"armor", nativeDamage, convertedDamage?, armor, body, finalBlastAbsorbed}`
- `{routingVersion:2, kind:"body", nativeDamage, convertedDamage?, armor?, body, lifeState:{before:"alive"|"coma", after:"alive"|"coma"}}`
- `{routingVersion:2, kind:"fatal", nativeDamage, convertedDamage?, armor?, body, lifeState:{before:"alive"|"coma", after:"dead"}}`

All new hits use this union. Keep legacy `SdcDamageRoute` exported only for persisted validation/presentation.

- [x] Add intact-M.D.C. conversion tests for `99/100/199/200` plus printed `450/496 -> 4 M.D.C.`.
- [x] Add final-point M.D.C. no-spill and `finalBlastAbsorbed` tests.
- [x] Add depleted-shell tests for S.D.C. strike `7/8` and native M.D. bypass.
- [x] Add S.D.C.-armor tests for S.D. and M.D. attacks at/below/above A.R.
- [x] Add no-armor S.D./M.D. body tests for S.D.C.-before-H.P., exact floor, and fatal overflow.
- [x] Add a critical M.D. resolver test proving `totalDamage = native roll * multiplier` before `convertedDamage = totalDamage * 100`.
- [x] Assert every new hit has v2, native/converted evidence, exact armor/body snapshots, and no unsupported-M.D.C. route.
- [x] Run focused test; observe S.D.C.-only failures.
- [x] Implement exact helpers:

```ts
const sdcToMd = (value: number): DamageAmount => ({
  type: "md",
  value: Math.floor(value / combatExchangeRules.rules.sdcPerMd),
});
const mdToSdc = (value: number): DamageAmount => ({
  type: "sdc",
  value: value * combatExchangeRules.rules.sdcPerMd,
});
```

- [x] Implement routing in this order: S.D.C. armor A.R.; intact M.D.C.; depleted M.D.C. shell; no protection; fatal-aware body. `damageArmor` clamps armor; `finalBlastAbsorbed` is true when the armor hit ends at `0`; never spill armor damage.
- [x] Resolve using `{type: input.attack.damageType, value: totalDamage}` after critical multiplication and pass the actual tier to strike evaluation.
- [x] Run focused tests and rules check/test; expect PASS.
- [x] Commit:

```text
git add -- packages/rules/src/engine/combat-exchange.ts packages/rules/src/index.ts packages/rules/tests/combat-exchange.test.ts
git commit -m "feat(rules): resolve tiered combat damage"
```

---

### Task 5: Backward-Compatible Convex Values and Schema

**Files:** Modify `packages/backend/convex/schema.ts`, `packages/backend/convex/combat_values.ts`, generated types if changed, and `packages/backend/tests/combat.test.ts`.

**Contract:** Keep the legacy route validator exact, add separately discriminated v2 validators matching Task 4, and use `route: v.union(legacySdcDamageRouteValidator, tieredDamageRouteValidator)`. Add `lifeState: v.optional(v.literal("dead"))` to character current state.

- [x] Add fixtures proving legacy armor/body routes and v2 stopped/armor/fatal routes all insert/read unchanged. Add negative fixtures for missing v2 native damage, fatal ending in coma, and extra legacy fields.
- [x] Run `vp test packages/backend/tests/combat.test.ts`; observe validator failures.
- [x] Add exact `DamageAmount`, protection/body snapshot, and four v2 route validators with `v.literal(2)`. Optional fields are optional only on branches allowed by the rules type.
- [x] Preserve legacy unsupported error codes; add `combatantDead` and `armorNotReady`.
- [x] Add the dead marker to schema. From `packages/backend`, run `pnpm exec convex codegen`; do not hand-edit or commit generated files unless they change.
- [x] Run backend focused test and backend check/test; expect PASS.
- [x] Commit:

```text
git add -- packages/backend/convex/schema.ts packages/backend/convex/combat_values.ts packages/backend/convex/_generated/dataModel.d.ts packages/backend/convex/_generated/api.d.ts packages/backend/tests/combat.test.ts
git commit -m "feat(backend): validate tiered combat routes"
```

---

### Task 6: Terminal Character Writes and Fatal Manual S.D.C. Damage

**Files:** Modify `packages/backend/convex/character_state.ts`, `packages/backend/convex/characters.ts`, and `packages/backend/tests/characters.test.ts`.

**Contract:**

```ts
export function requireLiving(character: Character, action: string): void;
// Throws: Life signs terminated — dead characters cannot ${action}.
```

Manual damage returns `lifeState: "alive" | "coma" | "dead"` but accepts no tier argument.

- [x] Add manual damage tests at P.E. 10/current `{sdc:0,hp:1}`: 11 damage stores coma at -10 without marker; 12 stores dead at -10 with marker and raw overflow is not persisted.
- [x] Add dead-character rejections without state change for full update, roll/restore vitals, damage/healing, rest/meditation, treatment, ley draw, and casting (including cross-character healing).
- [x] Prove narrative edits and inventory add/remove/equip remain available and preserve the marker.
- [x] Run `vp test packages/backend/tests/characters.test.ts`; observe current floor-only/unguarded failures.
- [x] Implement `requireLiving` and call it after authoritative load but before dice or gameplay writes. Guard both caster and healing target. Guard existing document before full replacement.
- [x] Replace pool-only damage with:

```ts
const result = applyBodyDamage(damagePools(sheet), args.amount, sheet.vitals.comaDeathFloor);
const current = {
  ...character.current,
  sdc: result.after.sdc,
  hitPoints: result.after.hitPoints,
  ...(result.lifeState === "dead" ? { lifeState: "dead" as const } : {}),
};
```

Patch once; return before/after/amount/lifeState. Keep the mutation S.D.C.-only.

- [x] Run focused test and backend check/test; expect PASS.
- [x] Commit:

```text
git add -- packages/backend/convex/character_state.ts packages/backend/convex/characters.ts packages/backend/tests/characters.test.ts
git commit -m "feat(backend): enforce terminal life state"
```

---

### Task 7: M.D.C.-Ready Target Discovery and Declaration

**Files:** Modify `packages/backend/convex/combat.ts` and `packages/backend/tests/combat.test.ts`.

**Contract:** Target summaries add `lifeState`, full `ProtectionState`, and optional `disabledReason: "defenderNotReady" | "armorNotReady" | "combatantDead"`.

- [x] Test discovery for intact/depleted rolled M.D.C. armor (enabled), unrolled worn M.D.C. (`armorNotReady`), dead target (`combatantDead` precedence), unrolled body (`defenderNotReady`), and unchanged S.D.C. target.
- [x] Test legal energy-pistol/rifle declarations store `damageType:"md"` and roll strike exactly once. Dead attacker/defender and unready armor must insert nothing and roll nothing.
- [x] Run backend combat test; observe current unsupported refusals.
- [x] Reject dead sheets with `combatFailure("combatantDead", ...)`. Reject only M.D.C. protection with absent max/current using `combatFailure("armorNotReady", ...)`; do not reject legal M.D. or depleted armor.
- [x] Persist the real attack profile/tier. Re-read both sheets, verify expected item identity/state, compute v2 tokens, roll once, and insert once. Keep current indexes/limits.
- [x] Run focused test and backend check/test; expect PASS.
- [x] Commit:

```text
git add -- packages/backend/convex/combat.ts packages/backend/tests/combat.test.ts
git commit -m "feat(backend): declare mega-damage attacks"
```

---

### Task 8: Atomic Tiered Resolution, Death, and Stale Races

**Files:** Modify `packages/backend/convex/combat.ts` and `packages/backend/tests/combat.test.ts`.

- [x] Add atomic intact-M.D.C. tests: S.D.C. 99 stopped, 100 ablates 1, and a destroying M.D. blast patches armor only.
- [x] Add atomic depleted-shell tests: S.D.C. strike 7 stopped, strike 8 hits body, and M.D. converts into body.
- [x] Add atomic S.D.C.-armor tests for M.D. at/below and above A.R.
- [x] Add exact-floor coma and one-point-overflow fatal marker tests. Assert native `totalDamage` and full route evidence.
- [x] Add stale races for death, armor readiness, and selected-weapon change after declaration.
- [x] Add idempotency/compatibility tests: cleanup cancellation remains legal, duplicate response never double-applies, and legacy v1 tokens stale safely.
- [x] Run backend combat test; observe S.D.C.-only write failures.
- [x] Call `resolveCombatExchange` with stored attack tier, completed server rolls, rederived protection/body, and derived floor. Convex does no conversion.
- [x] Apply one route patch: stopped => none; armor => armor only; body => S.D.C./H.P.; fatal => S.D.C./H.P./dead together. Patch exchange resolution in the same Convex mutation. Legacy routes are never newly generated.
- [x] Check v2 tokens before defense/damage rolls. Any race, including newly dead, settles through stale logic with no character patch; stable dead errors are for new declarations.
- [x] Run `vp test packages/backend/tests/combat.test.ts packages/backend/tests/characters.test.ts` and backend check/test; expect PASS.
- [x] Commit:

```text
git add -- packages/backend/convex/combat.ts packages/backend/tests/combat.test.ts
git commit -m "feat(backend): persist tiered combat outcomes"
```

---

### Task 9: Unit-Aware Web Presentation and Legal M.D. Selection

**Files:** Modify `apps/web/src/lib/combat-exchange.ts`, `apps/web/src/components/combat-exchange-panel.tsx`, and `apps/web/tests/combat-exchange.test.ts`.

- [x] Replace M.D. disabled tests: legal catalog M.D. weapons are enabled and labeled with formula plus `M.D.`; invalid modes retain their reason.
- [x] Pin server-reason copy exactly: `defenderNotReady -> Roll this target's H.P. and S.D.C. first.`, `armorNotReady -> Roll this target's worn armor M.D.C. first.`, `combatantDead -> Life signs terminated; this target cannot enter combat.`
- [x] Pin exact legacy formatting unchanged and v2 summaries for stopped S.D.C., `496 S.D.C. -> 4 M.D.C.`, native M.D. ablation, M.D.-to-body conversion, final blast, depleted shell, and fatal termination.
- [x] Pin tones: stopped/armor `warn`, body/fatal `bad`, defended `good`, cancelled `dim`.
- [x] Run `vp test apps/web/tests/combat-exchange.test.ts`; observe M.D. refusal/S.D.C.-only formatter failures.
- [x] Remove unsupported-M.D. copy, map only server stable disabled reasons, and add:

```ts
function isTieredRoute(route: ExchangeRoute): route is TieredDamageRoute {
  return "routingVersion" in route && route.routingVersion === 2;
}
```

Keep legacy formatter branch. Build v2 text from persisted native/converted amounts, reason, before/after values, final-blast flag, and life state; never reconstruct evidence from `totalDamage`.

- [x] Update panel result labels using existing primitives and rail structure; add no new card system.
- [x] Run focused test and web check/test; expect PASS.
- [x] Commit:

```text
git add -- apps/web/src/lib/combat-exchange.ts apps/web/src/components/combat-exchange-panel.tsx apps/web/tests/combat-exchange.test.ts
git commit -m "feat(web): present tiered combat outcomes"
```

---

### Task 10: Terminal Dossier UI Without Hiding History

**Files:** Modify `apps/web/src/components/sheet-view.tsx`, `apps/web/src/components/combat-exchange-panel.tsx`, `apps/web/src/pages/character-sheet.tsx`, `apps/web/tests/combat-exchange.test.ts`; create `apps/web/tests/character-sheet.test.ts`.

**Contract:** Add `gameplayDisabledReason?: string` to `SheetView` props. Use `Life signs terminated; gameplay actions are unavailable.` consistently.

- [x] Add a dead `SheetView` test: terminal label/reason render; identity/vitals/equipment remain; save/skill/weapon/spell/combat rows are disabled with `aria-disabled`/`title`; inventory remains usable.
- [x] Add a dead page/rail test: narrative, telemetry, history, navigation, and cancellation remain; declaration/response/damage/restore/recovery controls are unavailable.
- [x] Add an alive-sheet/page regression proving existing controls remain wired.
- [x] Add route-change regression: dead A -> living B during in-flight request resets drafts, increments epoch, ignores A result, enables B actions.
- [x] Run focused web tests; observe missing terminal behavior.
- [x] Pass terminal reason into save/skill/combat/weapon/spell rows while retaining the actions object for inventory. Terminal reason takes precedence over spell affordability.
- [x] In the page, derive `sheet()?.vitals.lifeState === "dead"`. Replace command-rail gameplay controls with a danger terminal alert; keep telemetry. In combat panel, keep outgoing cancellation/recent history but suppress declaration/response controls and show the alert.
- [x] Extend the existing ID-change reset/epoch logic; do not key/remount the page or replace ownership tokens with booleans.
- [x] Run focused tests and web check/test; expect PASS.
- [x] Commit:

```text
git add -- apps/web/src/components/sheet-view.tsx apps/web/src/components/combat-exchange-panel.tsx apps/web/src/pages/character-sheet.tsx apps/web/tests/character-sheet.test.ts apps/web/tests/combat-exchange.test.ts
git commit -m "feat(web): render terminal character dossiers"
```

---

### Task 11: Cross-Package Hardening and Automated Verification

**Files:** Modify only files already in scope when a reproduced failure requires it; update this plan's checked steps/evidence.

- [x] Run focused boundary suite:

```text
vp test packages/rules/tests/combat.test.ts packages/rules/tests/character.test.ts packages/rules/tests/combat-exchange.test.ts packages/backend/tests/characters.test.ts packages/backend/tests/combat.test.ts apps/web/tests/combat-exchange.test.ts apps/web/tests/character-sheet.test.ts apps/web/tests/convex.test.ts
```

- [x] Run all package gates:

```text
vp run @riftforge/rules#check
vp run @riftforge/rules#test
vp run @riftforge/backend#check
vp run @riftforge/backend#test
vp run @riftforge/web#check
vp run @riftforge/web#test
```

- [x] Run `vp check`, `vp test`, and `git diff --check`; expect PASS.
- [x] Audit the bug class:

```text
rg -n "unsupportedMdWeapon|unsupportedMdcProtection|Full M\.D\.C\. combat is follow-up work|damageType: \"sdc\"" packages apps README.md
rg -n "applyDamage\(|applyBodyDamage\(|lifeState|routingVersion" packages apps
rg -n "TODO|TBD|FIXME" packages/rules/src packages/backend/convex apps/web/src .codex/superpowers/plans/2026-07-21-mdc-combat-exchange.md
```

Legacy validator/enum hits are expected; active refusals, hardcoded S.D.C. resolution, unguarded writes, and incomplete implementation markers are not.

- [x] Compare rules type, Convex validator, and formatter branch-by-branch. Confirm client non-authority, one atomic character patch, exact-floor distinction, and no final-blast spill.
- [x] Use `superpowers:requesting-code-review`. Reproduce findings, add regression tests for real bugs, fix root causes, rerun affected gates.
- [x] If hardening changes code, commit `fix(combat): harden mega-damage invariants`; do not create an empty commit.

---

### Task 12: Live Convex and Browser Acceptance

**Files:** None expected; for a live defect modify the narrow source/test responsible.

- [x] Confirm port 3210 has no stale owner. Start `pnpm exec convex dev` in `packages/backend` and `vp dev` in `apps/web`.
- [x] Seed two reproducible dossiers with `pnpm exec convex run characters:create`: an alive attacker with S.D./M.D. weapons and an alive defender with worn rolled M.D.C. armor. Record returned IDs.
- [x] At `http://localhost:5173`, verify every legal-catalog live route: legal M.D. selection, sub-100 stop, native ablation, final-blast no spill, depleted-shell `7/8`, fatal terminal marker, and legacy/v2 history together. Verify the unavailable 100+ S.D.C.-vs-M.D.C. and M.D.-vs-S.D.C.-armor rows through exact rules/backend tests; the production catalog has no legal browser path for either row.
- [x] On the dead dossier, verify explicit inaccessible gameplay actions while identity, pools, equipment, inventory, narrative, cleanup cancellation, and history remain. Navigate to the living ID without reload; drafts reset/actions re-enable.
- [x] Check desktop and narrow viewport, keyboard/accessibility text, layout clipping, and console errors/warnings.
- [x] For defects: add failing automated test, fix, rerun package gates, repeat scenario.
- [x] Stop web, Convex CLI, and orphaned backend; confirm ports 5173/3210 are closed.

---

### Task 13: Documentation, Issue Evidence, and Draft PR

**Files:** Modify `README.md`, approved design spec, and this plan.

- [x] Replace README's stale “full M.D.C. interaction remains future work” boundary with completed conversion/armor/shell/final-blast/death behavior; defer optional survival to #54.
- [x] Append exact date/time, package/root command outputs and fresh counts, live IDs/scenarios, viewports, and console result to the design; check all completed plan boxes. Never reuse older counts.
- [x] Re-run `vp check`, `vp test`, `git diff --check`, and `git status --short --branch`.
- [x] Commit:

```text
git add -- README.md .codex/superpowers/specs/2026-07-21-mdc-combat-exchange-design.md .codex/superpowers/plans/2026-07-21-mdc-combat-exchange.md
git commit -m "docs: record mega-damage combat delivery"
```

- [x] Push `feat/mdc-combat-exchange` and open draft PR [#55](https://github.com/StreamDemon/RiftForge/pull/55) to `main` summarizing architecture, compatibility, fatal boundary, automation, and live evidence. Link `Closes #51`, `Follow-up #54`, and `Roadmap #53`; no AI attribution; never merge.
- [x] Comment on #51 with verified time-scoped evidence/PR link: [issue comment 5037268203](https://github.com/StreamDemon/RiftForge/issues/51#issuecomment-5037268203). Do not close it manually.
- [x] Use CodeRabbit as the temporary review gate while Cubic is quota-blocked until 2026-08-01. CodeRabbit reviewed `3067c99..4e0afc5`, submitted `APPROVED` with zero inline threads, and left no finding to reproduce or fix. Stop ready for human merge.

---

## Final Acceptance Checklist

- [x] Rendered/page-stamped authority covers every mechanic.
- [x] `99/100/199/200`, printed `450/496`, critical-before-conversion, final-blast, depleted-shell `7/8`, and M.D.-vs-S.D.C.-A.R. are pinned.
- [x] Exact `-P.E.` is coma; below is dead; all gameplay mutations reject dead while inventory/narrative preserve the marker.
- [x] Legacy routes read without migration; pending legacy/racing exchanges stale and never double-apply.
- [x] New history exposes native tier, conversion, reason, and before/after evidence.
- [x] Dead dossiers remain readable/accessibly terminal; route navigation owns async results.
- [x] Rules/backend/web package gates and root gates pass with fresh evidence.
- [x] Live desktop/narrow acceptance passes with clean console.
- [x] README, #51, #54, #53, design, plan, and ready PR agree; human retains merge authority.
