# S.D.C. Combat Exchange Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver issue #44 as a rules-faithful, persisted, two-phase S.D.C. combat exchange: the server rolls a declared strike, the defender/GM chooses an authorized response after seeing it, and Convex resolves and applies the result atomically.

**Architecture:** Add a page-stamped pure `combat-exchange` layer above the existing `resolveStrike` primitive, then expose it through a discriminated Convex exchange ledger and a focused SolidJS command-rail panel. The client submits choices and context only; the server reloads and re-derives both characters, owns all dice, verifies combat-state tokens, routes damage, and persists the character write plus immutable outcome in one mutation.

**Tech Stack:** TypeScript, Zod, JSON rules content, Convex 1.42, SolidJS 1.9, Tailwind CSS 4, Vite+ (`vp`), Vite+ Test, pnpm 11.

## Global Constraints

- Work directly in `D:\Projects\riftforge` on branch `feat/sdc-combat-exchange`; do not create a worktree.
- Treat `.codex/superpowers/specs/2026-07-19-sdc-combat-exchange-design.md` as the approved product and rules contract.
- Treat rendered RUE pages 287, 288, 339-341, 344-346, 355, and 360-361 as the rules authority. Do not add a Natural A.R. branch: rendered p.339 explicitly says Natural A.R. does not apply in Rifts.
- Keep this slice S.D.C.-only. Refuse M.D. weapons and nondepleted M.D.C. protection before rolling dice or inserting an exchange. Full M.D.C. resolution is a separate issue.
- Preserve the production item catalog as transcribed. It currently contains no S.D.C. armor, so exercise that generic route with validated pure fixtures instead of inventing content.
- Keep `resolveStrike(input)` as the low-level opposed-roll primitive. New orchestration belongs in `engine/combat-exchange.ts`.
- Keep rules functions pure and deterministic. They consume derived sheets, explicit context, completed rolls, and completed damage rolls; only Convex calls `Math.random` and writes state.
- Do not add initiative, rounds, action-budget enforcement, authentication/ownership, VTT geometry, cover, bursts, called shots, hit locations, thrown modes, unarmed attacks, or generic spell attacks.
- Keep the current `characters.applyDamage` mutation as a manual GM utility. The hostile exchange path must never accept a client-selected damage route or delegate to that public mutation.
- Use `ConvexError` data with stable codes for expected backend refusals. Do not make the web client parse English error strings to decide behavior.
- Query through indexes and hard limits. Use 50 for target discovery and 20 for each pending/recent ledger feed.
- Parameterized character routes do not remount. Reset all combat drafts on route-ID change and accept an async result only when its captured route epoch and exchange ID still own it.
- Use Vite+ commands, not plain Vite. In `packages/backend`, use `pnpm exec`, never `npx`.
- Follow red -> green -> refactor for each production change. Observe every named focused test fail before implementing it.
- Checkpoint-commit after every task. Do not add AI attribution to commits, issues, comments, or PRs. Never commit to `main`, merge the PR, or close #44 manually.
- Run affected-package gates before root gates. Root `vp check` does not replace the per-package CI gates.

### Frontend direction

- **Visual thesis:** A compact hostile-action console embedded in the existing Ley Terminal right rail: amber for unresolved machine prompts, blood red for applied harm, green for a legal defense or settled safe state, and no ley cyan because combat is not magic.
- **Content plan:** `DECLARE ATTACK` is the primary work surface, `INCOMING` is the response queue, `OUTGOING` is the cancel/awaiting queue, and `RECENT` is the bounded persisted audit trail. Each section has one action and uses dividers rather than a dashboard-card mosaic.
- **Interaction thesis:** Reuse the existing short strike-flash for newly resolved results, preserve the telemetry cursor for ambient live state, and keep form/route transitions immediate and restrained. Add no animation library and no decorative motion.
- Follow `DESIGN.md`: notched geometry, current type system, compact 4px spacing rhythm, native labels, amber focus, no rounded corners, no painted imagery, and no cyan in this feature.

---

## File Map

### New files

- `packages/rules/src/schema/combat-exchange.ts` - attack/context/response enums, reasoned-modifier validation, error-code vocabulary, and page-stamped exchange-rule schema.
- `packages/rules/src/content/combat/combat-exchange.json` - rendered-page citations, melee/ranged target totals, and ranged dodge penalties.
- `packages/rules/src/engine/combat-exchange.ts` - attack profiles, authorized defenses, protection classification, pure resolution/routing, and deterministic combat-state tokens.
- `packages/rules/tests/combat-exchange.test.ts` - the full pure truth table, including future-ready S.D.C. armor fixtures.
- `packages/backend/convex/character-state.ts` - shared character load/validate/patch and expected-item helpers extracted without behavior changes.
- `packages/backend/convex/combat-values.ts` - reusable Convex validators for contexts, rolls, response options, and the discriminated ledger document.
- `packages/backend/convex/combat.ts` - bounded combat queries plus declare/respond/cancel mutations.
- `packages/backend/tests/combat.test.ts` - Convex ledger, mutation, atomicity, stale-token, and boundary tests.
- `apps/web/src/lib/combat-exchange.ts` - pure selector/presentation helpers and async ownership-token helpers.
- `apps/web/tests/combat-exchange.test.ts` - weapon/target presentation, history formatting, tones, and ownership tests.
- `apps/web/src/components/combat-exchange-panel.tsx` - the declare/incoming/outgoing/recent command-rail workflow.

### Modified files

- `packages/rules/src/engine/combat.ts` - expose explicit Hand-to-Hand and automatic-dodge capability plus ranged-defense totals that exclude ordinary H2H dodge.
- `packages/rules/src/engine/character.ts` - project the additive combat-profile fields onto the sheet.
- `packages/rules/src/index.ts` - export the new schema, content boundary, engine types, and helpers.
- `packages/rules/tests/combat.test.ts` - pin capability and ranged-defense derivation.
- `packages/rules/tests/character.test.ts` - update the complete sheet projection.
- `packages/backend/convex/characters.ts` - consume the extracted shared state helpers.
- `packages/backend/convex/schema.ts` - register `combatExchanges` and its four indexes.
- `packages/backend/convex/_generated/api.d.ts` - generated `combat` module reference.
- `packages/backend/convex/_generated/dataModel.d.ts` - regenerated model derived from the expanded schema.
- `apps/web/src/components/ui.tsx` - add a design-system-consistent native select primitive.
- `apps/web/src/components/telemetry-rail.tsx` - make the telemetry body a section inside the new single right-rail landmark.
- `apps/web/src/pages/character-sheet.tsx` - mount the combat panel above telemetry actions and forward concise telemetry lines.
- `README.md` - replace the now-stale statement that A.R./hostile persistence remain entirely future work, while retaining the explicit M.D.C. boundary.
- `.codex/superpowers/specs/2026-07-19-sdc-combat-exchange-design.md` - record implementation and verification outcome after all gates and live checks pass.
- `.codex/superpowers/plans/2026-07-19-sdc-combat-exchange.md` - check completed steps and add final time-scoped evidence during execution.

---

### Task 1: Page-Stamped Exchange Constants and Explicit Combat Capabilities

**Files:**

- Create: `packages/rules/src/schema/combat-exchange.ts`
- Create: `packages/rules/src/content/combat/combat-exchange.json`
- Modify: `packages/rules/src/engine/combat.ts`
- Modify: `packages/rules/src/engine/character.ts`
- Modify: `packages/rules/src/index.ts`
- Modify: `packages/rules/tests/combat.test.ts`
- Modify: `packages/rules/tests/character.test.ts`
- Create: `packages/rules/tests/combat-exchange.test.ts`

**Interfaces:**

```ts
export const attackKindSchema = z.enum(["melee", "ranged"]);
export type AttackKind = z.infer<typeof attackKindSchema>;

export const rangeBandSchema = z.enum(["pointBlank", "close", "normal"]);
export type RangeBand = z.infer<typeof rangeBandSchema>;

export const parryModeSchema = z.enum(["unavailable", "standard", "bareHanded"]);
export type ParryMode = z.infer<typeof parryModeSchema>;

export const combatResponseKindSchema = z.enum(["parry", "dodge", "autoDodge", "none"]);
export type CombatResponseKind = z.infer<typeof combatResponseKindSchema>;

export const combatExchangeErrorCodeSchema = z.enum([
  "selfTarget",
  "attackerNotReady",
  "defenderNotReady",
  "weaponMissingOrChanged",
  "unsupportedWeaponMode",
  "unsupportedMdWeapon",
  "unsupportedMdcProtection",
  "invalidContext",
  "modifierReasonRequired",
  "illegalDefense",
  "exchangeNotPending",
  "combatStateChanged",
  "characterMissing",
]);
export type CombatExchangeErrorCode = z.infer<typeof combatExchangeErrorCodeSchema>;

export const combatExchangeRulesSchema = z.object({
  book: z.string().min(1),
  pages: z.object({
    armorAndVitals: z.literal(287),
    sdcCombat: z.literal(339),
    defense: z.literal(340),
    damage: z.literal(341),
    automaticDodge: z.literal(344),
    modernWeapons: z.literal(360),
    rangedDodging: z.literal(361),
  }),
  minimumStrikeTotal: z.object({ melee: z.literal(5), ranged: z.literal(8) }),
  rangedDodgeModifier: z.object({
    pointBlank: z.literal(-10),
    close: z.literal(-5),
    normal: z.literal(0),
  }),
});
export type CombatExchangeRules = z.infer<typeof combatExchangeRulesSchema>;
```

Extend `CombatProfile` additively with:

```ts
handToHandType: string;
hasHandToHandTraining: boolean;
hasAutoDodge: boolean;
rangedDodge: number;
rangedAutoDodge: number;
```

`rangedDodge` is the P.P. dodge bonus only. `rangedAutoDodge` is that same P.P. bonus when the character has automatic-dodge capability, otherwise zero. Neither includes ordinary H2H dodge nor the H2H `autoDodge` modifier; this preserves the p.361 ranged restriction. Future structured O.C.C. bonuses can be added at this named seam.

- [ ] **Step 1: Add failing constants and combat-profile assertions**

Create `packages/rules/tests/combat-exchange.test.ts` with the constants assertion:

```ts
import { describe, expect, test } from "vite-plus/test";
import { combatExchangeRules } from "../src/index.ts";

describe("combat exchange constants", () => {
  test("loads rendered-page S.D.C. combat values", () => {
    expect(combatExchangeRules).toEqual({
      book: "Rifts Ultimate Edition",
      pages: {
        armorAndVitals: 287,
        sdcCombat: 339,
        defense: 340,
        damage: 341,
        automaticDodge: 344,
        modernWeapons: 360,
        rangedDodging: 361,
      },
      minimumStrikeTotal: { melee: 5, ranged: 8 },
      rangedDodgeModifier: { pointBlank: -10, close: -5, normal: 0 },
    });
  });
});
```

Append to `packages/rules/tests/combat.test.ts`:

```ts
test("makes training and ranged-defense capability explicit", () => {
  const untrained = combatProfile({ attributes: { PP: 20 }, hthType: "none", level: 1 });
  expect(untrained).toMatchObject({
    handToHandType: "none",
    hasHandToHandTraining: false,
    hasAutoDodge: false,
    rangedDodge: 3,
    rangedAutoDodge: 0,
  });

  const commando = combatProfile({ attributes: { PP: 20 }, hthType: "commando", level: 15 });
  expect(commando).toMatchObject({
    handToHandType: "commando",
    hasHandToHandTraining: true,
    hasAutoDodge: true,
    dodge: 7,
    autoDodge: 8,
    rangedDodge: 3,
    rangedAutoDodge: 3,
  });
});
```

Update the exact object assertion in `packages/rules/tests/character.test.ts` to require the five new fields for the level-1 Basic H2H sheet.

- [ ] **Step 2: Run the focused tests and observe the missing exports/fields**

Run:

```text
vp test packages/rules/tests/combat-exchange.test.ts packages/rules/tests/combat.test.ts packages/rules/tests/character.test.ts
```

Expected: FAIL because `combatExchangeRules` and the five profile fields do not exist.

- [ ] **Step 3: Add the schema and page-stamped content**

Create `packages/rules/src/content/combat/combat-exchange.json` exactly as asserted above. Add the enums and `combatExchangeRulesSchema` to `packages/rules/src/schema/combat-exchange.ts`. Parse the JSON at module load in the initial `packages/rules/src/engine/combat-exchange.ts`:

```ts
import combatExchangeRaw from "../content/combat/combat-exchange.json" with { type: "json" };
import { combatExchangeRulesSchema } from "../schema/combat-exchange.ts";

export const combatExchangeRules = combatExchangeRulesSchema.parse(combatExchangeRaw);
```

- [ ] **Step 4: Derive the explicit profile fields**

In `combatProfile`, calculate the capability booleans from the H2H ID/raw bonus and return:

```ts
const hasAutoDodge = hth.autoDodge !== undefined;
const rangedDodge = attr.dodge ?? 0;
```

Add `handToHandType: input.hthType`, `hasHandToHandTraining`, `hasAutoDodge`,
`rangedDodge`, and `rangedAutoDodge: hasAutoDodge ? rangedDodge : 0` to the
existing returned object without removing or redefining any current field.

Do not remove or redefine the existing `dodge` and `autoDodge` totals.

- [ ] **Step 5: Export the new public surface and pass the focused tests**

Add to `packages/rules/src/index.ts`:

```ts
export * from "./schema/combat-exchange.ts";
export * from "./engine/combat-exchange.ts";
```

Run the Step 2 command again. Expected: PASS.

- [ ] **Step 6: Run the rules gate and commit**

Run:

```text
vp run @riftforge/rules#check
vp run @riftforge/rules#test
```

Expected: PASS.

Commit:

```text
git add -- packages/rules/src/schema/combat-exchange.ts packages/rules/src/content/combat/combat-exchange.json packages/rules/src/engine/combat-exchange.ts packages/rules/src/engine/combat.ts packages/rules/src/engine/character.ts packages/rules/src/index.ts packages/rules/tests/combat-exchange.test.ts packages/rules/tests/combat.test.ts packages/rules/tests/character.test.ts
git commit -m "feat(rules): model S.D.C. combat capabilities"
```

---

### Task 2: Reasoned Context Validation and Weapon Attack Profiles

**Files:**

- Modify: `packages/rules/src/schema/combat-exchange.ts`
- Modify: `packages/rules/src/engine/combat-exchange.ts`
- Modify: `packages/rules/tests/combat-exchange.test.ts`

**Interfaces:**

```ts
export type CombatContext =
  | {
      kind: "melee";
      defenderAware: boolean;
      parryMode: ParryMode;
      strikeModifier?: number;
      strikeModifierReason?: string;
    }
  | {
      kind: "ranged";
      defenderAware: boolean;
      rangeBand: RangeBand;
      strikeModifier?: number;
      strikeModifierReason?: string;
    };

export interface ModifierSource {
  source: "attribute" | "handToHand" | "proficiency";
  label: string;
  value: number;
}

export interface WeaponInstanceSnapshot {
  index: number;
  itemId: string;
  worn?: boolean;
  rolledMdc?: number;
}

export type AttackProfile =
  | {
      supported: false;
      reason: "weaponMissingOrChanged" | "unsupportedWeaponMode" | "unsupportedMdWeapon";
      weapon?: WeaponInstanceSnapshot & { name: string };
    }
  | {
      supported: true;
      kind: AttackKind;
      minimumStrikeTotal: number;
      strikeBonus: number;
      strikeBonusSources: ModifierSource[];
      proficiencyBonus: number;
      damageFormula: string;
      damageBonus: number;
      criticalOn: number;
      damageType: "sdc";
      weapon: WeaponInstanceSnapshot & { name: string; category: WeaponCategory };
    };

export function deriveAttackProfile(sheet: CharacterSheet, weaponIndex: number): AttackProfile;
export function validateCombatContext(
  profile: Extract<AttackProfile, { supported: true }>,
  input: unknown,
): CombatContext;
```

`combatContextSchema` is a discriminated Zod union. `strikeModifier` is optional and defaults semantically to zero; when nonzero it must be a safe integer from -100 through +100 and `strikeModifierReason` must contain non-whitespace text. Context kind must equal the server-derived attack kind.

- [ ] **Step 1: Add failing profile and validation tests**

Build sheets with `deriveSheet` and real catalog entries. Cover these exact cases:

```ts
test("classifies real S.D.C. melee and firearm instances", () => {
  const sheet = combatSheet({
    items: [{ itemId: "survival-knife" }, { itemId: "automatic-pistol" }],
  });
  expect(deriveAttackProfile(sheet, 0)).toMatchObject({
    supported: true,
    kind: "melee",
    minimumStrikeTotal: 5,
    strikeBonus: 3,
    damageFormula: "1D6",
    damageBonus: 1,
    criticalOn: 20,
    damageType: "sdc",
  });
  expect(deriveAttackProfile(sheet, 1)).toMatchObject({
    supported: true,
    kind: "ranged",
    minimumStrikeTotal: 8,
    strikeBonus: 0,
    proficiencyBonus: 0,
    damageFormula: "4D6",
    damageBonus: 0,
    criticalOn: 20,
    damageType: "sdc",
  });
});

test("refuses M.D. weapons and non-weapons without inventing modes", () => {
  const sheet = combatSheet({
    items: [{ itemId: "wilks-320-laser-pistol" }, { itemId: "canteen" }],
  });
  expect(deriveAttackProfile(sheet, 0)).toMatchObject({
    supported: false,
    reason: "unsupportedMdWeapon",
  });
  expect(deriveAttackProfile(sheet, 1)).toMatchObject({
    supported: false,
    reason: "unsupportedWeaponMode",
  });
  expect(deriveAttackProfile(sheet, 99)).toEqual({
    supported: false,
    reason: "weaponMissingOrChanged",
  });
});

test("requires reasons for nonzero GM modifiers and rejects kind mismatch", () => {
  const profile = requireSupported(
    deriveAttackProfile(combatSheet({ items: [{ itemId: "survival-knife" }] }), 0),
  );
  expect(() =>
    validateCombatContext(profile, {
      kind: "melee",
      defenderAware: true,
      parryMode: "standard",
      strikeModifier: 1,
    }),
  ).toThrow(/reason/i);
  expect(() =>
    validateCombatContext(profile, {
      kind: "ranged",
      defenderAware: true,
      rangeBand: "normal",
    }),
  ).toThrow(/kind/i);
});
```

The test-local `combatSheet` helper must use a complete valid level-1 Ley Line Walker input with rolled H.P./S.D.C.; it must not cast an arbitrary object to `CharacterSheet`.

- [ ] **Step 2: Run the focused test and observe missing functions**

Run: `vp test packages/rules/tests/combat-exchange.test.ts`

Expected: FAIL because attack-profile and context functions are missing.

- [ ] **Step 3: Implement schemas and the category/tier classifier**

Map `knife` and `axe` to `melee`; map `handgun`, `submachineGun`, `energyPistol`, and `energyRifle` to `ranged`; then refuse any weapon whose damage type is `md`. Do not infer a thrown mode from a knife or axe.

For melee sources, record P.P. strike and ordinary H2H strike separately from `sheet.attributeBonuses` and `sheet.combat.handToHandBonuses`. For ranged sources, include only the specifically named `strikeGuns` H2H value plus a typed proficiency source fixed at zero. Sum the sources to the returned `strikeBonus`.

Add this implementation to `engine/combat-exchange.ts` (with the interface
definitions from this task):

```ts
const meleeCategories = new Set<WeaponCategory>(["knife", "axe"]);

function weaponSnapshot(
  entry: SheetEquipmentEntry,
  index: number,
): WeaponInstanceSnapshot & { name: string } {
  return {
    index,
    itemId: entry.item.id,
    name: entry.item.name,
    ...(entry.worn === true ? { worn: true } : {}),
    ...(entry.rolledMdc === undefined ? {} : { rolledMdc: entry.rolledMdc }),
  };
}

export function deriveAttackProfile(sheet: CharacterSheet, weaponIndex: number): AttackProfile {
  const entry = Number.isInteger(weaponIndex) ? sheet.equipment[weaponIndex] : undefined;
  if (entry === undefined) return { supported: false, reason: "weaponMissingOrChanged" };
  const snapshot = weaponSnapshot(entry, weaponIndex);
  if (entry.item.kind !== "weapon") {
    return { supported: false, reason: "unsupportedWeaponMode", weapon: snapshot };
  }
  if (entry.item.damage.type === "md") {
    return { supported: false, reason: "unsupportedMdWeapon", weapon: snapshot };
  }

  const kind: AttackKind = meleeCategories.has(entry.item.category) ? "melee" : "ranged";
  const strikeBonusSources: ModifierSource[] =
    kind === "melee"
      ? [
          { source: "attribute", label: "P.P.", value: sheet.attributeBonuses.strike ?? 0 },
          {
            source: "handToHand",
            label: "Hand-to-Hand",
            value: sheet.combat.handToHandBonuses.strike ?? 0,
          },
        ]
      : [
          {
            source: "handToHand",
            label: "Gun-specific Hand-to-Hand",
            value: sheet.combat.handToHandBonuses.strikeGuns ?? 0,
          },
          { source: "proficiency", label: "Modern W.P.", value: 0 },
        ];
  return {
    supported: true,
    kind,
    minimumStrikeTotal: combatExchangeRules.minimumStrikeTotal[kind],
    strikeBonus: strikeBonusSources.reduce((sum, source) => sum + source.value, 0),
    strikeBonusSources,
    proficiencyBonus: 0,
    damageFormula: entry.item.damage.formula,
    damageBonus: kind === "melee" ? sheet.combat.damageBonus : 0,
    criticalOn: kind === "melee" ? sheet.combat.criticalStrikeOn : 20,
    damageType: "sdc",
    weapon: { ...snapshot, category: entry.item.category },
  };
}
```

- [ ] **Step 4: Implement context normalization**

Parse with the discriminated schema, compare `context.kind` to `profile.kind`, normalize omitted modifiers to zero at use sites, and keep the submitted reason for history. Reject non-safe integers, values outside -100..100, and blank required reasons.

Add to `schema/combat-exchange.ts`:

```ts
const safeModifierSchema = z.number().int().safe().min(-100).max(100).optional();
const modifierReasonSchema = z.string().trim().min(1).optional();
const rawCombatContextSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("melee"),
    defenderAware: z.boolean(),
    parryMode: parryModeSchema,
    strikeModifier: safeModifierSchema,
    strikeModifierReason: modifierReasonSchema,
  }),
  z.object({
    kind: z.literal("ranged"),
    defenderAware: z.boolean(),
    rangeBand: rangeBandSchema,
    strikeModifier: safeModifierSchema,
    strikeModifierReason: modifierReasonSchema,
  }),
]);

export const combatContextSchema = rawCombatContextSchema.superRefine((context, check) => {
  if ((context.strikeModifier ?? 0) !== 0 && context.strikeModifierReason === undefined) {
    check.addIssue({
      code: "custom",
      path: ["strikeModifierReason"],
      message: "A reason is required for a nonzero strike modifier.",
    });
  }
});
export type CombatContext = z.infer<typeof combatContextSchema>;
```

Add to `engine/combat-exchange.ts`:

```ts
export function validateCombatContext(
  profile: Extract<AttackProfile, { supported: true }>,
  input: unknown,
): CombatContext {
  const context = combatContextSchema.parse(input);
  if (context.kind !== profile.kind) {
    throw new Error(
      `invalidContext: ${context.kind} context cannot resolve ${profile.kind} attack.`,
    );
  }
  return context;
}
```

- [ ] **Step 5: Pass focused/package tests and commit**

Run:

```text
vp test packages/rules/tests/combat-exchange.test.ts
vp run @riftforge/rules#check
vp run @riftforge/rules#test
```

Expected: PASS.

Commit:

```text
git add -- packages/rules/src/schema/combat-exchange.ts packages/rules/src/engine/combat-exchange.ts packages/rules/tests/combat-exchange.test.ts
git commit -m "feat(rules): derive supported S.D.C. attacks"
```

---

### Task 3: Engine-Authorized Defense Options

**Files:**

- Modify: `packages/rules/src/schema/combat-exchange.ts`
- Modify: `packages/rules/src/engine/combat-exchange.ts`
- Modify: `packages/rules/tests/combat-exchange.test.ts`

**Interfaces:**

```ts
export interface DefenseOption {
  kind: CombatResponseKind;
  bonus: number;
  actionCost: 0 | 1;
  explanation: string;
}

export interface CombatResponseInput {
  kind: CombatResponseKind;
  defenseModifier?: number;
  defenseModifierReason?: string;
}

export interface AuthorizedCombatResponse extends DefenseOption {
  defenseModifier: number;
  defenseModifierReason?: string;
  totalBonus: number;
}

export function deriveDefenseOptions(
  defender: CharacterSheet,
  attack: Extract<AttackProfile, { supported: true }>,
  context: CombatContext,
): DefenseOption[];

export function authorizeCombatResponse(
  options: readonly DefenseOption[],
  input: unknown,
): AuthorizedCombatResponse;
```

- [ ] **Step 1: Add the failing defense truth table**

Cover all approved rules in `packages/rules/tests/combat-exchange.test.ts`:

- aware melee + standard parry: `parry`, `dodge`, and `none`;
- Basic H2H parry action cost 0; `hthType: "none"` parry action cost 1;
- bare-handed weapon parry bonus 0;
- unaware melee: no ordinary parry/dodge, but a Commando with explicit capability retains `autoDodge` plus `none`;
- aware ranged: `dodge`, capability-gated `autoDodge`, and `none`, never parry;
- unaware ranged: `none` only;
- point-blank/close/normal penalties are -10/-5/0 and apply to ranged dodge-family options;
- ranged defense uses `rangedDodge`/`rangedAutoDodge`, never ordinary H2H dodge/autoDodge;
- `none` is always last, has bonus 0/action cost 0, and is never an implicit default;
- response modifiers obey the same safe-integer/reason rule;
- submitting an option not present in the derived list throws `illegalDefense`.

- [ ] **Step 2: Run the focused test and observe missing defense functions**

Run: `vp test packages/rules/tests/combat-exchange.test.ts`

Expected: FAIL on missing exports.

- [ ] **Step 3: Implement deterministic option enumeration**

Use this ordering so UI and persisted history remain stable:

```ts
const options: DefenseOption[] = [];
// melee: parry, dodge, autoDodge when authorized
// ranged: dodge, autoDodge when authorized
options.push({ kind: "none", bonus: 0, actionCost: 0, explanation: "Take the hit." });
return options;
```

Implement the complete branch between initialization and the final push as:

```ts
if (attack.kind === "melee") {
  if (context.kind !== "melee")
    throw new Error("invalidContext: melee attack requires melee context.");
  if (context.defenderAware && context.parryMode !== "unavailable") {
    options.push({
      kind: "parry",
      bonus: context.parryMode === "bareHanded" ? 0 : defender.combat.parry,
      actionCost: defender.combat.hasHandToHandTraining ? 0 : 1,
      explanation:
        context.parryMode === "bareHanded"
          ? "Bare-handed weapon parry; no ordinary parry bonus."
          : "Parry the melee weapon.",
    });
  }
  if (context.defenderAware) {
    options.push({
      kind: "dodge",
      bonus: defender.combat.dodge,
      actionCost: 1,
      explanation: "Dodge; costs one action for table tracking.",
    });
  }
  if (defender.combat.hasAutoDodge) {
    options.push({
      kind: "autoDodge",
      bonus: defender.combat.autoDodge,
      actionCost: 0,
      explanation: "Automatic dodge; no action cost.",
    });
  }
} else {
  if (context.kind !== "ranged")
    throw new Error("invalidContext: ranged attack requires ranged context.");
  if (context.defenderAware) {
    const rangeModifier = combatExchangeRules.rangedDodgeModifier[context.rangeBand];
    options.push({
      kind: "dodge",
      bonus: defender.combat.rangedDodge + rangeModifier,
      actionCost: 1,
      explanation: `Ranged dodge (${rangeModifier} range-band modifier).`,
    });
    if (defender.combat.hasAutoDodge) {
      options.push({
        kind: "autoDodge",
        bonus: defender.combat.rangedAutoDodge + rangeModifier,
        actionCost: 0,
        explanation: `Automatic ranged dodge (${rangeModifier} range-band modifier).`,
      });
    }
  }
}
```

Melee automatic dodge does not require `defenderAware`; ranged dodge-family options do. Standard parry uses `sheet.combat.parry`; bare-handed parry uses zero. Ordinary dodge costs one action, automatic dodge costs zero, and a trained standard parry costs zero while an untrained standard parry records one.

- [ ] **Step 4: Authorize the submitted response against the derived list**

Parse the response schema, find the exact `kind` in the server-derived options, then return its server-owned bonus/action metadata plus the normalized situational modifier. Never accept a bonus or action cost from the caller.

Add the schema and implementation:

```ts
const rawCombatResponseInputSchema = z.object({
  kind: combatResponseKindSchema,
  defenseModifier: safeModifierSchema,
  defenseModifierReason: modifierReasonSchema,
});
export const combatResponseInputSchema = rawCombatResponseInputSchema.superRefine(
  (response, check) => {
    if ((response.defenseModifier ?? 0) !== 0 && response.defenseModifierReason === undefined) {
      check.addIssue({
        code: "custom",
        path: ["defenseModifierReason"],
        message: "A reason is required for a nonzero defense modifier.",
      });
    }
  },
);
export type CombatResponseInput = z.infer<typeof combatResponseInputSchema>;
```

```ts
export function authorizeCombatResponse(
  options: readonly DefenseOption[],
  input: unknown,
): AuthorizedCombatResponse {
  const response = combatResponseInputSchema.parse(input);
  const option = options.find((candidate) => candidate.kind === response.kind);
  if (option === undefined) throw new Error(`illegalDefense: ${response.kind} is not authorized.`);
  const defenseModifier = response.defenseModifier ?? 0;
  return {
    ...option,
    defenseModifier,
    ...(response.defenseModifierReason === undefined
      ? {}
      : { defenseModifierReason: response.defenseModifierReason }),
    totalBonus: option.bonus + defenseModifier,
  };
}
```

- [ ] **Step 5: Pass focused/package tests and commit**

Run:

```text
vp test packages/rules/tests/combat-exchange.test.ts
vp run @riftforge/rules#check
vp run @riftforge/rules#test
```

Commit:

```text
git add -- packages/rules/src/schema/combat-exchange.ts packages/rules/src/engine/combat-exchange.ts packages/rules/tests/combat-exchange.test.ts
git commit -m "feat(rules): derive combat defense choices"
```

---

### Task 4: Pure Strike Completion, S.D.C. Routing, and Damage Results

**Files:**

- Modify: `packages/rules/src/engine/combat-exchange.ts`
- Modify: `packages/rules/tests/combat-exchange.test.ts`

**Interfaces:**

```ts
export type ProtectionState =
  | { kind: "none" }
  | { kind: "sdcArmor"; itemId: string; name: string; ar: number; max: number; current: number }
  | { kind: "mdcArmor"; itemId: string; name: string; max?: number; current?: number };

export type DeclarationResult =
  | { status: "miss"; reason: "naturalOne" | "belowMinimum" }
  | { status: "pendingDefense" };

export type SdcDamageRoute =
  | {
      kind: "armor";
      armor: { before: number; after: number };
      body: { before: VitalsPool; after: VitalsPool };
    }
  | {
      kind: "body";
      armor?: { before: number; after: number };
      body: { before: VitalsPool; after: VitalsPool };
    }
  | { kind: "unsupportedMdcProtection" };

export type CombatExchangeResolution =
  | { outcome: "miss"; reason: "naturalOne" | "belowMinimum"; critical: false; damageMultiplier: 1 }
  | {
      outcome: "defended";
      reason: "parried" | "dodged";
      response: AuthorizedCombatResponse;
      defenseRoll: D20Roll;
      critical: false;
      damageMultiplier: 1;
    }
  | {
      outcome: "hit";
      reason: "unopposed" | "strikeWon";
      response: AuthorizedCombatResponse;
      defenseRoll?: D20Roll;
      critical: boolean;
      damageMultiplier: 1 | 2;
      damageRoll: DamageRoll;
      totalDamage: number;
      route: Exclude<SdcDamageRoute, { kind: "unsupportedMdcProtection" }>;
    };

export function deriveProtection(sheet: CharacterSheet): ProtectionState;
export function evaluateDeclaration(strike: D20Roll, minimumStrikeTotal: number): DeclarationResult;
export function routeSdcHit(input: {
  strikeTotal: number;
  damage: number;
  protection: ProtectionState;
  body: VitalsPool;
  comaDeathFloor: number;
}): SdcDamageRoute;
export interface ResolveCombatExchangeInput {
  attack: Extract<AttackProfile, { supported: true }>;
  context: CombatContext;
  strikeRoll: D20Roll;
  response: AuthorizedCombatResponse;
  defenseRoll?: D20Roll;
  damageRoll?: DamageRoll;
  protection: ProtectionState;
  body: VitalsPool;
  comaDeathFloor: number;
}
export function resolveCombatExchange(input: ResolveCombatExchangeInput): CombatExchangeResolution;
```

- [ ] **Step 1: Add failing declaration and protection tests**

Assert melee total 4 misses/5 proceeds, ranged total 7 misses/8 proceeds, natural 1 misses, and invalid completed rolls are rejected through the existing resolver validation path.

Derive `none` for an unarmored sheet and `mdcArmor` for a worn production suit.
The M.D.C. variant keeps `max`/`current` optional so a legacy dice-capacity suit
whose per-instance capacity has not been rolled is still safely classified and
refused. Directly test a validated S.D.C. armor fixture:

```ts
const fixture = armorSchema.parse({
  kind: "armor",
  id: "test-sdc-armor",
  name: "Validated S.D.C. Armor Fixture",
  ar: 12,
  sdc: 30,
  page: 287,
});
const armor: ProtectionState = {
  kind: "sdcArmor",
  itemId: fixture.id,
  name: fixture.name,
  ar: fixture.ar!,
  max: fixture.sdc!,
  current: 5,
};

expect(
  routeSdcHit({
    strikeTotal: 12,
    damage: 9,
    protection: armor,
    body: { sdc: 10, hitPoints: 20 },
    comaDeathFloor: -10,
  }),
).toEqual({
  kind: "armor",
  armor: { before: 5, after: 0 },
  body: { before: { sdc: 10, hitPoints: 20 }, after: { sdc: 10, hitPoints: 20 } },
});
```

Also assert strike 13 routes the full hit to the body without changing armor, depleted armor routes future hits to the body, armor destruction never spills, body S.D.C. depletes before H.P., and `mdcArmor` returns `unsupportedMdcProtection` without conversion.

- [ ] **Step 2: Run the focused test and observe missing routing exports**

Run: `vp test packages/rules/tests/combat-exchange.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement protection classification and routing**

For worn S.D.C. armor, require its schema-guaranteed `ar` and `sdc`; use its derived current pool. Treat current zero as `none`. For worn M.D.C. armor, return `mdcArmor` while current is positive and `none` when depleted.

Use `damageArmor` for the armor pool and existing `applyDamage` for the body. Never carry armor overflow into the body.

```ts
export function deriveProtection(sheet: CharacterSheet): ProtectionState {
  const armor = sheet.armor;
  if (armor === undefined) return { kind: "none" };
  if (armor.item.mdc !== undefined) {
    if (armor.current === 0) return { kind: "none" };
    return {
      kind: "mdcArmor",
      itemId: armor.item.id,
      name: armor.item.name,
      ...(armor.max === undefined ? {} : { max: armor.max }),
      ...(armor.current === undefined ? {} : { current: armor.current }),
    };
  }
  const max = armor.item.sdc!;
  const current = armor.current ?? max;
  return current === 0
    ? { kind: "none" }
    : {
        kind: "sdcArmor",
        itemId: armor.item.id,
        name: armor.item.name,
        ar: armor.item.ar!,
        max,
        current,
      };
}

export function evaluateDeclaration(
  strike: D20Roll,
  minimumStrikeTotal: number,
): DeclarationResult {
  const base = resolveStrike({ strike, allowedDefenses: [], damageType: "sdc" });
  if (base.outcome === "miss") {
    return { status: "miss", reason: base.reason as "naturalOne" | "belowMinimum" };
  }
  return strike.total < minimumStrikeTotal
    ? { status: "miss", reason: "belowMinimum" }
    : { status: "pendingDefense" };
}

export function routeSdcHit(input: {
  strikeTotal: number;
  damage: number;
  protection: ProtectionState;
  body: VitalsPool;
  comaDeathFloor: number;
}): SdcDamageRoute {
  if (input.protection.kind === "mdcArmor") return { kind: "unsupportedMdcProtection" };
  const before = { ...input.body };
  if (
    input.protection.kind === "sdcArmor" &&
    input.protection.current > 0 &&
    input.strikeTotal <= input.protection.ar
  ) {
    return {
      kind: "armor",
      armor: {
        before: input.protection.current,
        after: damageArmor(input.protection.current, input.damage),
      },
      body: { before, after: { ...before } },
    };
  }
  const after = applyDamage(input.body, input.damage, input.comaDeathFloor);
  return {
    kind: "body",
    ...(input.protection.kind === "sdcArmor"
      ? { armor: { before: input.protection.current, after: input.protection.current } }
      : {}),
    body: { before, after },
  };
}
```

- [ ] **Step 4: Add failing end-to-end pure resolution tests**

Use completed `D20Roll` and `DamageRoll` objects to cover:

- declaration miss creates no defense/damage branch;
- parry/dodge tie favors the defender;
- natural-20 defense beats natural-20 strike through `resolveStrike`;
- `none` resolves an unopposed hit;
- melee damage is `(formula total + melee damage bonus) * critical multiplier`;
- firearm damage has no P.S./H2H flat bonus;
- missing defense roll for a defense choice and extra defense roll for `none` are rejected;
- missing damage roll on a hit and supplied damage on a miss/defense are rejected;
- the supplied damage roll bonus must equal `attack.damageBonus`, its die count
  and faces must match `attack.damageFormula`, and its total must be internally
  consistent;
- M.D.C. protection is rejected before any S.D.C. route result.

- [ ] **Step 5: Implement `resolveCombatExchange` over `resolveStrike`**

Call `evaluateDeclaration` first. For a selected defense, require the completed defense roll and pass only its server-authorized kind to `resolveStrike`. For `none`, omit defense. Require the completed damage roll only after a hit. Multiply `damageRoll.total` after its flat bonus, then call `routeSdcHit`.

Add this private validator, then implement the resolver:

```ts
function assertDamageRoll(
  attack: Extract<AttackProfile, { supported: true }>,
  roll: DamageRoll,
): void {
  const formula = parseDice(attack.damageFormula);
  if (roll.bonus !== attack.damageBonus) {
    throw new Error(`Damage bonus must be ${attack.damageBonus}.`);
  }
  if (roll.dice.length !== formula.count) {
    throw new Error(`Damage roll requires ${formula.count} dice.`);
  }
  if (roll.dice.some((die) => !Number.isInteger(die) || die < 1 || die > formula.sides)) {
    throw new Error(`Damage dice must be integers from 1 to ${formula.sides}.`);
  }
  const expected =
    roll.dice.reduce((sum, die) => sum + die, 0) * formula.multiplier +
    formula.modifier +
    roll.bonus;
  if (roll.total !== expected) throw new Error(`Damage total must be ${expected}.`);
}
```

```ts
export function resolveCombatExchange(input: ResolveCombatExchangeInput): CombatExchangeResolution {
  validateCombatContext(input.attack, input.context);
  if (input.protection.kind === "mdcArmor") {
    throw new Error("unsupportedMdcProtection: full M.D.C. resolution is out of scope.");
  }
  const expectedStrikeBonus = input.attack.strikeBonus + (input.context.strikeModifier ?? 0);
  if (input.strikeRoll.bonus !== expectedStrikeBonus) {
    throw new Error(`Strike bonus must be ${expectedStrikeBonus}.`);
  }
  const declaration = evaluateDeclaration(input.strikeRoll, input.attack.minimumStrikeTotal);
  if (declaration.status === "miss") {
    if (input.defenseRoll !== undefined || input.damageRoll !== undefined) {
      throw new Error("A missed declaration cannot contain defense or damage rolls.");
    }
    return {
      outcome: "miss",
      reason: declaration.reason,
      critical: false,
      damageMultiplier: 1,
    };
  }

  const takesHit = input.response.kind === "none";
  if (takesHit && input.defenseRoll !== undefined) {
    throw new Error("Take-the-hit cannot contain a defense roll.");
  }
  if (!takesHit && input.defenseRoll === undefined) {
    throw new Error(`${input.response.kind} requires a completed defense roll.`);
  }
  if (input.defenseRoll !== undefined && input.defenseRoll.bonus !== input.response.totalBonus) {
    throw new Error(`Defense bonus must be ${input.response.totalBonus}.`);
  }

  const strike = resolveStrike({
    strike: input.strikeRoll,
    ...(takesHit
      ? {}
      : {
          defense: {
            kind: input.response.kind as DefenseKind,
            roll: input.defenseRoll!,
          },
        }),
    allowedDefenses: takesHit ? [] : [input.response.kind as DefenseKind],
    damageType: "sdc",
    criticalOn: input.attack.criticalOn,
  });
  if (strike.outcome !== "hit") {
    if (input.damageRoll !== undefined) throw new Error("A defended attack cannot contain damage.");
    return {
      outcome: "defended",
      reason: strike.reason as "parried" | "dodged",
      response: input.response,
      defenseRoll: input.defenseRoll!,
      critical: false,
      damageMultiplier: 1,
    };
  }
  if (input.damageRoll === undefined) throw new Error("A hit requires a completed damage roll.");
  assertDamageRoll(input.attack, input.damageRoll);
  const totalDamage = input.damageRoll.total * strike.damageMultiplier;
  const route = routeSdcHit({
    strikeTotal: input.strikeRoll.total,
    damage: totalDamage,
    protection: input.protection,
    body: input.body,
    comaDeathFloor: input.comaDeathFloor,
  });
  if (route.kind === "unsupportedMdcProtection") {
    throw new Error("unsupportedMdcProtection: full M.D.C. resolution is out of scope.");
  }
  return {
    outcome: "hit",
    reason: strike.reason as "unopposed" | "strikeWon",
    response: input.response,
    ...(input.defenseRoll === undefined ? {} : { defenseRoll: input.defenseRoll }),
    critical: strike.critical,
    damageMultiplier: strike.damageMultiplier,
    damageRoll: input.damageRoll,
    totalDamage,
    route,
  };
}
```

- [ ] **Step 6: Pass focused/package tests and commit**

Run:

```text
vp test packages/rules/tests/combat-exchange.test.ts packages/rules/tests/strike-resolution.test.ts packages/rules/tests/items.test.ts packages/rules/tests/combat.test.ts
vp run @riftforge/rules#check
vp run @riftforge/rules#test
```

Commit:

```text
git add -- packages/rules/src/engine/combat-exchange.ts packages/rules/tests/combat-exchange.test.ts
git commit -m "feat(rules): resolve and route S.D.C. exchanges"
```

---

### Task 5: Deterministic Combat-State Tokens

**Files:**

- Modify: `packages/rules/src/engine/combat-exchange.ts`
- Modify: `packages/rules/tests/combat-exchange.test.ts`

**Interfaces:**

```ts
export function attackerCombatStateToken(sheet: CharacterSheet, weaponIndex: number): string;
export function defenderCombatStateToken(sheet: CharacterSheet): string;
```

Tokens are stable JSON serialization of explicit ordered arrays, not arbitrary object serialization and not a security hash.

- [ ] **Step 1: Add failing token-scope tests**

Create two independently derived equivalent sheets and assert identical attacker/defender tokens. Then assert:

- narrative edits, P.P.E. changes, and unrelated inventory additions do not change either relevant token;
- attacker level, attributes, H2H type/derived profile, selected weapon index, selected item ID, or selected instance state changes the attacker token;
- defender level, attributes, H2H type/defense profile, rolled/current S.D.C., rolled/current H.P., worn armor identity, maximum/current pool, tier, or A.R. changes the defender token;
- an unrelated attacker inventory entry does not stale the selected attack;
- token strings do not contain narrative/backstory text.

- [ ] **Step 2: Run the focused test and observe missing token exports**

Run: `vp test packages/rules/tests/combat-exchange.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement explicit ordered serialization**

Use fixed attribute order `IQ, ME, MA, PS, PP, PE, PB, Spd`. The attacker tuple must contain level, attributes, the combat fields consumed by `deriveAttackProfile`, selected index, and selected instance snapshot. The defender tuple must contain level, attributes, the fields consumed by `deriveDefenseOptions`, rolled/current body pools, coma floor, and the complete derived worn-protection tuple.

Do not serialize the whole sheet; doing so would make narrative and unrelated catalog growth stale live attacks.

```ts
const attributeOrder = ["IQ", "ME", "MA", "PS", "PP", "PE", "PB", "Spd"] as const;
const orderedAttributes = (sheet: CharacterSheet) =>
  attributeOrder.map((code) => sheet.attributes[code]);

export function attackerCombatStateToken(sheet: CharacterSheet, weaponIndex: number): string {
  const entry = sheet.equipment[weaponIndex];
  return JSON.stringify([
    "attacker-v1",
    sheet.level,
    orderedAttributes(sheet),
    [
      sheet.combat.handToHandType,
      sheet.combat.strike,
      sheet.combat.damageBonus,
      sheet.combat.strikeGuns,
      sheet.combat.criticalStrikeOn,
    ],
    weaponIndex,
    entry === undefined ? null : [entry.item.id, entry.worn === true, entry.rolledMdc ?? null],
  ]);
}

export function defenderCombatStateToken(sheet: CharacterSheet): string {
  return JSON.stringify([
    "defender-v1",
    sheet.level,
    orderedAttributes(sheet),
    [
      sheet.combat.handToHandType,
      sheet.combat.hasHandToHandTraining,
      sheet.combat.hasAutoDodge,
      sheet.combat.parry,
      sheet.combat.dodge,
      sheet.combat.autoDodge,
      sheet.combat.rangedDodge,
      sheet.combat.rangedAutoDodge,
    ],
    [
      sheet.vitals.sdc.rolled ?? null,
      sheet.vitals.sdc.current ?? null,
      sheet.vitals.hitPoints.rolled ?? null,
      sheet.vitals.hitPoints.current ?? null,
      sheet.vitals.comaDeathFloor,
    ],
    sheet.armor === undefined
      ? null
      : [
          sheet.armor.item.id,
          sheet.armor.item.mdc === undefined ? "sdc" : "mdc",
          sheet.armor.item.ar ?? null,
          sheet.armor.max ?? null,
          sheet.armor.current ?? null,
        ],
  ]);
}
```

- [ ] **Step 4: Pass focused/package tests and commit**

Run:

```text
vp test packages/rules/tests/combat-exchange.test.ts
vp run @riftforge/rules#check
vp run @riftforge/rules#test
```

Commit:

```text
git add -- packages/rules/src/engine/combat-exchange.ts packages/rules/tests/combat-exchange.test.ts
git commit -m "feat(rules): add combat state tokens"
```

---

### Task 6: Extract Shared Backend Character-State Helpers

**Files:**

- Create: `packages/backend/convex/character-state.ts`
- Modify: `packages/backend/convex/characters.ts`
- Modify: `packages/backend/tests/characters.test.ts`

**Interfaces:**

Move, without semantic changes:

```ts
export function validateCharacter(input: unknown): Character;
export async function loadCharacter(ctx: MutationCtx, id: Id<"characters">): Promise<Character>;
export async function patchCurrent(
  ctx: MutationCtx,
  id: Id<"characters">,
  character: Character,
  current: Character["current"],
): Promise<void>;
export const expectedItemValidator = v.object({
  itemId: v.string(),
  worn: v.optional(v.boolean()),
  rolledMdc: v.optional(v.number()),
});
export interface ExpectedItem {
  itemId: string;
  worn?: boolean;
  rolledMdc?: number;
}
export function requireItemAt(
  character: Character,
  index: number,
  expect: ExpectedItem,
): NonNullable<Character["items"]>[number];
```

- [ ] **Step 1: Strengthen the stale-index regression before moving code**

In `packages/backend/tests/characters.test.ts`, add an assertion that `requireItemAt` behavior exposed through `removeItem`/`equipArmor` rejects when the same index now contains a different `itemId`, even if the index remains valid.

- [ ] **Step 2: Run the focused backend test before refactoring**

Run: `vp test packages/backend/tests/characters.test.ts`

Expected: PASS, proving the behavior being preserved.

- [ ] **Step 3: Move helpers and update imports**

Create `character-state.ts`, move the five helpers/types, and import them into `characters.ts`. Keep validation through `characterSchema`/`deriveSheet` and all current error messages unchanged. Do not export public Convex functions from the helper file.

The new helper file is:

```ts
import { characterSchema, deriveSheet, type Character } from "@riftforge/rules";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export function validateCharacter(input: unknown): Character {
  const character = characterSchema.parse(input);
  deriveSheet(character);
  return character;
}

export async function loadCharacter(ctx: MutationCtx, id: Id<"characters">): Promise<Character> {
  const doc = await ctx.db.get(id);
  if (doc === null) throw new Error(`Character ${id} not found.`);
  const { _id, _creationTime, ...stored } = doc;
  return characterSchema.parse(stored);
}

export async function patchCurrent(
  ctx: MutationCtx,
  id: Id<"characters">,
  character: Character,
  current: Character["current"],
): Promise<void> {
  validateCharacter({ ...character, current });
  await ctx.db.patch(id, { current });
}

export const expectedItemValidator = v.object({
  itemId: v.string(),
  worn: v.optional(v.boolean()),
  rolledMdc: v.optional(v.number()),
});
export type ExpectedItem = { itemId: string; worn?: boolean; rolledMdc?: number };

export function requireItemAt(
  character: Character,
  index: number,
  expect: ExpectedItem,
): Character["items"][number] {
  const entry = Number.isInteger(index) ? character.items[index] : undefined;
  if (entry === undefined) throw new Error(`No item at index ${index}.`);
  if (
    entry.itemId !== expect.itemId ||
    (entry.worn === true) !== (expect.worn === true) ||
    entry.rolledMdc !== expect.rolledMdc
  ) {
    throw new Error("The manifest changed while the request was in flight — try again.");
  }
  return entry;
}
```

Delete these definitions from `characters.ts` and import exactly:

```ts
import {
  expectedItemValidator,
  loadCharacter,
  patchCurrent,
  requireItemAt,
  validateCharacter,
} from "./character-state";
```

- [ ] **Step 4: Run backend regression gates**

Run:

```text
vp test packages/backend/tests/characters.test.ts packages/backend/tests/healing-cast.test.ts
vp run @riftforge/backend#check
vp run @riftforge/backend#test
```

Expected: PASS with no behavior change.

- [ ] **Step 5: Commit the extraction**

```text
git add -- packages/backend/convex/character-state.ts packages/backend/convex/characters.ts packages/backend/tests/characters.test.ts
git commit -m "refactor(backend): share character state helpers"
```

---

### Task 7: Discriminated Exchange Ledger and Bounded Read Queries

**Files:**

- Create: `packages/backend/convex/combat-values.ts`
- Create: `packages/backend/convex/combat.ts`
- Modify: `packages/backend/convex/schema.ts`
- Modify: `packages/backend/convex/_generated/api.d.ts`
- Modify: `packages/backend/convex/_generated/dataModel.d.ts`
- Create: `packages/backend/tests/combat.test.ts`

**Ledger contract:**

Every variant repeats these shared top-level fields so `status` remains indexable and the document remains a true discriminated union:

```ts
const exchangeBase = {
  attackerId: v.id("characters"),
  defenderId: v.id("characters"),
  attackerName: v.string(),
  defenderName: v.string(),
  weapon: weaponSnapshotValidator,
  attack: attackSnapshotValidator,
  context: combatContextValidator,
  attackerStateToken: v.string(),
  defenderStateToken: v.string(),
  strikeRoll: d20RollValidator,
};

export const combatExchangeValidator = v.union(
  v.object({
    ...exchangeBase,
    status: v.literal("pendingDefense"),
    defenseOptions: v.array(defenseOptionValidator),
  }),
  v.object({
    ...exchangeBase,
    status: v.literal("resolved"),
    resolution: resolvedResultValidator,
  }),
  v.object({
    ...exchangeBase,
    status: v.literal("cancelled"),
    cancelledAt: v.number(),
  }),
  v.object({
    ...exchangeBase,
    status: v.literal("stale"),
    staleAt: v.number(),
    reason: v.literal("combatStateChanged"),
  }),
);
```

`resolvedResultValidator` must itself be a union of `miss`, `defended`, and `hit` objects. Only the hit variant may contain damage/route data; only the defended variant requires a defense roll; the miss variant contains neither. The hit route is a union of armor and body snapshots, matching the pure rules result.

Register:

```ts
combatExchanges: defineTable(combatExchangeValidator)
  .index("by_defender_and_status", ["defenderId", "status"])
  .index("by_attacker_and_status", ["attackerId", "status"])
  .index("by_defender", ["defenderId"])
  .index("by_attacker", ["attackerId"]),
```

**Public queries:**

```ts
export const targets = query({ args: { attackerId: v.id("characters") }, handler });
export const incoming = query({ args: { defenderId: v.id("characters") }, handler });
export const outgoing = query({ args: { attackerId: v.id("characters") }, handler });
export const recent = query({ args: { characterId: v.id("characters") }, handler });
```

- [ ] **Step 1: Add failing target/query tests**

Create `packages/backend/tests/combat.test.ts` using the established `convexTest(schema, modules)` pattern. Assert:

- `targets` excludes the attacker and returns at most 50 entries;
- each target contains ID/name, `ready`, protection kind, and a stable disabled reason;
- unrolled vitals report `defenderNotReady`;
- nondepleted worn production armor reports `mdcArmor`/`unsupportedMdcProtection`;
- depleted worn M.D.C. armor reports `none` and is not disabled for protection;
- incoming/outgoing/recent are empty initially and bounded at 20.

- [ ] **Step 2: Run the focused test and observe the missing API/schema failure**

Run: `vp test packages/backend/tests/combat.test.ts`

Expected: FAIL because `api.combat` and `combatExchanges` do not exist.

- [ ] **Step 3: Add the validators, table, and read-only query module**

Mirror rule-layer unions with Convex validators; do not use `v.any()`. In `targets`, take 50 characters, exclude self, derive each sheet, and map only the selector-safe summary. In the ledger queries, use the matching index plus `.take(20)`. For `recent`, take 20 from `by_attacker` and 20 from `by_defender`, merge/deduplicate by `_id`, sort by `_creationTime` descending, and slice to 20.

Define these primitives in `combat-values.ts`; compose every ledger variant from
them rather than weakening the schema:

```ts
import { v } from "convex/values";

export const d20RollValidator = v.object({
  die: v.number(),
  bonus: v.number(),
  total: v.number(),
  target: v.optional(v.number()),
  success: v.optional(v.boolean()),
  naturalTwenty: v.boolean(),
  naturalOne: v.boolean(),
});
export const damageRollValidator = v.object({
  dice: v.array(v.number()),
  total: v.number(),
  bonus: v.number(),
});
export const combatContextValidator = v.union(
  v.object({
    kind: v.literal("melee"),
    defenderAware: v.boolean(),
    parryMode: v.union(v.literal("unavailable"), v.literal("standard"), v.literal("bareHanded")),
    strikeModifier: v.optional(v.number()),
    strikeModifierReason: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("ranged"),
    defenderAware: v.boolean(),
    rangeBand: v.union(v.literal("pointBlank"), v.literal("close"), v.literal("normal")),
    strikeModifier: v.optional(v.number()),
    strikeModifierReason: v.optional(v.string()),
  }),
);
export const combatResponseInputValidator = v.object({
  kind: v.union(v.literal("parry"), v.literal("dodge"), v.literal("autoDodge"), v.literal("none")),
  defenseModifier: v.optional(v.number()),
  defenseModifierReason: v.optional(v.string()),
});
export const defenseOptionValidator = v.object({
  kind: v.union(v.literal("parry"), v.literal("dodge"), v.literal("autoDodge"), v.literal("none")),
  bonus: v.number(),
  actionCost: v.union(v.literal(0), v.literal(1)),
  explanation: v.string(),
});
const authorizedResponseValidator = v.object({
  kind: v.union(v.literal("parry"), v.literal("dodge"), v.literal("autoDodge"), v.literal("none")),
  bonus: v.number(),
  actionCost: v.union(v.literal(0), v.literal(1)),
  explanation: v.string(),
  defenseModifier: v.number(),
  defenseModifierReason: v.optional(v.string()),
  totalBonus: v.number(),
});
const weaponCategoryValidator = v.union(
  v.literal("knife"),
  v.literal("axe"),
  v.literal("handgun"),
  v.literal("submachineGun"),
  v.literal("energyPistol"),
  v.literal("energyRifle"),
);
const modifierSourceValidator = v.object({
  source: v.union(v.literal("attribute"), v.literal("handToHand"), v.literal("proficiency")),
  label: v.string(),
  value: v.number(),
});
const exchangeBase = {
  attackerId: v.id("characters"),
  defenderId: v.id("characters"),
  attackerName: v.string(),
  defenderName: v.string(),
  weapon: v.object({
    index: v.number(),
    itemId: v.string(),
    name: v.string(),
    category: weaponCategoryValidator,
    worn: v.optional(v.boolean()),
    rolledMdc: v.optional(v.number()),
  }),
  attack: v.object({
    kind: v.union(v.literal("melee"), v.literal("ranged")),
    minimumStrikeTotal: v.number(),
    strikeBonus: v.number(),
    strikeBonusSources: v.array(modifierSourceValidator),
    proficiencyBonus: v.number(),
    damageFormula: v.string(),
    damageBonus: v.number(),
    criticalOn: v.number(),
    damageType: v.literal("sdc"),
  }),
  context: combatContextValidator,
  attackerStateToken: v.string(),
  defenderStateToken: v.string(),
  strikeRoll: d20RollValidator,
};
const routeValidator = v.union(
  v.object({
    kind: v.literal("armor"),
    armor: v.object({ before: v.number(), after: v.number() }),
    body: v.object({
      before: v.object({ sdc: v.number(), hitPoints: v.number() }),
      after: v.object({ sdc: v.number(), hitPoints: v.number() }),
    }),
  }),
  v.object({
    kind: v.literal("body"),
    armor: v.optional(v.object({ before: v.number(), after: v.number() })),
    body: v.object({
      before: v.object({ sdc: v.number(), hitPoints: v.number() }),
      after: v.object({ sdc: v.number(), hitPoints: v.number() }),
    }),
  }),
);
export const resolvedResultValidator = v.union(
  v.object({
    outcome: v.literal("miss"),
    reason: v.union(v.literal("naturalOne"), v.literal("belowMinimum")),
    critical: v.literal(false),
    damageMultiplier: v.literal(1),
  }),
  v.object({
    outcome: v.literal("defended"),
    reason: v.union(v.literal("parried"), v.literal("dodged")),
    response: authorizedResponseValidator,
    defenseRoll: d20RollValidator,
    critical: v.literal(false),
    damageMultiplier: v.literal(1),
  }),
  v.object({
    outcome: v.literal("hit"),
    reason: v.union(v.literal("unopposed"), v.literal("strikeWon")),
    response: authorizedResponseValidator,
    defenseRoll: v.optional(d20RollValidator),
    critical: v.boolean(),
    damageMultiplier: v.union(v.literal(1), v.literal(2)),
    damageRoll: damageRollValidator,
    totalDamage: v.number(),
    route: routeValidator,
  }),
);
export const combatExchangeValidator = v.union(
  v.object({
    ...exchangeBase,
    status: v.literal("pendingDefense"),
    defenseOptions: v.array(defenseOptionValidator),
  }),
  v.object({
    ...exchangeBase,
    status: v.literal("resolved"),
    resolution: resolvedResultValidator,
  }),
  v.object({
    ...exchangeBase,
    status: v.literal("cancelled"),
    cancelledAt: v.number(),
  }),
  v.object({
    ...exchangeBase,
    status: v.literal("stale"),
    staleAt: v.number(),
    reason: v.literal("combatStateChanged"),
  }),
);
```

Register the table in `schema.ts` with the exact four indexes shown in the
ledger contract. Add these read handlers to `combat.ts`:

```ts
const TARGET_LIMIT = 50;
const FEED_LIMIT = 20;

export const targets = query({
  args: { attackerId: v.id("characters") },
  handler: async (ctx, { attackerId }) => {
    const docs = await ctx.db.query("characters").order("desc").take(TARGET_LIMIT);
    return docs
      .filter((doc) => doc._id !== attackerId)
      .map((doc) => {
        const sheet = deriveSheet(doc);
        const ready =
          sheet.vitals.sdc.rolled !== undefined && sheet.vitals.hitPoints.rolled !== undefined;
        const protection = deriveProtection(sheet);
        return {
          id: doc._id,
          name: sheet.name,
          ready,
          protection: protection.kind,
          ...(ready
            ? protection.kind === "mdcArmor"
              ? { disabledReason: "unsupportedMdcProtection" as const }
              : {}
            : { disabledReason: "defenderNotReady" as const }),
        };
      });
  },
});

export const incoming = query({
  args: { defenderId: v.id("characters") },
  handler: (ctx, { defenderId }) =>
    ctx.db
      .query("combatExchanges")
      .withIndex("by_defender_and_status", (q) =>
        q.eq("defenderId", defenderId).eq("status", "pendingDefense"),
      )
      .order("desc")
      .take(FEED_LIMIT),
});

export const outgoing = query({
  args: { attackerId: v.id("characters") },
  handler: (ctx, { attackerId }) =>
    ctx.db
      .query("combatExchanges")
      .withIndex("by_attacker_and_status", (q) =>
        q.eq("attackerId", attackerId).eq("status", "pendingDefense"),
      )
      .order("desc")
      .take(FEED_LIMIT),
});

export const recent = query({
  args: { characterId: v.id("characters") },
  handler: async (ctx, { characterId }) => {
    const [attacks, defenses] = await Promise.all([
      ctx.db
        .query("combatExchanges")
        .withIndex("by_attacker", (q) => q.eq("attackerId", characterId))
        .order("desc")
        .take(FEED_LIMIT),
      ctx.db
        .query("combatExchanges")
        .withIndex("by_defender", (q) => q.eq("defenderId", characterId))
        .order("desc")
        .take(FEED_LIMIT),
    ]);
    return [...new Map([...attacks, ...defenses].map((doc) => [doc._id, doc])).values()]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, FEED_LIMIT);
  },
});
```

- [ ] **Step 4: Regenerate Convex types with pnpm**

From `packages/backend`, run:

```text
pnpm exec convex codegen
```

Expected: `api.d.ts` imports `../combat.js`; `dataModel.d.ts` remains generated from `schema.ts`. Do not follow the generated comment's `npx` wording.

- [ ] **Step 5: Pass focused/package tests and commit**

Run:

```text
vp test packages/backend/tests/combat.test.ts
vp run @riftforge/backend#check
vp run @riftforge/backend#test
```

Commit:

```text
git add -- packages/backend/convex/combat-values.ts packages/backend/convex/combat.ts packages/backend/convex/schema.ts packages/backend/convex/_generated/api.d.ts packages/backend/convex/_generated/dataModel.d.ts packages/backend/tests/combat.test.ts
git commit -m "feat(backend): add combat exchange ledger"
```

---

### Task 8: Server-Owned Attack Declaration

**Files:**

- Modify: `packages/backend/convex/combat.ts`
- Modify: `packages/backend/tests/combat.test.ts`

**Mutation contract:**

```ts
export const declareAttack = mutation({
  args: {
    attackerId: v.id("characters"),
    defenderId: v.id("characters"),
    weaponIndex: v.number(),
    expect: expectedItemValidator,
    context: combatContextValidator,
  },
  handler,
});
```

Expected failures use:

```ts
throw new ConvexError({
  code: "unsupportedMdWeapon",
  message: "M.D. weapons require the full M.D.C. combat follow-up.",
});
```

Use the complete approved code set: `selfTarget`, `attackerNotReady`, `defenderNotReady`, `weaponMissingOrChanged`, `unsupportedWeaponMode`, `unsupportedMdWeapon`, `unsupportedMdcProtection`, `invalidContext`, `modifierReasonRequired`, `illegalDefense`, `exchangeNotPending`, `combatStateChanged`, and `characterMissing`.

- [ ] **Step 1: Add failing declaration tests**

Assert:

- self-targeting returns `selfTarget` and inserts nothing;
- attacker/defender must have rolled H.P. and S.D.C.;
- indexed weapon instance must match `expect`;
- gear/nonweapon returns `unsupportedWeaponMode`;
- M.D. weapon returns `unsupportedMdWeapon` before dice/insert;
- nondepleted M.D.C. target returns `unsupportedMdcProtection` before dice/insert;
- kind mismatch/invalid modifier/refusal inserts nothing;
- melee `strikeModifier: -100` with a reason guarantees an immediate persisted `resolved` miss;
- melee `strikeModifier: 100` with a reason guarantees `pendingDefense`;
- stored roll fields are internally consistent and no die/result is accepted from client args;
- a pending record captures names, exact weapon instance, attack/context snapshots, both tokens, and server-derived options including explicit `none`.

- [ ] **Step 2: Run the focused test and observe the missing mutation**

Run: `vp test packages/backend/tests/combat.test.ts`

Expected: FAIL because `declareAttack` is missing.

- [ ] **Step 3: Implement pre-roll validation in the approved order**

1. Reject equal IDs.
2. Load and derive both characters.
3. Require rolled H.P./S.D.C. on both.
4. Verify the indexed item against `expect`.
5. Derive the attack profile and parse matching context.
6. Derive defender protection.
7. Reject M.D. weapon/M.D.C. protection.
8. Derive defense options and both state tokens.
9. Only now call `rollD20(attack.strikeBonus + contextModifier, attack.minimumStrikeTotal)`.
10. Insert a resolved miss or pending record and return it.

Convert rules validation errors into stable `ConvexError` data at the backend boundary; do not expose raw Zod issue arrays to the UI.

Implement the mutation with these helpers (imports come from
`@riftforge/rules`, `convex/values`, `./character-state`, and
`./combat-values`):

```ts
function combatFailure(code: CombatExchangeErrorCode, message: string): never {
  throw new ConvexError({ code, message });
}

function requireCombatReady(
  sheet: CharacterSheet,
  code: "attackerNotReady" | "defenderNotReady",
): void {
  if (sheet.vitals.sdc.rolled === undefined || sheet.vitals.hitPoints.rolled === undefined) {
    combatFailure(code, "Roll both S.D.C. and Hit Points before entering combat.");
  }
}

function parseDeclaredContext(
  attack: Extract<AttackProfile, { supported: true }>,
  input: unknown,
): CombatContext {
  const parsed = combatContextSchema.safeParse(input);
  if (!parsed.success) {
    const missingReason = parsed.error.issues.some((issue) =>
      issue.path.includes("strikeModifierReason"),
    );
    combatFailure(
      missingReason ? "modifierReasonRequired" : "invalidContext",
      missingReason
        ? "A reason is required for a nonzero strike modifier."
        : "The declared combat context is invalid.",
    );
  }
  if (parsed.data.kind !== attack.kind) {
    combatFailure("invalidContext", "The declared context does not match the weapon mode.");
  }
  return parsed.data;
}
```

```ts
export const declareAttack = mutation({
  args: {
    attackerId: v.id("characters"),
    defenderId: v.id("characters"),
    weaponIndex: v.number(),
    expect: expectedItemValidator,
    context: combatContextValidator,
  },
  handler: async (ctx, args) => {
    if (args.attackerId === args.defenderId) {
      combatFailure("selfTarget", "A character cannot target itself with a hostile exchange.");
    }
    let attacker: Character;
    let defender: Character;
    try {
      [attacker, defender] = await Promise.all([
        loadCharacter(ctx, args.attackerId),
        loadCharacter(ctx, args.defenderId),
      ]);
    } catch {
      combatFailure("characterMissing", "The attacker or defender no longer exists.");
    }
    const attackerSheet = deriveSheet(attacker);
    const defenderSheet = deriveSheet(defender);
    requireCombatReady(attackerSheet, "attackerNotReady");
    requireCombatReady(defenderSheet, "defenderNotReady");
    try {
      requireItemAt(attacker, args.weaponIndex, args.expect);
    } catch {
      combatFailure("weaponMissingOrChanged", "The selected weapon instance changed.");
    }
    const attack = deriveAttackProfile(attackerSheet, args.weaponIndex);
    if (!attack.supported) {
      combatFailure(
        attack.reason,
        attack.reason === "unsupportedMdWeapon"
          ? "M.D. weapons require the full M.D.C. combat follow-up."
          : "The selected item is not a supported weapon mode.",
      );
    }
    const context = parseDeclaredContext(attack, args.context);
    const protection = deriveProtection(defenderSheet);
    if (protection.kind === "mdcArmor") {
      combatFailure(
        "unsupportedMdcProtection",
        "M.D.C. protection requires the full M.D.C. combat follow-up.",
      );
    }
    const defenseOptions = deriveDefenseOptions(defenderSheet, attack, context);
    const strikeModifier = context.strikeModifier ?? 0;
    const strikeRoll = rollD20(attack.strikeBonus + strikeModifier, attack.minimumStrikeTotal);
    const declaration = evaluateDeclaration(strikeRoll, attack.minimumStrikeTotal);
    const { supported: _supported, weapon, ...attackSnapshot } = attack;
    const base = {
      attackerId: args.attackerId,
      defenderId: args.defenderId,
      attackerName: attackerSheet.name,
      defenderName: defenderSheet.name,
      weapon,
      attack: attackSnapshot,
      context,
      attackerStateToken: attackerCombatStateToken(attackerSheet, args.weaponIndex),
      defenderStateToken: defenderCombatStateToken(defenderSheet),
      strikeRoll,
    };
    const exchangeId = await ctx.db.insert(
      "combatExchanges",
      declaration.status === "miss"
        ? {
            ...base,
            status: "resolved" as const,
            resolution: {
              outcome: "miss" as const,
              reason: declaration.reason,
              critical: false as const,
              damageMultiplier: 1 as const,
            },
          }
        : { ...base, status: "pendingDefense" as const, defenseOptions },
    );
    return (await ctx.db.get(exchangeId))!;
  },
});
```

- [ ] **Step 4: Pass focused/backend gates and commit**

Run:

```text
vp test packages/backend/tests/combat.test.ts
vp run @riftforge/backend#check
vp run @riftforge/backend#test
```

Commit:

```text
git add -- packages/backend/convex/combat.ts packages/backend/tests/combat.test.ts
git commit -m "feat(backend): declare server-rolled attacks"
```

---

### Task 9: Atomic Response, Cancellation, and Stale-State Finalization

**Files:**

- Modify: `packages/backend/convex/combat.ts`
- Modify: `packages/backend/tests/combat.test.ts`

**Mutation contracts:**

```ts
export const respondToAttack = mutation({
  args: {
    exchangeId: v.id("combatExchanges"),
    response: combatResponseInputValidator,
  },
  handler,
});

export const cancelAttack = mutation({
  args: { exchangeId: v.id("combatExchanges") },
  handler,
});
```

- [ ] **Step 1: Add failing response/cancellation tests**

Use `strikeModifier: 100` to guarantee pending declarations and assert:

- `none` rolls damage server-side, resolves once, applies body S.D.C. before H.P., and stores matching before/after pools atomically;
- a melee defense with `defenseModifier: 100` guarantees a defended result and changes no pools;
- standard parry, bare-handed parry, dodge, and capability-gated auto dodge are accepted only when rederived options contain them;
- an illegal defense or missing modifier reason changes neither ledger nor character;
- `cancelAttack` changes pending to cancelled and no finalized state can respond/cancel again;
- two concurrent responses yield exactly one successful finalization and one `exchangeNotPending`, with damage applied once;
- changing attacker level/profile or selected weapon after declaration finalizes `stale` with no damage;
- changing defender body pools, defense profile, worn armor, or armor pool finalizes `stale` with no additional damage;
- updating either narrative does not stale; the response still resolves;
- unrelated P.P.E. or inventory state excluded by the token does not stale;
- resolving one hit intentionally stales a second pending hit made against the prior defender pools;
- response/cancel/query paths reject a missing character/exchange with the appropriate stable code.

- [ ] **Step 2: Run the focused test and observe missing mutations**

Run: `vp test packages/backend/tests/combat.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement stale check and response authorization before dice**

Load the pending record, reload/rederive both characters, and compare both tokens. On mismatch, patch only the exchange to:

```ts
{ ...exchange, status: "stale", staleAt: Date.now(), reason: "combatStateChanged" }
```

Return that record without rolling defense/damage or touching the defender. Otherwise rederive the attack profile, context, protection, and defense options, then authorize the submitted response. A client cannot replay the stored option bonus as authority.

Use replacement, not patching, when changing the discriminated variant; otherwise
`defenseOptions` from the pending variant would survive as a contradictory field:

```ts
function pendingBase(exchange: Doc<"combatExchanges">) {
  if (exchange.status !== "pendingDefense") {
    combatFailure("exchangeNotPending", "The combat exchange is no longer pending.");
  }
  const { _id, _creationTime, status: _status, defenseOptions: _options, ...base } = exchange;
  return { id: _id, base };
}

function parseResponse(input: unknown): CombatResponseInput {
  const parsed = combatResponseInputSchema.safeParse(input);
  if (!parsed.success) {
    const missingReason = parsed.error.issues.some((issue) =>
      issue.path.includes("defenseModifierReason"),
    );
    combatFailure(
      missingReason ? "modifierReasonRequired" : "illegalDefense",
      missingReason
        ? "A reason is required for a nonzero defense modifier."
        : "The combat response is invalid.",
    );
  }
  return parsed.data;
}
```

- [ ] **Step 4: Implement server dice and the atomic character/result write**

Roll defense only for `parry`/`dodge`/`autoDodge`, with target equal to the stored strike total. Run the pure resolver. Roll damage only if the result can hit, using `rollDamage(attack.damageFormula, attack.damageBonus)`; the pure resolver applies critical multiplication and routing.

For a body route, patch current S.D.C./H.P.; for an armor route, patch only current armor. Re-run `deriveSheet` on the complete candidate character before `ctx.db.patch`. Finalize the exchange in the same mutation after the validated candidate is known. Convex transaction rollback must leave neither half committed if any later validation throws.

```ts
export const respondToAttack = mutation({
  args: {
    exchangeId: v.id("combatExchanges"),
    response: combatResponseInputValidator,
  },
  handler: async (ctx, args) => {
    const stored = await ctx.db.get(args.exchangeId);
    if (stored === null) {
      combatFailure("exchangeNotPending", "The combat exchange no longer exists.");
    }
    const { id, base } = pendingBase(stored);
    let attacker: Character;
    let defender: Character;
    try {
      [attacker, defender] = await Promise.all([
        loadCharacter(ctx, stored.attackerId),
        loadCharacter(ctx, stored.defenderId),
      ]);
    } catch {
      combatFailure("characterMissing", "The attacker or defender no longer exists.");
    }
    const attackerSheet = deriveSheet(attacker);
    const defenderSheet = deriveSheet(defender);
    const tokensMatch =
      attackerCombatStateToken(attackerSheet, stored.weapon.index) === stored.attackerStateToken &&
      defenderCombatStateToken(defenderSheet) === stored.defenderStateToken;
    if (!tokensMatch) {
      await ctx.db.replace(id, {
        ...base,
        status: "stale",
        staleAt: Date.now(),
        reason: "combatStateChanged",
      });
      return (await ctx.db.get(id))!;
    }

    const attack = deriveAttackProfile(attackerSheet, stored.weapon.index);
    if (!attack.supported) {
      combatFailure("combatStateChanged", "The stored attack profile can no longer be derived.");
    }
    const context = validateCombatContext(attack, stored.context);
    const protection = deriveProtection(defenderSheet);
    if (protection.kind === "mdcArmor") {
      combatFailure("combatStateChanged", "The defender's protection changed.");
    }
    const options = deriveDefenseOptions(defenderSheet, attack, context);
    const responseInput = parseResponse(args.response);
    let response: AuthorizedCombatResponse;
    try {
      response = authorizeCombatResponse(options, responseInput);
    } catch {
      combatFailure("illegalDefense", "That defense is not legal for this exchange.");
    }
    const defenseRoll =
      response.kind === "none" ? undefined : rollD20(response.totalBonus, stored.strikeRoll.total);
    const opposed = resolveStrike({
      strike: stored.strikeRoll,
      ...(defenseRoll === undefined
        ? {}
        : { defense: { kind: response.kind as DefenseKind, roll: defenseRoll } }),
      allowedDefenses: defenseRoll === undefined ? [] : [response.kind as DefenseKind],
      damageType: "sdc",
      criticalOn: attack.criticalOn,
    });
    const damageRoll =
      opposed.outcome === "hit" ? rollDamage(attack.damageFormula, attack.damageBonus) : undefined;
    const resolution = resolveCombatExchange({
      attack,
      context,
      strikeRoll: stored.strikeRoll,
      response,
      ...(defenseRoll === undefined ? {} : { defenseRoll }),
      ...(damageRoll === undefined ? {} : { damageRoll }),
      protection,
      body: {
        sdc: defenderSheet.vitals.sdc.current!,
        hitPoints: defenderSheet.vitals.hitPoints.current!,
      },
      comaDeathFloor: defenderSheet.vitals.comaDeathFloor,
    });

    if (resolution.outcome === "hit") {
      const current =
        resolution.route.kind === "armor"
          ? { ...defender.current, armor: resolution.route.armor.after }
          : {
              ...defender.current,
              sdc: resolution.route.body.after.sdc,
              hitPoints: resolution.route.body.after.hitPoints,
            };
      await patchCurrent(ctx, stored.defenderId, defender, current);
    }
    await ctx.db.replace(id, { ...base, status: "resolved", resolution });
    return (await ctx.db.get(id))!;
  },
});
```

- [ ] **Step 5: Implement pending-only cancellation**

Reload by exchange ID, require `pendingDefense`, and patch the discriminated cancelled variant. Note in code that authorization is intentionally unavailable in this slice; do not simulate ownership with attacker/defender IDs supplied by the client.

```ts
export const cancelAttack = mutation({
  args: { exchangeId: v.id("combatExchanges") },
  handler: async (ctx, { exchangeId }) => {
    const stored = await ctx.db.get(exchangeId);
    if (stored === null) {
      combatFailure("exchangeNotPending", "The combat exchange no longer exists.");
    }
    const { id, base } = pendingBase(stored);
    // Accounts/roles are not modeled yet; do not pretend an actor ID is authorization.
    await ctx.db.replace(id, { ...base, status: "cancelled", cancelledAt: Date.now() });
    return (await ctx.db.get(id))!;
  },
});
```

- [ ] **Step 6: Pass focused/backend gates and commit**

Run:

```text
vp test packages/backend/tests/combat.test.ts packages/backend/tests/characters.test.ts packages/backend/tests/healing-cast.test.ts
vp run @riftforge/backend#check
vp run @riftforge/backend#test
```

Commit:

```text
git add -- packages/backend/convex/combat.ts packages/backend/tests/combat.test.ts
git commit -m "feat(backend): resolve combat exchanges atomically"
```

---

### Task 10: Pure Web Presentation and Ownership Guards

**Files:**

- Create: `apps/web/src/lib/combat-exchange.ts`
- Create: `apps/web/tests/combat-exchange.test.ts`

**Interfaces:**

```ts
export interface AsyncOwner {
  routeId: string;
  routeEpoch: number;
  exchangeId?: string;
}

export function ownsAsyncResult(
  owner: AsyncOwner,
  current: { routeId: string; routeEpoch: number; exchangeId?: string },
): boolean;

export function combatWeaponChoices(sheet: CharacterSheet): Array<{
  index: number;
  itemId: string;
  label: string;
  supported: boolean;
  disabledReason?: string;
}>;

export function combatTargetDisabledReason(target: CombatTargetSummary): string | undefined;
export function exchangeTone(exchange: ExchangeSummary): "dim" | "warn" | "bad" | "good";
export function formatExchangeSummary(exchange: ExchangeSummary): string;
export function combatErrorMessage(error: unknown): string;
```

Define the backend-return types without hand-copying them:

```ts
type CombatTargets = FunctionReturnType<typeof api.combat.targets>;
export type CombatTargetSummary = CombatTargets[number];
type CombatRecent = FunctionReturnType<typeof api.combat.recent>;
export type ExchangeSummary = CombatRecent[number];
```

- [ ] **Step 1: Add failing pure web tests**

Assert:

- only owned weapons appear; all four S.D.C. weapons are enabled and M.D. weapons remain visible/disabled with full-M.D.C. copy;
- unready and M.D.C.-protected targets expose precise disabled copy;
- pending/stale/cancelled/miss/defended/hit tones map to amber/amber/muted/muted/green/red semantics without cyan;
- summaries include attacker/defender, weapon, strike, defense when present, critical, detailed damage, route, and remaining pool without fabricating absent fields;
- a result with a different route ID, epoch, or expected exchange ID is rejected;
- a current owner with all fields equal is accepted.

- [ ] **Step 2: Run the focused test and observe missing module failure**

Run: `vp test apps/web/tests/combat-exchange.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement structural helpers without duplicating rules math**

`combatWeaponChoices` may call `deriveAttackProfile` for preview/support labels, but it must not calculate bonuses, thresholds, defenses, criticals, or A.R. itself. Formatting consumes server result fields verbatim. Keep helpers DOM-free so the current Node test environment remains sufficient.

```ts
import { api } from "@riftforge/backend/api";
import { deriveAttackProfile, type CharacterSheet } from "@riftforge/rules";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";

type CombatTargets = FunctionReturnType<typeof api.combat.targets>;
export type CombatTargetSummary = CombatTargets[number];
type CombatRecent = FunctionReturnType<typeof api.combat.recent>;
export type ExchangeSummary = CombatRecent[number];

export interface AsyncOwner {
  routeId: string;
  routeEpoch: number;
  exchangeId?: string;
}

export function ownsAsyncResult(owner: AsyncOwner, current: AsyncOwner): boolean {
  return (
    owner.routeId === current.routeId &&
    owner.routeEpoch === current.routeEpoch &&
    owner.exchangeId === current.exchangeId
  );
}

export function combatWeaponChoices(sheet: CharacterSheet) {
  return sheet.equipment.flatMap((entry, index) => {
    if (entry.item.kind !== "weapon") return [];
    const profile = deriveAttackProfile(sheet, index);
    return [
      {
        index,
        itemId: entry.item.id,
        label: `${entry.item.name} — ${entry.item.damage.formula} ${
          entry.item.damage.type === "md" ? "M.D." : "S.D.C."
        }`,
        supported: profile.supported,
        ...(profile.supported
          ? {}
          : {
              disabledReason:
                profile.reason === "unsupportedMdWeapon"
                  ? "Full M.D.C. combat is follow-up work."
                  : "This weapon mode is not supported.",
            }),
      },
    ];
  });
}

export function combatTargetDisabledReason(target: CombatTargetSummary): string | undefined {
  if (!target.ready) return "Roll this target's H.P. and S.D.C. first.";
  if (target.protection === "mdcArmor") return "Full M.D.C. combat is follow-up work.";
  return undefined;
}

export function exchangeTone(exchange: ExchangeSummary): "dim" | "warn" | "bad" | "good" {
  if (exchange.status === "pendingDefense" || exchange.status === "stale") return "warn";
  if (exchange.status === "cancelled") return "dim";
  if (exchange.resolution.outcome === "defended") return "good";
  if (exchange.resolution.outcome === "hit") return "bad";
  return "dim";
}

const signed = (value: number) => (value >= 0 ? `+${value}` : String(value));

export function formatExchangeSummary(exchange: ExchangeSummary): string {
  const strike = `d20[${exchange.strikeRoll.die}]${signed(exchange.strikeRoll.bonus)} = ${exchange.strikeRoll.total}`;
  const lead = `${exchange.attackerName} → ${exchange.defenderName} :: ${exchange.weapon.name} :: ${strike}`;
  if (exchange.status === "pendingDefense") return `${lead} :: AWAITING DEFENSE`;
  if (exchange.status === "cancelled") return `${lead} :: CANCELLED`;
  if (exchange.status === "stale") return `${lead} :: STALE — COMBAT STATE CHANGED`;
  const result = exchange.resolution;
  if (result.outcome === "miss") return `${lead} :: MISS (${result.reason})`;
  if (result.outcome === "defended") {
    return `${lead} :: ${result.response.kind.toUpperCase()} d20[${result.defenseRoll.die}]${signed(result.defenseRoll.bonus)} = ${result.defenseRoll.total} :: DEFENDED`;
  }
  const damage = `[${result.damageRoll.dice.join("][")}]${signed(result.damageRoll.bonus)} = ${result.totalDamage} S.D.C.`;
  const critical = result.critical ? " :: CRITICAL" : "";
  const remaining =
    result.route.kind === "armor"
      ? `ARMOR ${result.route.armor.after}`
      : `BODY S.D.C. ${result.route.body.after.sdc} / H.P. ${result.route.body.after.hitPoints}`;
  return `${lead}${critical} :: ${damage} → ${remaining}`;
}

export function combatErrorMessage(error: unknown): string {
  if (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    "message" in error.data &&
    typeof error.data.message === "string"
  ) {
    return error.data.message;
  }
  return error instanceof Error ? error.message : String(error);
}
```

- [ ] **Step 4: Pass focused/web gates and commit**

Run:

```text
vp test apps/web/tests/combat-exchange.test.ts apps/web/tests/convex.test.ts
vp run @riftforge/web#check
vp run @riftforge/web#test
```

Commit:

```text
git add -- apps/web/src/lib/combat-exchange.ts apps/web/tests/combat-exchange.test.ts
git commit -m "test(web): define combat exchange presentation"
```

---

### Task 11: SolidJS Combat Exchange Command Panel

**Files:**

- Create: `apps/web/src/components/combat-exchange-panel.tsx`
- Modify: `apps/web/src/components/ui.tsx`
- Modify: `apps/web/src/components/telemetry-rail.tsx`
- Modify: `apps/web/src/pages/character-sheet.tsx`
- Modify: `apps/web/tests/combat-exchange.test.ts`

**Component contract:**

```ts
export interface CombatExchangePanelProps {
  characterId: Id<"characters">;
  sheet: CharacterSheet;
  onTelemetry: (text: string, tone?: TelemetryTone) => void;
}

export function CombatExchangePanel(props: CombatExchangePanelProps): JSX.Element;
```

- [ ] **Step 1: Add the native select primitive**

Add `SelectInput` beside `TextInput` in `components/ui.tsx` using the same `notch-8`, border, noir background, mono text, amber focus, disabled-dead styling, and `ComponentProps<"select">` forwarding. No rounded corners and no new color tokens.

```tsx
export function SelectInput(props: ComponentProps<"select">) {
  const [own, rest] = splitProps(props, ["class", "children"]);
  return (
    <select
      class={`notch-8 border border-line bg-noir px-3 py-2 font-mono text-[13px] text-fg focus:border-amber disabled:text-dead ${own.class ?? ""}`}
      {...rest}
    >
      {own.children}
    </select>
  );
}
```

Move `ToggleChip` from `character-sheet.tsx` to `components/ui.tsx`, export it,
and import it back into the page as well as the new panel:

```tsx
export function ToggleChip(props: {
  pressed: boolean;
  onToggle: () => void;
  tone?: "ley" | "amber";
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.pressed}
      class={`notch-6 cursor-pointer border bg-inset px-2 font-hud text-[11.5px] font-semibold tracking-[0.08em] uppercase ${
        props.pressed
          ? props.tone === "ley"
            ? "border-ley/60 text-ley [text-shadow:0_0_8px_rgb(79_216_255/0.5)]"
            : "border-amber/60 text-amber"
          : "border-line text-dead hover:border-muted"
      }`}
      onClick={() => props.onToggle()}
    >
      {props.children}
    </button>
  );
}
```

- [ ] **Step 2: Build the declaration section**

In `CombatExchangePanel`:

- subscribe to `api.combat.targets`, `incoming`, `outgoing`, and `recent` with reactive character IDs;
- bind `declareAttack`, `respondToAttack`, and `cancelAttack` mutations;
- show target and owned-weapon native selects with visible disabled reasons;
- derive whether melee/ranged context controls render from the selected supported profile;
- provide an awareness toggle, melee parry-mode select or ranged range-band select, optional signed modifier, and reason input required by the form when nonzero;
- disable `DECLARE ATTACK` until both selector and context requirements are satisfied;
- submit attacker/defender IDs, index, exact item snapshot, and context only;
- never roll strike/damage client-side and never submit a damage route;
- announce success/failure through a visible `Alert` live region and one concise telemetry line.

Use this state/query skeleton in the component; the selector data and profile math
come from the pure helper/rules package:

```tsx
const targets = createQuery(convex, api.combat.targets, () => ({
  attackerId: props.characterId,
}));
const incoming = createQuery(convex, api.combat.incoming, () => ({
  defenderId: props.characterId,
}));
const outgoing = createQuery(convex, api.combat.outgoing, () => ({
  attackerId: props.characterId,
}));
const recent = createQuery(convex, api.combat.recent, () => ({
  characterId: props.characterId,
}));
const declareAttack = createMutation(convex, api.combat.declareAttack);
const [targetId, setTargetId] = createSignal("");
const [weaponIndex, setWeaponIndex] = createSignal("");
const [aware, setAware] = createSignal(true);
const [parryMode, setParryMode] = createSignal<ParryMode>("standard");
const [rangeBand, setRangeBand] = createSignal<RangeBand>("normal");
const [strikeModifier, setStrikeModifier] = createSignal("");
const [strikeReason, setStrikeReason] = createSignal("");
const [busy, setBusy] = createSignal(false);
const [error, setError] = createSignal<string>();
const [historyExpanded, setHistoryExpanded] = createSignal(false);
const choices = createMemo(() => combatWeaponChoices(props.sheet));
const selectedIndex = createMemo(() => {
  const value = Number(weaponIndex());
  return Number.isInteger(value) ? value : undefined;
});
const selectedAttack = createMemo(() => {
  const index = selectedIndex();
  return index === undefined ? undefined : deriveAttackProfile(props.sheet, index);
});
const modifierValue = createMemo(() => {
  const raw = strikeModifier().trim();
  if (raw === "") return 0;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= -100 && value <= 100 ? value : undefined;
});
const canDeclare = createMemo(() => {
  const target = targets.data()?.find((candidate) => candidate.id === targetId());
  const attack = selectedAttack();
  const modifier = modifierValue();
  return (
    !busy() &&
    target !== undefined &&
    combatTargetDisabledReason(target) === undefined &&
    attack?.supported === true &&
    modifier !== undefined &&
    (modifier === 0 || strikeReason().trim() !== "")
  );
});
```

The submit handler is:

```tsx
const submitDeclaration = async () => {
  const index = selectedIndex();
  const attack = selectedAttack();
  const modifier = modifierValue();
  const target = targetId() as Id<"characters">;
  const entry = index === undefined ? undefined : props.sheet.equipment[index];
  if (
    !canDeclare() ||
    index === undefined ||
    !attack?.supported ||
    modifier === undefined ||
    !entry
  ) {
    return;
  }
  const owner = { routeId: props.characterId, routeEpoch };
  setBusy(true);
  setError(undefined);
  try {
    const result = await declareAttack({
      attackerId: props.characterId,
      defenderId: target,
      weaponIndex: index,
      expect: {
        itemId: entry.item.id,
        ...(entry.worn === true ? { worn: true } : {}),
        ...(entry.rolledMdc === undefined ? {} : { rolledMdc: entry.rolledMdc }),
      },
      context:
        attack.kind === "melee"
          ? {
              kind: "melee",
              defenderAware: aware(),
              parryMode: parryMode(),
              ...(modifier === 0 ? {} : { strikeModifier: modifier }),
              ...(strikeReason().trim() === ""
                ? {}
                : { strikeModifierReason: strikeReason().trim() }),
            }
          : {
              kind: "ranged",
              defenderAware: aware(),
              rangeBand: rangeBand(),
              ...(modifier === 0 ? {} : { strikeModifier: modifier }),
              ...(strikeReason().trim() === ""
                ? {}
                : { strikeModifierReason: strikeReason().trim() }),
            },
    });
    if (!ownsAsyncResult(owner, { routeId: props.characterId, routeEpoch })) return;
    props.onTelemetry(
      `> COMBAT :: ${result.weapon.name.toUpperCase()} — ${result.status.toUpperCase()}`,
      result.status === "resolved" ? "dim" : "machine",
    );
    setStrikeModifier("");
    setStrikeReason("");
  } catch (caught) {
    if (!ownsAsyncResult(owner, { routeId: props.characterId, routeEpoch })) return;
    const message = combatErrorMessage(caught);
    setError(message);
    props.onTelemetry(`> COMBAT :: DECLARATION REFUSED — ${message}`, "bad");
  } finally {
    if (ownsAsyncResult(owner, { routeId: props.characterId, routeEpoch })) setBusy(false);
  }
};
```

Render it inside a single `Panel` headed `// COMBAT EXCHANGE`. This is the exact
declaration form structure; keep the compact utility classes and do not add cards
around individual rows:

```tsx
<Panel class="space-y-3 p-3">
  <SectionTitle>COMBAT EXCHANGE</SectionTitle>
  <div class="space-y-2 border-t border-line pt-2">
    <label class="block space-y-1">
      <MonoLabel class="block">TARGET</MonoLabel>
      <SelectInput
        class="w-full"
        value={targetId()}
        onChange={(event) => setTargetId(event.currentTarget.value)}
      >
        <option value="">SELECT DOSSIER</option>
        <For each={targets.data()}>
          {(target) => (
            <option value={target.id} disabled={combatTargetDisabledReason(target) !== undefined}>
              {target.name}
              {combatTargetDisabledReason(target) ? ` — ${combatTargetDisabledReason(target)}` : ""}
            </option>
          )}
        </For>
      </SelectInput>
    </label>
    <label class="block space-y-1">
      <MonoLabel class="block">WEAPON</MonoLabel>
      <SelectInput
        class="w-full"
        value={weaponIndex()}
        onChange={(event) => setWeaponIndex(event.currentTarget.value)}
      >
        <option value="">SELECT WEAPON</option>
        <For each={choices()}>
          {(choice) => (
            <option value={choice.index} disabled={!choice.supported}>
              {choice.label}
              {choice.disabledReason ? ` — ${choice.disabledReason}` : ""}
            </option>
          )}
        </For>
      </SelectInput>
    </label>
    <div class="flex items-end gap-2">
      <ToggleChip pressed={aware()} onToggle={() => setAware((value) => !value)}>
        AWARE
      </ToggleChip>
      <Show when={selectedAttack()?.supported === true && selectedAttack()!.kind === "melee"}>
        <label class="min-w-0 flex-1 space-y-1">
          <MonoLabel class="block">PARRY MODE</MonoLabel>
          <SelectInput
            class="w-full"
            value={parryMode()}
            onChange={(event) => setParryMode(event.currentTarget.value as ParryMode)}
          >
            <option value="unavailable">UNAVAILABLE</option>
            <option value="standard">STANDARD</option>
            <option value="bareHanded">BARE-HANDED</option>
          </SelectInput>
        </label>
      </Show>
      <Show when={selectedAttack()?.supported === true && selectedAttack()!.kind === "ranged"}>
        <label class="min-w-0 flex-1 space-y-1">
          <MonoLabel class="block">RANGE BAND</MonoLabel>
          <SelectInput
            class="w-full"
            value={rangeBand()}
            onChange={(event) => setRangeBand(event.currentTarget.value as RangeBand)}
          >
            <option value="pointBlank">POINT-BLANK</option>
            <option value="close">CLOSE</option>
            <option value="normal">NORMAL</option>
          </SelectInput>
        </label>
      </Show>
    </div>
    <div class="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
      <label class="space-y-1">
        <MonoLabel class="block">MOD</MonoLabel>
        <TextInput
          aria-label="Strike modifier"
          inputmode="numeric"
          value={strikeModifier()}
          onInput={(event) => setStrikeModifier(event.currentTarget.value)}
        />
      </label>
      <label class="space-y-1">
        <MonoLabel class="block">REASON</MonoLabel>
        <TextInput
          aria-label="Strike modifier reason"
          class="w-full"
          value={strikeReason()}
          onInput={(event) => setStrikeReason(event.currentTarget.value)}
        />
      </label>
    </div>
    <Button
      variant="primary"
      class="w-full text-left"
      disabled={!canDeclare()}
      onClick={() => void submitDeclaration()}
    >
      {busy() ? "> TRANSMITTING…" : "> DECLARE ATTACK"}
    </Button>
    <Show when={error()}>{(message) => <Alert tone="danger">{message()}</Alert>}</Show>
  </div>
</Panel>
```

- [ ] **Step 3: Build incoming and outgoing queues**

Incoming rows show attacker, weapon, natural strike die, bonus, total, and stored context before any response action. Render only the stored server-derived response options as buttons, with modifier and `0 ACTION`/`1 ACTION` metadata. Render “TAKE THE HIT” explicitly for `none`.

Each response form owns an optional modifier/reason. On submit, capture `{routeId, routeEpoch, exchangeId}` and ignore completion unless it still owns all three. Outgoing pending rows show target/weapon/strike and an explicit `CANCEL` command.

Use keyed row components so draft state is scoped to an exchange. The response
handler must have this ownership and payload shape:

```ts
type IncomingExchange = FunctionReturnType<typeof api.combat.incoming>[number];
type OutgoingExchange = FunctionReturnType<typeof api.combat.outgoing>[number];
```

`IncomingExchangeRow` receives `exchange: IncomingExchange`, `characterId`,
`routeEpoch: Accessor<number>`, and `onTelemetry`. It creates its own
`respondToAttack` mutation plus `defenseModifier`, `defenseReason`, `busy`, and
`error` signals. Its `defenseModifierValue` uses the same safe-integer -100..100
parser as the declaration modifier.

```tsx
const submitResponse = async (kind: CombatResponseKind) => {
  const modifier = defenseModifierValue();
  if (modifier === undefined || (modifier !== 0 && defenseReason().trim() === "")) return;
  const owner = {
    routeId: props.characterId,
    routeEpoch: props.routeEpoch(),
    exchangeId: props.exchange._id,
  };
  setBusy(true);
  setError(undefined);
  try {
    const result = await respondToAttack({
      exchangeId: props.exchange._id,
      response: {
        kind,
        ...(modifier === 0 ? {} : { defenseModifier: modifier }),
        ...(defenseReason().trim() === "" ? {} : { defenseModifierReason: defenseReason().trim() }),
      },
    });
    const current = {
      routeId: props.characterId,
      routeEpoch: props.routeEpoch(),
      exchangeId: props.exchange._id,
    };
    if (!ownsAsyncResult(owner, current)) return;
    props.onTelemetry(
      `> COMBAT :: ${result.status === "stale" ? "STALE" : "RESPONSE LOCKED"}`,
      result.status === "stale" ? "dim" : "machine",
    );
  } catch (caught) {
    const current = {
      routeId: props.characterId,
      routeEpoch: props.routeEpoch(),
      exchangeId: props.exchange._id,
    };
    if (!ownsAsyncResult(owner, current)) return;
    setError(combatErrorMessage(caught));
  } finally {
    const current = {
      routeId: props.characterId,
      routeEpoch: props.routeEpoch(),
      exchangeId: props.exchange._id,
    };
    if (ownsAsyncResult(owner, current)) setBusy(false);
  }
};
```

Render options directly from `props.exchange.defenseOptions`:

```tsx
<For each={props.exchange.defenseOptions}>
  {(option) => (
    <Button disabled={busy()} onClick={() => void submitResponse(option.kind)}>
      {option.kind === "none" ? "> TAKE THE HIT" : `> ${option.kind.toUpperCase()}`} ·
      {option.bonus >= 0 ? "+" : ""}
      {option.bonus} · {option.actionCost} ACTION
    </Button>
  )}
</For>
```

The outgoing cancel handler captures the same owner triple, calls
`cancelAttack({ exchangeId })`, and emits `> COMBAT :: ATTACK CANCELLED` only if
the owner still matches. Render the strike die/bonus/total before both incoming
and outgoing actions.

- [ ] **Step 4: Build recent persisted history**

Use `formatExchangeSummary` and `exchangeTone`. Show at most 20 entries; include miss, defended, hit, cancelled, and stale states. Newly observed resolved IDs may receive the existing `strike-flash` class once, but do not animate the whole rail or add an animation dependency.

```tsx
<section class="border-t border-line pt-2" aria-labelledby="combat-recent-title">
  <MonoLabel class="block text-dead" id="combat-recent-title">
    RECENT
  </MonoLabel>
  <Show
    when={(recent.data()?.length ?? 0) > 0}
    fallback={<p class="font-mono text-[11.5px] text-dead">// NO EXCHANGES</p>}
  >
    <ol class="mt-2 space-y-2">
      <For each={recent.data()}>
        {(exchange) => (
          <li class={`border-l-2 px-2 font-mono text-[11px] ${toneClass[exchangeTone(exchange)]}`}>
            {formatExchangeSummary(exchange)}
          </li>
        )}
      </For>
    </ol>
  </Show>
</section>
```

Define `toneClass` locally as dim -> `border-dead text-muted`, warn ->
`border-amber text-amber`, bad -> `border-blood text-blood-text`, and good ->
`border-ok text-ok`. There is intentionally no cyan mapping.

```ts
const toneClass = {
  dim: "border-dead text-muted",
  warn: "border-amber text-amber",
  bad: "border-blood text-blood-text",
  good: "border-ok text-ok",
} as const;
```

- [ ] **Step 5: Implement route reset and async ownership**

Implement a named `resetRouteState` callback and wire it with
`createEffect(on(() => props.characterId, resetRouteState, { defer: true }))`.
The callback increments a monotonic route epoch and resets target, weapon,
context, modifiers, response draft/error state, and expanded history. Mutation
completion handlers must check the captured route ID and epoch; response
handlers also check exchange ID. A boolean `busy` may control button affordance,
but it is never sufficient for ownership.

```tsx
let routeEpoch = 0;
const resetRouteState = () => {
  routeEpoch += 1;
  setTargetId("");
  setWeaponIndex("");
  setAware(true);
  setParryMode("standard");
  setRangeBand("normal");
  setStrikeModifier("");
  setStrikeReason("");
  setBusy(false);
  setError(undefined);
  setHistoryExpanded(false);
};
createEffect(on(() => props.characterId, resetRouteState, { defer: true }));
```

- [ ] **Step 6: Mount the panel at the top of the right rail**

Change `TelemetryRail`'s root from `<aside>` to `<section>` so the new outer rail
is the sole complementary landmark. Preserve its `aria-label`, log role,
auto-scroll, and current action controls. Keep the existing manual `Damage`
utility visibly separate from `DECLARE ATTACK`.

Insert this opening markup immediately before the existing `TelemetryRail` call,
leave that call and its complete `actions` expression unchanged as the next child,
then close the `aside` immediately after it:

```tsx
<aside class="min-w-0 space-y-3" aria-label="Dossier command rail">
  <CombatExchangePanel
    characterId={id()}
    sheet={sheet()!}
    onTelemetry={telemetry.log}
  />
```

The exact closing markup after the current `TelemetryRail` call is `</aside>`.

Change the root element returned by `TelemetryRail` from `aside` to `section`
and keep `aria-label="Field telemetry"`. Update the page's gameplay comment to
distinguish ephemeral client-side utility rolls from persisted server-owned
hostile combat exchanges.

- [ ] **Step 7: Run web and affected package gates**

Run:

```text
vp test apps/web/tests/combat-exchange.test.ts apps/web/tests/convex.test.ts
vp run @riftforge/web#check
vp run @riftforge/web#test
vp run @riftforge/backend#check
```

Expected: PASS.

- [ ] **Step 8: Commit the panel**

```text
git add -- apps/web/src/components/combat-exchange-panel.tsx apps/web/src/components/ui.tsx apps/web/src/pages/character-sheet.tsx apps/web/src/lib/combat-exchange.ts apps/web/tests/combat-exchange.test.ts
git commit -m "feat(web): add S.D.C. combat exchange panel"
```

---

### Task 12: Full Automated Verification and Review Hardening

**Files:**

- Modify as needed: only files already in the approved file map

- [ ] **Step 1: Run all affected package gates in CI order**

```text
vp run @riftforge/rules#check
vp run @riftforge/rules#test
vp run @riftforge/backend#check
vp run @riftforge/backend#test
vp run @riftforge/web#check
vp run @riftforge/web#test
```

Expected: all PASS. Record the actual test counts; do not reuse historical counts.

- [ ] **Step 2: Run root gates and whitespace validation**

```text
vp check
vp test
git diff --check
```

Expected: all PASS.

- [ ] **Step 3: Review the full diff against the approved design**

Run:

```text
git diff --stat main...HEAD
git diff --check main...HEAD
git status --short --branch
```

Manually verify every stable error code is produced, no Natural A.R. branch exists, no M.D.C. arithmetic/conversion exists, every public query is bounded/indexed, every random roll is server-owned, final character state is revalidated, and the web never computes/routs damage.

- [ ] **Step 4: Fix only evidence-backed findings with new regression tests**

For every real defect found, add the smallest failing test that demonstrates the bug class, run it red, fix the root cause, rerun the focused test and affected package gates, then checkpoint-commit:

```text
git commit -m "fix(combat): harden exchange invariants"
```

Skip this commit if no change is needed.

---

### Task 13: Live Convex and Browser Acceptance

**Files:**

- No required source files; fix only reproducible defects with tests.

- [ ] **Step 1: Start from a known live-backend state**

Check port 3210 and identify its owning process. If an orphaned `convex-local-backend` is serving stale functions, stop that exact process only. From `packages/backend`, run `pnpm exec convex dev`; from `apps/web`, run `vp dev`. Keep both processes available while testing `http://localhost:5173`.

- [ ] **Step 2: Prepare two combat-ready characters**

Use existing local characters or seed two valid characters. Roll both characters' vitals. Give the attacker `survival-knife` and `automatic-pistol`. Keep the defender unarmored for the supported path. Open both dossier URLs in separate tabs/windows so Convex live subscriptions are exercised across clients.

- [ ] **Step 3: Verify the complete supported flow**

Repeat real declarations as needed to observe and capture:

1. a server-rolled immediate miss;
2. a pending melee strike followed by parry, dodge, or take-the-hit;
3. a pending firearm strike with range-band copy and no parry option;
4. a successful defense with unchanged pools/history finalized together;
5. a hit with body S.D.C. then H.P. change and matching persisted history in both dossiers;
6. action-cost metadata and strike/defense/damage details;
7. concise telemetry lines without telemetry becoming the source of truth.

- [ ] **Step 4: Verify boundaries and navigation ownership**

Equip a nondepleted production M.D.C. suit on the defender and verify target/declaration disable copy. Keep backend tests as the direct-call proof that the server also refuses it before insertion. Verify M.D. weapons remain visible but disabled.

Navigate from one character ID to another while a declaration/response is in flight. Verify target/weapon/context/error/history drafts reset and no late result or telemetry line crosses into the new dossier. Verify keyboard operation, visible focus, native labels, and screen-reader live regions. Check the rail at desktop and narrow/mobile widths for overflow.

- [ ] **Step 5: Stop only the processes started for this check**

Terminate the captured Convex CLI/local-backend and web-dev process IDs. Do not kill unrelated Node processes.

- [ ] **Step 6: Re-run affected gates after any live fix**

If live verification caused code changes, rerun Task 12 completely and commit the tested fix. If no changes were needed, record the live scenarios and timestamp in the design outcome without creating an empty commit.

---

### Task 14: Documentation, Tracker Boundary, and Draft PR

**Files:**

- Modify: `README.md`
- Modify: `.codex/superpowers/specs/2026-07-19-sdc-combat-exchange-design.md`
- Modify: `.codex/superpowers/plans/2026-07-19-sdc-combat-exchange.md`

- [ ] **Step 1: Update repository documentation with verified current state**

Replace README language saying A.R./hostile persistence are wholly future work with a concise statement that S.D.C. weapon exchanges, defense choice, body routing, and future-ready artificial S.D.C. armor routing exist; explicitly state that full M.D.C. interaction remains follow-up work.

Append an implementation-outcome section to the approved design with commit(s), actual package/root test counts, live scenarios, and the date/time scope. Check completed plan boxes only when their evidence exists.

- [ ] **Step 2: Run documentation gates and commit**

```text
vp check
vp test
git diff --check
git status --short --branch
```

Commit:

```text
git add -- README.md .codex/superpowers/specs/2026-07-19-sdc-combat-exchange-design.md .codex/superpowers/plans/2026-07-19-sdc-combat-exchange.md
git commit -m "docs: record S.D.C. combat delivery"
```

- [ ] **Step 3: Correct and align issue #44**

Refresh the issue first:

```text
gh issue view 44 --json number,title,body,state,labels,url
```

Edit the body so it no longer claims Natural A.R. needs implementation. Preserve the foundation context, then state with rendered p.339 evidence that Natural A.R. does not apply in Rifts; describe the delivered S.D.C.-tier exchange/armor-routing scope; list full M.D.C. as an explicit follow-up; and include time-scoped package/root/live verification. Do not close #44 from the branch.

- [ ] **Step 4: Create the dedicated full-M.D.C. follow-up**

Before creating, search again to prevent a duplicate:

```text
gh issue list --state all --limit 100 --search "M.D.C. combat" --json number,title,state,url
```

If no equivalent issue exists, create one titled:

```text
Full M.D.C. combat: tier interaction, armor ablation, and unprotected outcomes
```

The body must cover: M.D.-to-M.D.C. damage, S.D.C.-to-M.D.C. imperviousness/conversion rules, final-point/final-blast armor absorption, depleted protection, M.D. against an unprotected mortal, required injury/death-state modeling, page verification from rendered RUE pp.288 and 355-359, and explicit dependency on #44's ledger. Apply `area:rules`; do not mark it `next-up` unless the maintainer explicitly chooses that ordering.

Use this reviewed body and capture the returned URL:

```text
$mdcBody = @'
Issue #44 deliberately stops at the S.D.C. tier. This follow-up extends its persisted exchange ledger with the complete Mega-Damage rules after re-verifying the rendered Rifts Ultimate Edition pages.

Scope:
- M.D. weapon damage against M.D.C. protection.
- S.D.C./Hit Point attacks against M.D.C. protection, including imperviousness and any printed conversion exceptions.
- The final armor point/final-blast absorption rule and behavior after protection reaches zero.
- M.D. against an unprotected mortal, including any injury, coma, or death state the current character schema cannot represent.
- Pure deterministic rules, atomic Convex persistence, UI result presentation, and migration/compatibility with #44 history.

Rendered sources to reverify before design: RUE pp.288 and 355-359. Do not implement from remembered Palladium rules.

Depends on #44.
'@
$mdcIssueUrl = gh issue create --title "Full M.D.C. combat: tier interaction, armor ablation, and unprotected outcomes" --body $mdcBody --label "area:rules"
```

- [ ] **Step 5: Perform final verification immediately before publication**

Run:

```text
vp run @riftforge/rules#check
vp run @riftforge/rules#test
vp run @riftforge/backend#check
vp run @riftforge/backend#test
vp run @riftforge/web#check
vp run @riftforge/web#test
vp check
vp test
git diff --check
git status --short --branch
```

Expected: clean gates and only intentional committed history.

- [ ] **Step 6: Push and open a draft PR for Cubic review**

```text
git push -u origin feat/sdc-combat-exchange
```

Then construct a reviewed PowerShell body using the full-M.D.C. issue URL captured
in Step 4. If publication runs in a fresh shell, recover it first with:

```text
$mdcIssueUrl = gh issue list --state open --limit 100 --search "Full M.D.C. combat: tier interaction" --json url --jq '.[0].url'
```

```text
$prBody = @"
Closes #44

## Summary
- Add a persisted two-phase S.D.C. attack/defense exchange with server-owned dice.
- Derive legal melee/ranged defenses and route hits through body pools or artificial S.D.C. armor.
- Add the Ley Terminal command-rail UI with route-safe live Convex feeds.

## Rules boundary
- Natural A.R. is not implemented because rendered RUE p.339 says it does not apply in Rifts.
- M.D. weapons and nondepleted M.D.C. protection are refused before rolls or writes.
- Full M.D.C. resolution remains tracked at $mdcIssueUrl.

## Verification
- Affected rules, backend, and web package check/test gates pass.
- Root vp check, vp test, and git diff --check pass.
- Live two-dossier miss, defense, hit, M.D.C. refusal, and route-change ownership scenarios pass.

## Tracker
- Issue #44 is aligned to the delivered S.D.C. scope and rendered-page evidence.
"@
gh pr create --draft --title "feat: add persisted S.D.C. combat exchanges" --body $prBody
```

The body must contain no AI attribution. Review the rendered PR body immediately
with `gh pr view --json body,url`; if shell interpolation damaged it, correct it
before requesting review. Put the actual numeric test counts in the design outcome
and issue update; the PR verification section intentionally names the gates rather
than copying counts that can change during review hardening.

- [ ] **Step 7: Address Cubic findings honestly**

For every finding, reproduce/validate first. If real, add a regression test and fix the entire bug class; if invalid, reply with evidence. After each push, wait for the new Cubic review and rerun the affected gates. Leave the PR unmerged for the human maintainer.

---

## Final Success Checklist

- [ ] Attacker selects another ready character and a supported owned S.D.C. weapon.
- [ ] Server validates context and owns strike, defense, and damage dice.
- [ ] Immediate misses persist; potential hits pause for an explicit defender/GM choice.
- [ ] Only engine-authorized parry/dodge/automatic-dodge/none choices appear and validate.
- [ ] Melee and firearm thresholds/bonuses remain distinct; firearm math gets no P.P./general H2H leakage.
- [ ] Artificial S.D.C. armor equality, penetration, depletion, and no-spill behavior are pure-tested against printed values.
- [ ] Live unarmored hits atomically update body pools and immutable history exactly once.
- [ ] Relevant state drift finalizes stale with no damage; narrative/unrelated state does not.
- [ ] M.D. weapons and M.D.C.-protected targets fail before dice and persistence.
- [ ] No Natural A.R., rounds/actions enforcement, auth, geometry, or other excluded system was added.
- [ ] Route changes cannot leak drafts, feeds, telemetry, or late mutation results.
- [ ] Rules, backend, web, and root gates pass with current counts; live browser acceptance passes.
- [ ] README, approved design, issue #44, full-M.D.C. follow-up, and draft PR all reflect the same verified scope.
- [ ] The human maintainer, not the agent, retains merge authority.
