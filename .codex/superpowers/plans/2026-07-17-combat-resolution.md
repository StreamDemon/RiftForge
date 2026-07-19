# Combat Resolution and Structured Spell Damage Implementation Plan

> **Historical execution plan — completed and merged.** This plan was executed on
> `feat/combat-resolution`, reviewed in PR #49, and merged to `main` as `8f58a48`
> on 2026-07-18. Its unchecked boxes and branch, issue, milestone, and expected-output
> passages preserve the original execution instructions; they are not current work
> items. Final state: 260 rules tests and 309 workspace tests. Review hardening landed
> in `eb163f7`, `1a10731`, and `7d23370`; issues #16 and #20 are closed.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the page-stamped, deterministic rules-layer APIs for resolving strikes, preserving complete Hand-to-Hand combat bonuses, and deriving and rolling finite structured spell damage for issue #16.

**Architecture:** Keep the existing content → Zod schema → pure engine layering. Combat constants and spell mechanics are page-stamped content parsed at module load; strike and spell functions consume explicit completed rolls, caller choices, levels, and injected RNG without mutating character state. Existing display prose and existing combat fields remain compatible, while new structured data and named totals are additive.

**Tech Stack:** TypeScript, Zod, JSON content, Vite+ (`vp`), Vite+ Test, pnpm workspace.

## Global Constraints

- Work directly in `D:\Projects\riftforge` on branch `feat/combat-resolution`; do not create a worktree.
- Treat `.codex/superpowers/specs/2026-07-17-combat-resolution-design.md` as the approved contract. If a rule value conflicts with memory or secondary material, the rendered local RUE page wins.
- Preserve the printed spell `damage` strings; add `damageEffect` rather than parsing or replacing prose at runtime.
- Keep every engine function pure and deterministic. Completed d20 rolls, caster level, choices, and RNG are inputs; no function in this plan writes character, armor, or target state.
- Keep `DamageType` exactly `"sdc" | "md"`; direct Hit Point spell damage remains special-only.
- Keep `damageMultiplier` exactly `1 | 2`; conditional triple-damage moves, knockout/stun, death blow, and from-behind mechanics remain out of scope.
- Keep A.R., armor-first routing, M.D.C. pool mutation, hostile-target persistence, and combat UI in issue #44.
- Use `vp` commands, not plain Vite. In `packages/backend`, use `pnpm exec`, never `npx` (this plan does not need backend commands).
- Follow red → green → refactor for every production change. Observe each specified failure before adding the implementation that makes it pass.
- Run the package gates before root gates: `vp run @riftforge/rules#check`, `vp run @riftforge/rules#test`, `vp check`, then `vp test`.
- No browser verification is required because this slice deliberately changes no user-visible behavior.
- Do not close #16, #20, or milestone M3 from a local branch. Post evidence-backed progress; PR merge remains a human action.

---

## File Map

### New files

- `packages/rules/src/schema/damage.ts` — the shared `DamageType` schema and type used by weapons, strikes, and spells.
- `packages/rules/src/schema/strike-resolution.ts` — validation for page-stamped combat constants and defense kinds.
- `packages/rules/src/content/combat/strike-resolution.json` — the exact RUE p.346 constants.
- `packages/rules/src/engine/strike-resolution.ts` — load-validated constants plus the pure opposed-roll resolver.
- `packages/rules/tests/strike-resolution.test.ts` — constants, input-validation, ordering, critical, defense, and damage-type coverage.
- `packages/rules/tests/spell-damage.test.ts` — spell schema refinements, catalog correspondence, derivation, rolling, and classification coverage.

### Modified files

- `packages/rules/src/schema/items.ts` — consume the shared damage-type schema instead of a local enum.
- `packages/rules/src/schema/combat.ts` — add load-validated unconditional H2H critical thresholds.
- `packages/rules/src/content/combat/hand-to-hand.json` — structure the five printed unconditional critical ranges while retaining their notes.
- `packages/rules/src/engine/combat.ts` — preserve raw H2H bonuses and derive the approved named totals.
- `packages/rules/src/engine/character.ts` — copy the expanded combat profile onto `CharacterSheet.combat`.
- `packages/rules/tests/combat.test.ts` — assert raw bonus preservation and maneuver-specific totals.
- `packages/rules/tests/character.test.ts` — assert the complete level-1 sheet projection.
- `packages/rules/src/schema/spells.ts` — add the structured damage-effect schema and cross-field refinements.
- `packages/rules/src/content/spells/spells.json` — add structured effects to the 15 finite damage spells only.
- `packages/rules/src/engine/spells.ts` — derive and roll selected spell-damage applications.
- `packages/rules/src/index.ts` — export the new schemas, types, constants, and engine APIs.
- `.codex/superpowers/specs/2026-07-17-combat-resolution-design.md` — record the implementation outcome and final verification once all gates pass.

---

### Task 1: Shared Damage Type and Page-Stamped Combat Constants

**Files:**

- Create: `packages/rules/src/schema/damage.ts`
- Create: `packages/rules/src/schema/strike-resolution.ts`
- Create: `packages/rules/src/content/combat/strike-resolution.json`
- Create: `packages/rules/src/engine/strike-resolution.ts`
- Create: `packages/rules/tests/strike-resolution.test.ts`
- Modify: `packages/rules/src/schema/items.ts:1-27`
- Modify: `packages/rules/src/index.ts:1-20`

**Interfaces:**

- Consumes: `diceFormulaSchema` and the existing weapon schema.
- Produces: `damageTypeSchema`, `DamageType`, `defenseKindSchema`, `DefenseKind`, `combatResolutionRulesSchema`, `CombatResolutionRules`, and parsed `combatResolutionRules` with the exact p.346 values.

- [ ] **Step 1: Write the failing constants and shared-schema test**

Create `packages/rules/tests/strike-resolution.test.ts`:

```ts
import { describe, expect, test } from "vite-plus/test";
import { combatResolutionRules, damageTypeSchema, weaponDamageSchema } from "../src/index.ts";

describe("combat resolution constants (RUE p.346)", () => {
  test("loads the exact printed constants from page-stamped content", () => {
    expect(combatResolutionRules).toEqual({
      book: "Rifts Ultimate Edition",
      page: 346,
      meleeSeconds: 15,
      automaticMissAtOrBelow: 4,
      sdcPerMd: 100,
      naturalTwentyDamageMultiplier: 2,
    });
  });

  test("weapons and combat share the S.D.C./M.D. type vocabulary", () => {
    expect(damageTypeSchema.parse("sdc")).toBe("sdc");
    expect(damageTypeSchema.parse("md")).toBe("md");
    expect(() => damageTypeSchema.parse("hp")).toThrow();
    expect(weaponDamageSchema.parse({ formula: "2D6", type: "md" })).toEqual({
      formula: "2D6",
      type: "md",
    });
    expect(() => weaponDamageSchema.parse({ formula: "2D6", type: "hp" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the focused test and observe the missing-export failure**

Run: `vp test packages/rules/tests/strike-resolution.test.ts`

Expected: FAIL during module loading because `combatResolutionRules` and `damageTypeSchema` are not exported yet.

- [ ] **Step 3: Add the shared damage schema**

Create `packages/rules/src/schema/damage.ts`:

```ts
import { z } from "zod";

/** The two general damage systems modeled by weapons and finite spell damage. */
export const damageTypeSchema = z.enum(["sdc", "md"]);
export type DamageType = z.infer<typeof damageTypeSchema>;
```

Replace the local enum in `packages/rules/src/schema/items.ts` with the shared schema:

```ts
import { z } from "zod";
import { damageTypeSchema } from "./damage.ts";
import { diceFormulaSchema } from "./dice.ts";

// ...keep weaponCategorySchema unchanged...

export const weaponDamageSchema = z.object({
  formula: diceFormulaSchema,
  type: damageTypeSchema,
  note: z.string().optional(),
});
export type WeaponDamage = z.infer<typeof weaponDamageSchema>;
```

- [ ] **Step 4: Add the constants schema, content, and load boundary**

Create `packages/rules/src/schema/strike-resolution.ts`:

```ts
import { z } from "zod";

export const defenseKindSchema = z.enum(["parry", "dodge", "autoDodge"]);
export type DefenseKind = z.infer<typeof defenseKindSchema>;

export const combatResolutionRulesSchema = z.object({
  book: z.string().min(1),
  page: z.number().int().positive(),
  meleeSeconds: z.number().int().positive(),
  automaticMissAtOrBelow: z.number().int().min(1).max(20),
  sdcPerMd: z.number().int().positive(),
  naturalTwentyDamageMultiplier: z.literal(2),
});
export type CombatResolutionRules = z.infer<typeof combatResolutionRulesSchema>;
```

Create `packages/rules/src/content/combat/strike-resolution.json`:

```json
{
  "book": "Rifts Ultimate Edition",
  "page": 346,
  "meleeSeconds": 15,
  "automaticMissAtOrBelow": 4,
  "sdcPerMd": 100,
  "naturalTwentyDamageMultiplier": 2
}
```

Create the initial `packages/rules/src/engine/strike-resolution.ts`:

```ts
import strikeResolutionRaw from "../content/combat/strike-resolution.json" with { type: "json" };
import { combatResolutionRulesSchema } from "../schema/strike-resolution.ts";

/** Page-stamped strike constants, validated when the rules package loads. */
export const combatResolutionRules = combatResolutionRulesSchema.parse(strikeResolutionRaw);
```

- [ ] **Step 5: Export the new public surface**

Add these exports to `packages/rules/src/index.ts` beside the other schema and engine exports:

```ts
export * from "./schema/damage.ts";
export * from "./schema/strike-resolution.ts";
export * from "./engine/strike-resolution.ts";
```

- [ ] **Step 6: Run the focused and item regression tests**

Run: `vp test packages/rules/tests/strike-resolution.test.ts packages/rules/tests/items.test.ts`

Expected: PASS for both files; weapon catalog behavior is unchanged and the constants equal the printed p.346 values.

- [ ] **Step 7: Run the rules-package check**

Run: `vp run @riftforge/rules#check`

Expected: PASS with no format, lint, or type errors in `@riftforge/rules`.

- [ ] **Step 8: Commit the shared foundation**

```bash
git add packages/rules/src/schema/damage.ts packages/rules/src/schema/strike-resolution.ts packages/rules/src/content/combat/strike-resolution.json packages/rules/src/engine/strike-resolution.ts packages/rules/src/schema/items.ts packages/rules/src/index.ts packages/rules/tests/strike-resolution.test.ts
git commit -m "feat(rules): add combat resolution constants"
```

---

### Task 2: Deterministic Opposed Strike Resolver

**Files:**

- Modify: `packages/rules/tests/strike-resolution.test.ts`
- Modify: `packages/rules/src/engine/strike-resolution.ts`

**Interfaces:**

- Consumes: `D20Roll`, `DamageType`, `DefenseKind`, `damageTypeSchema`, `defenseKindSchema`, and `combatResolutionRules` from Task 1.
- Produces: `StrikeDefense`, `ResolveStrikeInput`, `StrikeOutcome`, `StrikeReason`, `StrikeResolution`, and `resolveStrike(input): StrikeResolution`.

- [ ] **Step 1: Add the failing resolver truth-table tests**

Replace the imports at the top of `packages/rules/tests/strike-resolution.test.ts` with:

```ts
import { describe, expect, test } from "vite-plus/test";
import {
  combatResolutionRules,
  damageTypeSchema,
  resolveStrike,
  weaponDamageSchema,
  type D20Roll,
} from "../src/index.ts";
```

Then append:

```ts
function d20(die: number, bonus = 0, overrides: Partial<D20Roll> = {}): D20Roll {
  return {
    die,
    bonus,
    total: die + bonus,
    naturalTwenty: die === 20,
    naturalOne: die === 1,
    ...overrides,
  };
}

describe("resolveStrike (RUE pp.345-346)", () => {
  test("rejects malformed completed rolls and critical thresholds", () => {
    const valid = {
      strike: d20(10, 2),
      allowedDefenses: ["parry"] as const,
      damageType: "sdc" as const,
    };
    expect(() => resolveStrike({ ...valid, strike: d20(0) })).toThrow(/die.*1.*20/i);
    expect(() => resolveStrike({ ...valid, strike: d20(21) })).toThrow(/die.*1.*20/i);
    expect(() => resolveStrike({ ...valid, strike: d20(10.5) })).toThrow(/die.*integer/i);
    expect(() => resolveStrike({ ...valid, strike: d20(10, Number.POSITIVE_INFINITY) })).toThrow(
      /bonus.*finite/i,
    );
    expect(() => resolveStrike({ ...valid, strike: d20(10, 2, { total: 99 }) })).toThrow(
      /total.*die.*bonus/i,
    );
    expect(() => resolveStrike({ ...valid, criticalOn: 1 })).toThrow(/criticalOn.*2.*20/i);
    expect(() => resolveStrike({ ...valid, criticalOn: 21 })).toThrow(/criticalOn.*2.*20/i);
    expect(() => resolveStrike({ ...valid, criticalOn: 18.5 })).toThrow(/criticalOn.*integer/i);
  });

  test("derives natural status from die and applies the post-bonus miss threshold", () => {
    expect(
      resolveStrike({
        strike: d20(1, 100, { naturalOne: false, naturalTwenty: true }),
        allowedDefenses: [],
        damageType: "sdc",
      }),
    ).toEqual({
      outcome: "miss",
      reason: "naturalOne",
      critical: false,
      damageMultiplier: 1,
      damageType: "sdc",
    });
    expect(
      resolveStrike({ strike: d20(2, 2), allowedDefenses: [], damageType: "sdc" }),
    ).toMatchObject({ outcome: "miss", reason: "belowMinimum" });
    expect(
      resolveStrike({ strike: d20(2, 3), allowedDefenses: [], damageType: "sdc" }),
    ).toMatchObject({ outcome: "hit", reason: "unopposed" });
  });

  test("resolves ordinary unopposed, equal-defense, and strike-won rolls", () => {
    expect(
      resolveStrike({ strike: d20(12, 3), allowedDefenses: ["parry"], damageType: "md" }),
    ).toEqual({
      outcome: "hit",
      reason: "unopposed",
      critical: false,
      damageMultiplier: 1,
      damageType: "md",
    });
    expect(
      resolveStrike({
        strike: d20(12, 3),
        defense: { kind: "parry", roll: d20(10, 5) },
        allowedDefenses: ["parry"],
        damageType: "sdc",
      }),
    ).toMatchObject({ outcome: "defended", reason: "parried", critical: false });
    expect(
      resolveStrike({
        strike: d20(12, 4),
        defense: { kind: "autoDodge", roll: d20(10, 5) },
        allowedDefenses: ["autoDodge"],
        damageType: "sdc",
      }),
    ).toMatchObject({ outcome: "hit", reason: "strikeWon" });
  });

  test("a natural-20 defense wins even against a natural-20 strike", () => {
    expect(
      resolveStrike({
        strike: d20(20, 10),
        defense: { kind: "dodge", roll: d20(20, -20) },
        allowedDefenses: ["dodge"],
        damageType: "md",
      }),
    ).toEqual({
      outcome: "defended",
      reason: "dodged",
      critical: false,
      damageMultiplier: 1,
      damageType: "md",
    });
  });

  test("a natural-20 defense beats a higher-total non-natural-20 strike", () => {
    expect(
      resolveStrike({
        strike: d20(19, 100),
        defense: { kind: "dodge", roll: d20(20, -20) },
        allowedDefenses: ["dodge"],
        damageType: "md",
        criticalOn: 18,
      }),
    ).toEqual({
      outcome: "defended",
      reason: "dodged",
      critical: false,
      damageMultiplier: 1,
      damageType: "md",
    });
  });

  test("a natural-20 strike beats every non-natural-20 defense", () => {
    expect(
      resolveStrike({
        strike: d20(20, -10, { naturalTwenty: false }),
        defense: { kind: "dodge", roll: d20(19, 100) },
        allowedDefenses: ["dodge"],
        damageType: "md",
      }),
    ).toEqual({
      outcome: "hit",
      reason: "strikeWon",
      critical: true,
      damageMultiplier: 2,
      damageType: "md",
    });
  });

  test("a lower trained critical remains defendable unless the die is 20", () => {
    expect(
      resolveStrike({
        strike: d20(18, 2),
        allowedDefenses: ["parry"],
        damageType: "sdc",
        criticalOn: 18,
      }),
    ).toMatchObject({ outcome: "hit", critical: true, damageMultiplier: 2 });
    expect(
      resolveStrike({
        strike: d20(18, 2),
        defense: { kind: "parry", roll: d20(17, 3) },
        allowedDefenses: ["parry"],
        damageType: "sdc",
        criticalOn: 18,
      }),
    ).toMatchObject({ outcome: "defended", critical: false, damageMultiplier: 1 });
    expect(
      resolveStrike({ strike: d20(19), allowedDefenses: [], damageType: "sdc" }),
    ).toMatchObject({ outcome: "hit", critical: false, damageMultiplier: 1 });
  });

  test("a defender natural 1 uses the ordinary total comparison", () => {
    expect(
      resolveStrike({
        strike: d20(10),
        defense: { kind: "dodge", roll: d20(1, 9) },
        allowedDefenses: ["dodge"],
        damageType: "sdc",
      }),
    ).toMatchObject({ outcome: "defended", reason: "dodged" });
  });

  test("rejects unsupported or invalid defense kinds", () => {
    expect(() =>
      resolveStrike({
        strike: d20(10, 5),
        defense: { kind: "parry", roll: d20(12) },
        allowedDefenses: ["dodge"],
        damageType: "sdc",
      }),
    ).toThrow(/parry.*not allowed/i);
    expect(() =>
      resolveStrike({
        strike: d20(10, 5),
        defense: { kind: "block" as never, roll: d20(12) },
        allowedDefenses: ["block" as never],
        damageType: "sdc",
      }),
    ).toThrow(/parry|dodge|autoDodge/i);
  });
});
```

- [ ] **Step 2: Run the focused test and observe the missing resolver failure**

Run: `vp test packages/rules/tests/strike-resolution.test.ts`

Expected: FAIL because `resolveStrike` is not exported.

- [ ] **Step 3: Implement the resolver and runtime input validation**

Replace `packages/rules/src/engine/strike-resolution.ts` with:

```ts
import strikeResolutionRaw from "../content/combat/strike-resolution.json" with { type: "json" };
import { damageTypeSchema, type DamageType } from "../schema/damage.ts";
import {
  combatResolutionRulesSchema,
  defenseKindSchema,
  type DefenseKind,
} from "../schema/strike-resolution.ts";
import type { D20Roll } from "./rolls.ts";

/** Page-stamped strike constants, validated when the rules package loads. */
export const combatResolutionRules = combatResolutionRulesSchema.parse(strikeResolutionRaw);

export interface StrikeDefense {
  kind: DefenseKind;
  roll: D20Roll;
}

export interface ResolveStrikeInput {
  strike: D20Roll;
  defense?: StrikeDefense;
  allowedDefenses: readonly DefenseKind[];
  damageType: DamageType;
  criticalOn?: number;
}

export type StrikeOutcome = "hit" | "miss" | "defended";
export type StrikeReason =
  | "naturalOne"
  | "belowMinimum"
  | "parried"
  | "dodged"
  | "unopposed"
  | "strikeWon";

export interface StrikeResolution {
  outcome: StrikeOutcome;
  reason: StrikeReason;
  critical: boolean;
  damageMultiplier: 1 | 2;
  damageType: DamageType;
}

function assertCompletedD20(label: string, roll: D20Roll): void {
  if (!Number.isInteger(roll.die)) {
    throw new Error(`${label} die must be an integer from 1 to 20, got ${roll.die}.`);
  }
  if (roll.die < 1 || roll.die > 20) {
    throw new Error(`${label} die must be from 1 to 20, got ${roll.die}.`);
  }
  if (!Number.isFinite(roll.bonus)) {
    throw new Error(`${label} bonus must be finite, got ${roll.bonus}.`);
  }
  if (!Number.isFinite(roll.total) || roll.total !== roll.die + roll.bonus) {
    throw new Error(
      `${label} total must equal die + bonus (${roll.die + roll.bonus}), got ${roll.total}.`,
    );
  }
}

function failed(
  outcome: "miss" | "defended",
  reason: StrikeReason,
  damageType: DamageType,
): StrikeResolution {
  return { outcome, reason, critical: false, damageMultiplier: 1, damageType };
}

function successful(
  reason: "unopposed" | "strikeWon",
  strikeDie: number,
  criticalOn: number,
  damageType: DamageType,
): StrikeResolution {
  const critical = strikeDie >= criticalOn;
  return {
    outcome: "hit",
    reason,
    critical,
    damageMultiplier: critical ? combatResolutionRules.naturalTwentyDamageMultiplier : 1,
    damageType,
  };
}

/** Resolve a completed strike against an optional caller-authorized defense. */
export function resolveStrike(input: ResolveStrikeInput): StrikeResolution {
  assertCompletedD20("Strike", input.strike);
  const damageType = damageTypeSchema.parse(input.damageType);
  const allowedDefenses = input.allowedDefenses.map((kind) => defenseKindSchema.parse(kind));
  const criticalOn = input.criticalOn ?? 20;
  if (!Number.isInteger(criticalOn)) {
    throw new Error(`criticalOn must be an integer from 2 to 20, got ${criticalOn}.`);
  }
  if (criticalOn < 2 || criticalOn > 20) {
    throw new Error(`criticalOn must be from 2 to 20, got ${criticalOn}.`);
  }

  let defense: StrikeDefense | undefined;
  if (input.defense !== undefined) {
    const kind = defenseKindSchema.parse(input.defense.kind);
    assertCompletedD20("Defense", input.defense.roll);
    if (!allowedDefenses.includes(kind)) {
      throw new Error(`${kind} is not allowed for this strike.`);
    }
    defense = { kind, roll: input.defense.roll };
  }

  const strikeNaturalOne = input.strike.die === 1;
  const strikeNaturalTwenty = input.strike.die === 20;
  if (strikeNaturalOne) return failed("miss", "naturalOne", damageType);
  if (input.strike.total <= combatResolutionRules.automaticMissAtOrBelow) {
    return failed("miss", "belowMinimum", damageType);
  }
  if (defense === undefined) {
    return successful("unopposed", input.strike.die, criticalOn, damageType);
  }

  const defendedReason = defense.kind === "parry" ? "parried" : "dodged";
  if (defense.roll.die === 20) return failed("defended", defendedReason, damageType);
  if (strikeNaturalTwenty) {
    return successful("strikeWon", input.strike.die, criticalOn, damageType);
  }
  if (defense.roll.total >= input.strike.total) {
    return failed("defended", defendedReason, damageType);
  }
  return successful("strikeWon", input.strike.die, criticalOn, damageType);
}
```

- [ ] **Step 4: Run the focused resolver tests**

Run: `vp test packages/rules/tests/strike-resolution.test.ts`

Expected: PASS. The natural-status test proves the resolver ignores contradictory `naturalOne`/`naturalTwenty` booleans and keys solely from `die`.

- [ ] **Step 5: Run rules-package check and tests**

Run: `vp run @riftforge/rules#check`

Expected: PASS.

Run: `vp run @riftforge/rules#test`

Expected: PASS with the previous 243-test baseline plus the new strike tests.

- [ ] **Step 6: Commit the resolver**

```bash
git add packages/rules/src/engine/strike-resolution.ts packages/rules/tests/strike-resolution.test.ts
git commit -m "feat(rules): resolve opposed strikes"
```

---

### Task 3: Complete Hand-to-Hand Combat Profile and Critical Thresholds

**Files:**

- Modify: `packages/rules/src/schema/combat.ts:27-39`
- Modify: `packages/rules/src/content/combat/hand-to-hand.json:35,69,114,164,257`
- Modify: `packages/rules/src/engine/combat.ts:108-120,140-184`
- Modify: `packages/rules/src/engine/character.ts:1-19,58-74,133-137,166-191,277-291`
- Modify: `packages/rules/tests/combat.test.ts:73-184,234-278`
- Modify: `packages/rules/tests/character.test.ts:30-38`

**Interfaces:**

- Consumes: existing `hthBonuses`, `deriveAttributeBonuses`, `CombatProfileInput`, and the five rendered H2H tables on printed pp.347-349.
- Produces: optional `criticalStrikeOn` on each H2H level; expanded `CombatProfile` fields `handToHandBonuses`, `initiative`, `autoDodge`, `strikeThrown`, `strikeGuns`, `saveVsHorrorFactor`, and `criticalStrikeOn`; `CharacterSheet.combat` as `Omit<CombatProfile, "saveBonuses">`.

- [ ] **Step 1: Add failing profile and sheet-projection tests**

Append these tests inside the existing `combatProfile integrates attributes + Hand to Hand` describe block in `packages/rules/tests/combat.test.ts`:

```ts
test("preserves the sparse raw H2H record and zeroes absent named totals", () => {
  const p = combatProfile({ attributes: { PP: 20, PS: 16 }, hthType: "basic", level: 1 });
  expect(p.handToHandBonuses).toEqual({ pullPunch: 2, rollWithImpact: 2 });
  expect(p).toMatchObject({
    strike: 3,
    strikeThrown: 3,
    strikeGuns: 0,
    initiative: 0,
    autoDodge: 0,
    saveVsHorrorFactor: 0,
    criticalStrikeOn: 20,
  });
});

test("Assassin thrown attacks combine P.P., general strike, and thrown only", () => {
  const p = combatProfile({ attributes: { PP: 20 }, hthType: "assassin", level: 15 });
  expect(p.handToHandBonuses).toMatchObject({
    strike: 6,
    strikeThrown: 2,
    strikeGuns: 3,
    initiative: 4,
  });
  expect(p.strike).toBe(9);
  expect(p.strikeThrown).toBe(11);
  expect(p.strikeGuns).toBe(3);
  expect(p.criticalStrikeOn).toBe(19);
});

test("Commando auto-dodge uses P.P. plus autoDodge, never ordinary dodge", () => {
  const p = combatProfile({ attributes: { PP: 20 }, hthType: "commando", level: 15 });
  expect(p.handToHandBonuses).toMatchObject({
    dodge: 4,
    autoDodge: 5,
    initiative: 6,
    saveVsHorrorFactor: 5,
  });
  expect(p.dodge).toBe(7);
  expect(p.autoDodge).toBe(8);
  expect(p.initiative).toBe(6);
  expect(p.saveVsHorrorFactor).toBe(5);
  expect(p.criticalStrikeOn).toBe(17);
});

test("unconditional critical ranges unlock at their printed levels", () => {
  expect(combatProfile({ attributes: {}, hthType: "basic", level: 5 }).criticalStrikeOn).toBe(20);
  expect(combatProfile({ attributes: {}, hthType: "basic", level: 6 }).criticalStrikeOn).toBe(19);
  expect(combatProfile({ attributes: {}, hthType: "expert", level: 5 }).criticalStrikeOn).toBe(20);
  expect(combatProfile({ attributes: {}, hthType: "expert", level: 6 }).criticalStrikeOn).toBe(18);
  expect(
    combatProfile({ attributes: {}, hthType: "martial-arts", level: 6 }).criticalStrikeOn,
  ).toBe(18);
  expect(combatProfile({ attributes: {}, hthType: "assassin", level: 10 }).criticalStrikeOn).toBe(
    19,
  );
  expect(combatProfile({ attributes: {}, hthType: "commando", level: 14 }).criticalStrikeOn).toBe(
    20,
  );
  expect(combatProfile({ attributes: {}, hthType: "commando", level: 15 }).criticalStrikeOn).toBe(
    17,
  );
});
```

Replace the level-1 combat expectation in `packages/rules/tests/character.test.ts` with:

```ts
expect(sheet.combat).toEqual({
  attacksPerMelee: 4,
  handToHandBonuses: { pullPunch: 2, rollWithImpact: 2 },
  strike: 3,
  parry: 3,
  dodge: 3,
  damageBonus: 1,
  initiative: 0,
  autoDodge: 0,
  strikeThrown: 3,
  strikeGuns: 0,
  saveVsHorrorFactor: 0,
  criticalStrikeOn: 20,
});
```

- [ ] **Step 2: Run both focused files and observe missing-field failures**

Run: `vp test packages/rules/tests/combat.test.ts packages/rules/tests/character.test.ts`

Expected: FAIL because `CombatProfile` and `CharacterSheet.combat` do not expose the new fields and the H2H rows do not yet contain structured critical thresholds.

- [ ] **Step 3: Extend and populate the H2H level schema**

Add this field to `handToHandLevelSchema` in `packages/rules/src/schema/combat.ts` before `note`:

```ts
  /** Lowest natural die for an unconditional critical range granted at this level. */
  criticalStrikeOn: z.number().int().min(2).max(20).optional(),
```

Add the field to the existing JSON rows without changing their `note` strings:

```json
{ "level": 6, "criticalStrikeOn": 19, "note": "Critical Strike on an unmodified roll of 19 or 20." }
```

```json
{
  "level": 6,
  "criticalStrikeOn": 18,
  "note": "Critical Strike on an unmodified roll of 18, 19 or 20."
}
```

For Martial Arts level 6, use its exact existing note:

```json
{
  "level": 6,
  "criticalStrikeOn": 18,
  "note": "Critical Strike on an unmodified roll of 18, 19 or 20."
}
```

Then add the Assassin and Commando values:

```json
{
  "level": 10,
  "criticalStrikeOn": 19,
  "note": "Critical Strike on an unmodified roll of 19 or 20."
}
```

```json
{ "level": 15, "criticalStrikeOn": 17, "note": "Critical Strike on a Natural 17-20." }
```

The five rows are Basic L6 = 19, Expert L6 = 18, Martial Arts L6 = 18, Assassin L10 = 19, and Commando L15 = 17. Do not structure the other lethal/positional notes.

- [ ] **Step 4: Expand `CombatProfile` with exact maneuver-specific math**

Replace the `CombatProfile` interface and return body in `packages/rules/src/engine/combat.ts` with the following fields and calculations; retain the existing `saveBonuses` object unchanged:

```ts
export interface CombatProfile {
  attacksPerMelee: number;
  handToHandBonuses: CombatBonuses;
  strike: number;
  parry: number;
  dodge: number;
  damageBonus: number;
  initiative: number;
  autoDodge: number;
  strikeThrown: number;
  strikeGuns: number;
  saveVsHorrorFactor: number;
  criticalStrikeOn: number;
  saveBonuses: {
    psionic: number;
    insanity: number;
    comaDeathPct: number;
    magic: number;
    poison: number;
  };
}

function hthCriticalStrikeOn(hthId: string, level: number): number {
  const t = requireHandToHand(hthId);
  let threshold = 20;
  for (const lv of t.levels) {
    if (lv.level <= level && lv.criticalStrikeOn !== undefined) {
      threshold = Math.min(threshold, lv.criticalStrikeOn);
    }
  }
  return threshold;
}

export function combatProfile(input: CombatProfileInput): CombatProfile {
  const attr = deriveAttributeBonuses(input.attributes);
  const hth = hthBonuses(input.hthType, input.level);
  const sum = (a: number | undefined, b: number | undefined): number => (a ?? 0) + (b ?? 0);
  const strike = sum(attr.strike, hth.strike);
  return {
    attacksPerMelee: attacksPerMelee(input.hthType, input.level),
    handToHandBonuses: hth,
    strike,
    parry: sum(attr.parry, hth.parry),
    dodge: sum(attr.dodge, hth.dodge),
    damageBonus: sum(attr.hthDamage, hth.damage),
    initiative: hth.initiative ?? 0,
    autoDodge: hth.autoDodge === undefined ? 0 : sum(attr.dodge, hth.autoDodge),
    strikeThrown: strike + (hth.strikeThrown ?? 0),
    strikeGuns: hth.strikeGuns ?? 0,
    saveVsHorrorFactor: hth.saveVsHorrorFactor ?? 0,
    criticalStrikeOn: hthCriticalStrikeOn(input.hthType, input.level),
    saveBonuses: {
      psionic: attr.saveVsPsionic ?? 0,
      insanity: attr.saveVsInsanity ?? 0,
      comaDeathPct: attr.saveVsComaDeath ?? 0,
      magic: attr.saveVsMagic ?? 0,
      poison: attr.saveVsPoison ?? 0,
    },
  };
}
```

- [ ] **Step 5: Copy the expanded profile onto the sheet without recomputing it**

Import `type CombatProfile` from `./combat.ts` in `packages/rules/src/engine/character.ts`, then change the `combat` property to:

```ts
combat: Omit<CombatProfile, "saveBonuses">;
```

Immediately after constructing `combat`, split the profile once:

```ts
const { saveBonuses, ...sheetCombat } = combat;
```

Change save construction to read `saveBonuses` instead of `combat.saveBonuses`:

```ts
bonus: saveBonuses.magic + occSaveBonus(occ, "magic", level);
bonus: saveBonuses.psionic;
bonus: saveBonuses.insanity;
bonus: saveBonuses.poison;
bonus: saveBonuses.comaDeathPct;
```

Replace the manually projected return object with:

```ts
    combat: sheetCombat,
```

- [ ] **Step 6: Run the combat and character tests**

Run: `vp test packages/rules/tests/combat.test.ts packages/rules/tests/character.test.ts`

Expected: PASS. The Assassin test pins p.326/p.347 thrown math, the Commando test pins p.344 auto-dodge math, and the sheet test proves issue #20's raw keys reach the public sheet.

- [ ] **Step 7: Run rules-package check and tests**

Run: `vp run @riftforge/rules#check`

Expected: PASS.

Run: `vp run @riftforge/rules#test`

Expected: PASS.

- [ ] **Step 8: Commit the profile expansion**

```bash
git add packages/rules/src/schema/combat.ts packages/rules/src/content/combat/hand-to-hand.json packages/rules/src/engine/combat.ts packages/rules/src/engine/character.ts packages/rules/tests/combat.test.ts packages/rules/tests/character.test.ts
git commit -m "feat(rules): surface complete combat bonuses"
```

---

### Task 4: Structured Spell-Damage Schema and Contradiction Rejection

**Files:**

- Modify: `packages/rules/src/schema/spells.ts:1-81`
- Create: `packages/rules/tests/spell-damage.test.ts`

**Interfaces:**

- Consumes: `damageTypeSchema`, `diceFormulaSchema`, and `parseDice`.
- Produces: `SpellDamageSelection`, `SpellDamageEnvironment`, `SpellDamageScaling`, `AdjustableDiceCount`, `SpellDamageOptionalBonus`, `SpellDamageVariant`, `SpellDamageEffect`, `spellDamageEffectSchema`, and optional `damageEffect` on `Spell`.

**Final-review load-time invariants:** For adjustable, unmodified same-sided
dice, the base count must satisfy `(baseDiceCount - minimum) % step === 0`, and
each scaling application must satisfy `scalingDiceCount % step === 0` so every
derived maximum stays on-grid. At the spell boundary, `damageEffect` requires
the authoritative printed `damage` prose; prose-only damage remains legal for
special-only spells.

**Focused regression coverage:** Add failing schema tests for an off-grid base,
off-grid scaling, and structured damage without prose before adding the
refinements. The focused GREEN run must prove all three are rejected without
changing runtime derivation behavior or valid catalog content.

- [ ] **Step 1: Write exhaustive failing schema-refinement tests**

Create `packages/rules/tests/spell-damage.test.ts`:

```ts
import { describe, expect, test } from "vite-plus/test";
import { spellDamageEffectSchema } from "../src/index.ts";

const fixed = { id: "default", type: "md", base: "2D6" } as const;

describe("spellDamageEffectSchema", () => {
  test("accepts fixed, scaling, choice, environment, and adjustable effects", () => {
    expect(
      spellDamageEffectSchema.safeParse({ selection: "single", variants: [fixed] }).success,
    ).toBe(true);
    expect(
      spellDamageEffectSchema.safeParse({
        selection: "single",
        variants: [
          {
            id: "default",
            type: "md",
            base: "2D6",
            scaling: { formula: "1D6", startsAtLevel: 3, everyLevels: 2 },
            adjustableDiceCount: { minimum: 1, step: 1 },
            optionalBonuses: [{ id: "doublePpe", label: "Double P.P.E.", amount: 20 }],
          },
        ],
      }).success,
    ).toBe(true);
  });

  test.each([
    ["empty effect", { selection: "single", variants: [] }],
    ["duplicate variant ids", { selection: "casterChoice", variants: [fixed, fixed] }],
    ["variant without damage", { selection: "single", variants: [{ id: "default", type: "md" }] }],
    [
      "non-positive scaling start",
      {
        selection: "single",
        variants: [
          {
            id: "default",
            type: "md",
            scaling: { formula: "1D6", startsAtLevel: 0, everyLevels: 1 },
          },
        ],
      },
    ],
    [
      "non-positive scaling interval",
      {
        selection: "single",
        variants: [
          {
            id: "default",
            type: "md",
            scaling: { formula: "1D6", startsAtLevel: 1, everyLevels: 0 },
          },
        ],
      },
    ],
    [
      "environment field on single",
      { selection: "single", variants: [{ ...fixed, environment: "normal" }] },
    ],
    [
      "single with two variants",
      { selection: "single", variants: [fixed, { ...fixed, id: "two" }] },
    ],
    ["choice with one variant", { selection: "casterChoice", variants: [fixed] }],
    [
      "duplicate environments",
      {
        selection: "environment",
        variants: [
          { ...fixed, id: "normal-a", environment: "normal" },
          { ...fixed, id: "normal-b", environment: "normal" },
          { ...fixed, id: "nexus", environment: "nexus" },
        ],
      },
    ],
    [
      "incomplete environments",
      {
        selection: "environment",
        variants: [
          { ...fixed, id: "normal", environment: "normal" },
          { ...fixed, id: "line", environment: "leyLine" },
        ],
      },
    ],
    [
      "duplicate optional bonuses",
      {
        selection: "single",
        variants: [
          {
            ...fixed,
            optionalBonuses: [
              { id: "boost", label: "Boost", amount: 10 },
              { id: "boost", label: "Boost again", amount: 20 },
            ],
          },
        ],
      },
    ],
    [
      "non-positive optional bonus",
      {
        selection: "single",
        variants: [{ ...fixed, optionalBonuses: [{ id: "boost", label: "Boost", amount: 0 }] }],
      },
    ],
    [
      "adjustable constant",
      {
        selection: "single",
        variants: [
          { id: "default", type: "md", base: "20", adjustableDiceCount: { minimum: 1, step: 1 } },
        ],
      },
    ],
    [
      "adjustable multiplied dice",
      {
        selection: "single",
        variants: [
          {
            id: "default",
            type: "md",
            base: "1D6*10",
            adjustableDiceCount: { minimum: 1, step: 1 },
          },
        ],
      },
    ],
    [
      "adjustable mismatched sides",
      {
        selection: "single",
        variants: [
          {
            id: "default",
            type: "md",
            base: "2D6",
            scaling: { formula: "1D4", startsAtLevel: 3, everyLevels: 2 },
            adjustableDiceCount: { minimum: 1, step: 1 },
          },
        ],
      },
    ],
  ])("rejects %s", (_label, effect) => {
    expect(spellDamageEffectSchema.safeParse(effect).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the schema test and observe the missing-export failure**

Run: `vp test packages/rules/tests/spell-damage.test.ts`

Expected: FAIL because `spellDamageEffectSchema` is not exported.

- [ ] **Step 3: Implement the damage-effect schemas and refinements**

Add these imports to `packages/rules/src/schema/spells.ts`:

```ts
import { parseDice, type DiceFormula } from "../engine/dice.ts";
import { damageTypeSchema } from "./damage.ts";
```

Insert this schema block before `spellSchema`:

```ts
export const spellDamageSelectionSchema = z.enum(["single", "casterChoice", "environment"]);
export type SpellDamageSelection = z.infer<typeof spellDamageSelectionSchema>;

export const spellDamageEnvironmentSchema = z.enum(["normal", "leyLine", "nexus"]);
export type SpellDamageEnvironment = z.infer<typeof spellDamageEnvironmentSchema>;

export const spellDamageScalingSchema = z.object({
  formula: diceFormulaSchema,
  startsAtLevel: z.number().int().positive(),
  everyLevels: z.number().int().positive(),
});
export type SpellDamageScaling = z.infer<typeof spellDamageScalingSchema>;

export const adjustableDiceCountSchema = z.object({
  minimum: z.number().int().positive(),
  step: z.number().int().positive(),
});
export type AdjustableDiceCount = z.infer<typeof adjustableDiceCountSchema>;

export const spellDamageOptionalBonusSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  amount: z.number().int().positive(),
});
export type SpellDamageOptionalBonus = z.infer<typeof spellDamageOptionalBonusSchema>;

export const spellDamageVariantSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    type: damageTypeSchema,
    base: diceFormulaSchema.optional(),
    scaling: spellDamageScalingSchema.optional(),
    environment: spellDamageEnvironmentSchema.optional(),
    adjustableDiceCount: adjustableDiceCountSchema.optional(),
    optionalBonuses: z.array(spellDamageOptionalBonusSchema).optional(),
    note: z.string().min(1).optional(),
  })
  .superRefine((variant, ctx) => {
    if (variant.base === undefined && variant.scaling === undefined) {
      ctx.addIssue({ code: "custom", message: "A damage variant needs base or scaling damage." });
    }
    const bonusIds = variant.optionalBonuses?.map((bonus) => bonus.id) ?? [];
    if (new Set(bonusIds).size !== bonusIds.length) {
      ctx.addIssue({ code: "custom", message: "Optional damage bonus ids must be unique." });
    }
    if (variant.adjustableDiceCount !== undefined) {
      if (variant.base === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "Adjustable damage requires a base dice formula.",
        });
        return;
      }
      const formulas = [variant.base, variant.scaling?.formula].filter(
        (formula): formula is string => formula !== undefined,
      );
      let parsed: DiceFormula[];
      try {
        parsed = formulas.map(parseDice);
      } catch {
        // `diceFormulaSchema` reports the malformed formula on its own path.
        return;
      }
      const [first] = parsed;
      const safelyReducible =
        first !== undefined &&
        parsed.every(
          (formula) =>
            formula.count > 0 &&
            formula.sides === first.sides &&
            formula.multiplier === 1 &&
            formula.modifier === 0,
        );
      if (!safelyReducible) {
        ctx.addIssue({
          code: "custom",
          message: "Adjustable damage requires unmodified dice with matching sides.",
        });
      } else if (variant.adjustableDiceCount.minimum > first.count) {
        ctx.addIssue({
          code: "custom",
          message: "Adjustable minimum cannot exceed the base dice count.",
        });
      }
    }
  });
export type SpellDamageVariant = z.infer<typeof spellDamageVariantSchema>;

export const spellDamageEffectSchema = z
  .object({
    selection: spellDamageSelectionSchema,
    variants: z.array(spellDamageVariantSchema).min(1),
  })
  .superRefine((effect, ctx) => {
    const ids = effect.variants.map((variant) => variant.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "Damage variant ids must be unique." });
    }
    if (effect.selection === "single" && effect.variants.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "A single damage effect needs exactly one variant.",
      });
    }
    if (effect.selection === "casterChoice" && effect.variants.length < 2) {
      ctx.addIssue({
        code: "custom",
        message: "Caster-choice damage needs at least two variants.",
      });
    }
    if (effect.selection !== "environment") {
      if (effect.variants.some((variant) => variant.environment !== undefined)) {
        ctx.addIssue({
          code: "custom",
          message: "Only environment-selected damage may declare environments.",
        });
      }
      return;
    }
    const environments = effect.variants.map((variant) => variant.environment);
    if (environments.some((environment) => environment === undefined)) {
      ctx.addIssue({ code: "custom", message: "Every environment variant needs an environment." });
      return;
    }
    if (new Set(environments).size !== environments.length) {
      ctx.addIssue({ code: "custom", message: "Damage environments must be unique." });
    }
    const required = new Set<SpellDamageEnvironment>(["normal", "leyLine", "nexus"]);
    if (
      environments.length !== required.size ||
      environments.some((value) => !required.has(value!))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Environment damage needs exactly normal, leyLine, and nexus variants.",
      });
    }
  });
export type SpellDamageEffect = z.infer<typeof spellDamageEffectSchema>;
```

Add the optional field beside the existing printed `damage` string in `spellSchema`:

```ts
  /** Finite, rollable damage structure; printed `damage` remains display authority. */
  damageEffect: spellDamageEffectSchema.optional(),
```

- [ ] **Step 4: Run the schema-refinement tests**

Run: `vp test packages/rules/tests/spell-damage.test.ts`

Expected: PASS for every valid and contradictory schema shape.

- [ ] **Step 5: Run the rules-package check**

Run: `vp run @riftforge/rules#check`

Expected: PASS.

- [ ] **Step 6: Commit the spell-damage contract**

```bash
git add packages/rules/src/schema/spells.ts packages/rules/tests/spell-damage.test.ts
git commit -m "feat(rules): define structured spell damage"
```

---

### Task 5: Page-Faithful Spell Damage Content and Prose Correspondence

**Files:**

- Modify: `packages/rules/tests/spell-damage.test.ts`
- Modify: `packages/rules/src/content/spells/spells.json`

**Interfaces:**

- Consumes: `spellBook`, `getSpell`, and `SpellDamageEffect` from Task 4; the approved rendered-page transcriptions listed in the design spec.
- Produces: exact `damageEffect` content for 15 finite per-application damage spells; explicit seven-ID special-only classification; a reusable prose/structure correspondence assertion also applied to all five healing entries.

**Final-review catalog guard:** In addition to the structured/special-only
disjointness and union checks, assert that catalog IDs carrying `damageEffect`
exactly equal the IDs in `structuredDamageRows`. This prevents structured-only
entries from bypassing the prose/structure correspondence table.

- [ ] **Step 1: Add the failing catalog correspondence and classification tests**

Replace the imports at the top of `packages/rules/tests/spell-damage.test.ts` with:

```ts
import { describe, expect, test } from "vite-plus/test";
import {
  getSpell,
  spellBook,
  spellDamageEffectSchema,
  type Spell,
  type SpellDamageEffect,
  type SpellHealing,
} from "../src/index.ts";
```

Then append:

```ts
function expectCorrespondence<T>(
  rows: readonly { id: string; prose: string; structured: T }[],
  proseOf: (spell: Spell) => string | undefined,
  structuredOf: (spell: Spell) => T | undefined,
): void {
  for (const row of rows) {
    const spell = getSpell(row.id);
    expect(spell, row.id).toBeDefined();
    expect(proseOf(spell!), `${row.id} prose`).toBe(row.prose);
    expect(structuredOf(spell!), `${row.id} structure`).toEqual(row.structured);
  }
}

const structuredDamageRows: readonly {
  id: string;
  prose: string;
  structured: SpellDamageEffect;
}[] = [
  {
    id: "energy-bolt",
    prose: "4D6 S.D.C. (6D6 on a ley line, 8D6 at a nexus)",
    structured: {
      selection: "environment",
      variants: [
        { id: "normal", label: "Normal", type: "sdc", base: "4D6", environment: "normal" },
        { id: "leyLine", label: "Ley Line", type: "sdc", base: "6D6", environment: "leyLine" },
        { id: "nexus", label: "Nexus", type: "sdc", base: "8D6", environment: "nexus" },
      ],
    },
  },
  {
    id: "ignite-fire",
    prose: "2D6 S.D.C. per melee (clothes/hair, after first 2 melees)",
    structured: {
      selection: "single",
      variants: [
        { id: "default", type: "sdc", base: "2D6", note: "Per melee after the first two melees." },
      ],
    },
  },
  {
    id: "electric-arc",
    prose: "2D6 M.D.",
    structured: { selection: "single", variants: [{ id: "default", type: "md", base: "2D6" }] },
  },
  {
    id: "fire-bolt",
    prose: "4D6 M.D. or 1D6x10 S.D.C. (caster's choice)",
    structured: {
      selection: "casterChoice",
      variants: [
        { id: "megaDamage", label: "Mega-Damage", type: "md", base: "4D6" },
        { id: "structuralDamage", label: "S.D.C.", type: "sdc", base: "1D6*10" },
      ],
    },
  },
  {
    id: "circle-of-flame",
    prose: "6D6 S.D.C. to anybody passing through",
    structured: {
      selection: "single",
      variants: [
        { id: "default", type: "sdc", base: "6D6", note: "One passage through the circle." },
      ],
    },
  },
  {
    id: "call-lightning",
    prose: "1D6 M.D. per level of the spell caster",
    structured: {
      selection: "single",
      variants: [
        {
          id: "default",
          type: "md",
          scaling: { formula: "1D6", startsAtLevel: 1, everyLevels: 1 },
        },
      ],
    },
  },
  {
    id: "fire-ball",
    prose: "1D4 M.D. per level of the spell caster",
    structured: {
      selection: "single",
      variants: [
        {
          id: "default",
          type: "md",
          scaling: { formula: "1D4", startsAtLevel: 1, everyLevels: 1 },
        },
      ],
    },
  },
  {
    id: "ballistic-fire",
    prose: "1D6 M.D. per fiery missile",
    structured: {
      selection: "single",
      variants: [{ id: "default", type: "md", base: "1D6", note: "One fiery missile." }],
    },
  },
  {
    id: "lightblade",
    prose: "1D4x10 +1 M.D. point per level of experience",
    structured: {
      selection: "single",
      variants: [
        {
          id: "default",
          type: "md",
          base: "1D4*10",
          scaling: { formula: "1", startsAtLevel: 1, everyLevels: 1 },
        },
      ],
    },
  },
  {
    id: "ley-line-tendril-bolts",
    prose: "2D6 M.D. at level one, +1D6 M.D. per two additional levels",
    structured: {
      selection: "single",
      variants: [
        {
          id: "default",
          type: "md",
          base: "2D6",
          scaling: { formula: "1D6", startsAtLevel: 3, everyLevels: 2 },
          adjustableDiceCount: { minimum: 1, step: 1 },
          optionalBonuses: [{ id: "doublePpe", label: "Double P.P.E.", amount: 20 }],
          note: "One bolt; the caster may regulate damage in 1D6 increments.",
        },
      ],
    },
  },
  {
    id: "lightning-arc",
    prose: "4D6 +2 M.D. per level of experience",
    structured: {
      selection: "single",
      variants: [
        {
          id: "default",
          type: "md",
          base: "4D6",
          scaling: { formula: "2", startsAtLevel: 1, everyLevels: 1 },
        },
      ],
    },
  },
  {
    id: "shockwave",
    prose: "1D4 M.D. per level plus knockdown",
    structured: {
      selection: "single",
      variants: [
        {
          id: "default",
          type: "md",
          scaling: { formula: "1D4", startsAtLevel: 1, everyLevels: 1 },
          note: "Damage only; knockdown remains in printed prose.",
        },
      ],
    },
  },
  {
    id: "dragon-fire",
    prose: "1D4x10 M.D.",
    structured: { selection: "single", variants: [{ id: "default", type: "md", base: "1D4*10" }] },
  },
  {
    id: "meteor",
    prose: "1D6x10 M.D. to a 40 ft (12.2 m) radius, +2 M.D. per level of the spell caster",
    structured: {
      selection: "single",
      variants: [
        {
          id: "default",
          type: "md",
          base: "1D6*10",
          scaling: { formula: "2", startsAtLevel: 1, everyLevels: 1 },
          note: "One target in the 40 ft (12.2 m) radius.",
        },
      ],
    },
  },
  {
    id: "firequake",
    prose: "Varies; jets of flame do 5D6 M.D. on a failed dodge",
    structured: {
      selection: "single",
      variants: [
        { id: "flameJet", label: "Flame jet", type: "md", base: "5D6", note: "On a failed dodge." },
      ],
    },
  },
];

const specialOnlyDamageIds = [
  "fist-of-fury",
  "house-of-glass",
  "lifeblast",
  "agony",
  "life-drain",
  "desiccate-the-supernatural",
  "deathword",
] as const;

const healingRows: readonly { id: string; prose: string; structured: SpellHealing }[] = [
  {
    id: "light-healing",
    prose:
      "Channels healing energy by touch: restores 1D6 S.D.C. or 1D4 Hit Points (not both). Cannot be used on oneself.",
    structured: {
      hitPoints: "1D4",
      sdc: "1D6",
      target: "touch",
      exclusive: true,
      othersOnly: true,
    },
  },
  {
    id: "heal-wounds",
    prose:
      "Instantly heals minor physical wounds (cuts, gashes, bullet wounds, burns): restores 3D6 S.D.C. and 1D6 Hit Points.",
    structured: { hitPoints: "1D6", sdc: "3D6", target: "touch" },
  },
  {
    id: "heal-self",
    prose:
      "A minute of meditative chant washes the mage with mystic energy: restores 3D6 S.D.C. and 1D6 Hit Points, healing cuts, bruises, and broken bones.",
    structured: { hitPoints: "1D6", sdc: "3D6", target: "self" },
  },
  {
    id: "greater-healing",
    prose:
      "Instantly heals external and internal injuries: restores up to 2D4x10 S.D.C. and 6D6 Hit Points; never above the target's original maximums.",
    structured: { hitPoints: "6D6", sdc: "2D4*10", target: "touch", othersOnly: true },
  },
  {
    id: "restoration",
    prose:
      "Instantly and completely heals all wounds — full S.D.C. and Hit Points, mended bones, even severed limbs restored (within 48 hours).",
    structured: { full: true, target: "touch" },
  },
];

describe("spell content prose/structure correspondence", () => {
  test("pins every finite damage expression beside its exact display prose", () => {
    expectCorrespondence(
      structuredDamageRows,
      (spell) => spell.damage,
      (spell) => spell.damageEffect,
    );
  });

  test("pins every healing structure beside its exact display description", () => {
    expectCorrespondence(
      healingRows,
      (spell) => spell.description,
      (spell) => spell.healing,
    );
  });

  test("classifies every current spell with damage prose exactly once", () => {
    const structuredIds = structuredDamageRows.map((row) => row.id);
    expect(structuredIds.filter((id) => specialOnlyDamageIds.includes(id as never))).toEqual([]);
    expect([...structuredIds, ...specialOnlyDamageIds].sort()).toEqual(
      spellBook.spells
        .filter((spell) => spell.damage !== undefined)
        .map((spell) => spell.id)
        .sort(),
    );
    for (const id of specialOnlyDamageIds) expect(getSpell(id)?.damageEffect, id).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the content tests and observe missing `damageEffect` failures**

Run: `vp test packages/rules/tests/spell-damage.test.ts`

Expected: FAIL on the first structured spell because its `damageEffect` is `undefined`.

- [ ] **Step 3: Add the 15 exact `damageEffect` objects to spell content**

In `packages/rules/src/content/spells/spells.json`, insert the value from this exact ID-to-effect payload as `damageEffect` immediately after the corresponding spell's existing `damage` property:

```json
{
  "energy-bolt": {
    "selection": "environment",
    "variants": [
      { "id": "normal", "label": "Normal", "type": "sdc", "base": "4D6", "environment": "normal" },
      {
        "id": "leyLine",
        "label": "Ley Line",
        "type": "sdc",
        "base": "6D6",
        "environment": "leyLine"
      },
      { "id": "nexus", "label": "Nexus", "type": "sdc", "base": "8D6", "environment": "nexus" }
    ]
  },
  "ignite-fire": {
    "selection": "single",
    "variants": [
      {
        "id": "default",
        "type": "sdc",
        "base": "2D6",
        "note": "Per melee after the first two melees."
      }
    ]
  },
  "electric-arc": {
    "selection": "single",
    "variants": [{ "id": "default", "type": "md", "base": "2D6" }]
  },
  "fire-bolt": {
    "selection": "casterChoice",
    "variants": [
      { "id": "megaDamage", "label": "Mega-Damage", "type": "md", "base": "4D6" },
      { "id": "structuralDamage", "label": "S.D.C.", "type": "sdc", "base": "1D6*10" }
    ]
  },
  "circle-of-flame": {
    "selection": "single",
    "variants": [
      { "id": "default", "type": "sdc", "base": "6D6", "note": "One passage through the circle." }
    ]
  },
  "call-lightning": {
    "selection": "single",
    "variants": [
      {
        "id": "default",
        "type": "md",
        "scaling": { "formula": "1D6", "startsAtLevel": 1, "everyLevels": 1 }
      }
    ]
  },
  "fire-ball": {
    "selection": "single",
    "variants": [
      {
        "id": "default",
        "type": "md",
        "scaling": { "formula": "1D4", "startsAtLevel": 1, "everyLevels": 1 }
      }
    ]
  },
  "ballistic-fire": {
    "selection": "single",
    "variants": [{ "id": "default", "type": "md", "base": "1D6", "note": "One fiery missile." }]
  },
  "lightblade": {
    "selection": "single",
    "variants": [
      {
        "id": "default",
        "type": "md",
        "base": "1D4*10",
        "scaling": { "formula": "1", "startsAtLevel": 1, "everyLevels": 1 }
      }
    ]
  },
  "ley-line-tendril-bolts": {
    "selection": "single",
    "variants": [
      {
        "id": "default",
        "type": "md",
        "base": "2D6",
        "scaling": { "formula": "1D6", "startsAtLevel": 3, "everyLevels": 2 },
        "adjustableDiceCount": { "minimum": 1, "step": 1 },
        "optionalBonuses": [{ "id": "doublePpe", "label": "Double P.P.E.", "amount": 20 }],
        "note": "One bolt; the caster may regulate damage in 1D6 increments."
      }
    ]
  },
  "lightning-arc": {
    "selection": "single",
    "variants": [
      {
        "id": "default",
        "type": "md",
        "base": "4D6",
        "scaling": { "formula": "2", "startsAtLevel": 1, "everyLevels": 1 }
      }
    ]
  },
  "shockwave": {
    "selection": "single",
    "variants": [
      {
        "id": "default",
        "type": "md",
        "scaling": { "formula": "1D4", "startsAtLevel": 1, "everyLevels": 1 },
        "note": "Damage only; knockdown remains in printed prose."
      }
    ]
  },
  "dragon-fire": {
    "selection": "single",
    "variants": [{ "id": "default", "type": "md", "base": "1D4*10" }]
  },
  "meteor": {
    "selection": "single",
    "variants": [
      {
        "id": "default",
        "type": "md",
        "base": "1D6*10",
        "scaling": { "formula": "2", "startsAtLevel": 1, "everyLevels": 1 },
        "note": "One target in the 40 ft (12.2 m) radius."
      }
    ]
  },
  "firequake": {
    "selection": "single",
    "variants": [
      {
        "id": "flameJet",
        "label": "Flame jet",
        "type": "md",
        "base": "5D6",
        "note": "On a failed dodge."
      }
    ]
  }
}
```

This mapping is an editing aid, not a new committed top-level object. Do not change the existing `damage`, `description`, `ppeNote`, `page`, range, duration, or save fields. Do not add `damageEffect` to any `specialOnlyDamageIds` entry.

- [ ] **Step 4: Run the correspondence and classification tests**

Run: `vp test packages/rules/tests/spell-damage.test.ts`

Expected: PASS. The classification union exactly equals every catalog spell with a `damage` string, and all five healing descriptions remain paired with their existing structured objects.

- [ ] **Step 5: Run the spell regression file and package check**

Run: `vp test packages/rules/tests/spells.test.ts packages/rules/tests/spell-damage.test.ts`

Expected: PASS.

Run: `vp run @riftforge/rules#check`

Expected: PASS.

- [ ] **Step 6: Commit the structured content**

```bash
git add packages/rules/src/content/spells/spells.json packages/rules/tests/spell-damage.test.ts
git commit -m "feat(rules): transcribe structured spell damage"
```

---

### Task 6: Pure Spell-Damage Derivation

**Files:**

- Modify: `packages/rules/tests/spell-damage.test.ts`
- Modify: `packages/rules/src/engine/spells.ts:1-7,28-34,46-85`

**Interfaces:**

- Consumes: `Spell`, `SpellDamageEnvironment`, `SpellDamageOptionalBonus`, `SpellDamageVariant`, `DamageType`, `DiceFormula`, `parseDice`, and the content from Task 5.
- Produces: `DeriveSpellDamageOptions`, `DerivedSpellDamageComponent`, `DerivedSpellDamage`, and `deriveSpellDamage(spell, options): DerivedSpellDamage | undefined`.

- [ ] **Step 1: Add failing derivation tests for every selection and scaling shape**

Replace the imports at the top of `packages/rules/tests/spell-damage.test.ts` with:

```ts
import { describe, expect, test } from "vite-plus/test";
import {
  deriveSpellDamage,
  getSpell,
  spellBook,
  spellDamageEffectSchema,
  spellSchema,
  type Spell,
  type SpellDamageEffect,
  type SpellHealing,
} from "../src/index.ts";
```

Then append:

```ts
function requireSpell(id: string): Spell {
  const spell = getSpell(id);
  if (!spell) throw new Error(`Missing test spell ${id}.`);
  return spell;
}

describe("deriveSpellDamage", () => {
  test("returns undefined for a spell without finite structured damage", () => {
    expect(
      deriveSpellDamage(requireSpell("globe-of-daylight"), { casterLevel: 1 }),
    ).toBeUndefined();
  });

  test("requires and resolves environment context", () => {
    const spell = requireSpell("energy-bolt");
    expect(() => deriveSpellDamage(spell, { casterLevel: 1 })).toThrow(/environment/i);
    expect(() =>
      deriveSpellDamage(spell, { casterLevel: 1, environment: "rift" as never }),
    ).toThrow(/environment/i);
    expect(deriveSpellDamage(spell, { casterLevel: 1, environment: "normal" })).toMatchObject({
      variantId: "normal",
      type: "sdc",
      displayFormula: "4D6",
      bonus: 0,
    });
    expect(deriveSpellDamage(spell, { casterLevel: 1, environment: "leyLine" })).toMatchObject({
      variantId: "leyLine",
      displayFormula: "6D6",
    });
    expect(deriveSpellDamage(spell, { casterLevel: 1, environment: "nexus" })).toMatchObject({
      variantId: "nexus",
      displayFormula: "8D6",
    });
    expect(() =>
      deriveSpellDamage(spell, { casterLevel: 1, environment: "normal", variantId: "normal" }),
    ).toThrow(/variantId.*environment/i);
  });

  test("requires and resolves a caster choice", () => {
    const spell = requireSpell("fire-bolt");
    expect(() => deriveSpellDamage(spell, { casterLevel: 1 })).toThrow(/variantId/i);
    expect(() => deriveSpellDamage(spell, { casterLevel: 1, variantId: "cold" })).toThrow(
      /unknown.*variant/i,
    );
    expect(deriveSpellDamage(spell, { casterLevel: 1, variantId: "megaDamage" })).toMatchObject({
      variantId: "megaDamage",
      type: "md",
      displayFormula: "4D6",
    });
    expect(
      deriveSpellDamage(spell, { casterLevel: 1, variantId: "structuralDamage" }),
    ).toMatchObject({ variantId: "structuralDamage", type: "sdc", displayFormula: "1D6*10" });
  });

  test("expands per-level and delayed every-two-level scaling without RNG", () => {
    expect(deriveSpellDamage(requireSpell("call-lightning"), { casterLevel: 3 })).toMatchObject({
      components: [
        {
          formula: "1D6",
          repetitions: 3,
          parsed: { count: 1, sides: 6, multiplier: 1, modifier: 0 },
        },
      ],
      displayFormula: "1D6 + 1D6 + 1D6",
    });
    for (const [level, maximumDiceCount] of [
      [1, 2],
      [2, 2],
      [3, 3],
      [4, 3],
      [5, 4],
    ] as const) {
      expect(
        deriveSpellDamage(requireSpell("ley-line-tendril-bolts"), { casterLevel: level }),
      ).toMatchObject({ maximumDiceCount, selectedDiceCount: maximumDiceCount });
    }
    expect(deriveSpellDamage(requireSpell("lightning-arc"), { casterLevel: 3 })).toMatchObject({
      components: [
        { formula: "4D6", repetitions: 1 },
        { formula: "2", repetitions: 3 },
      ],
      displayFormula: "4D6 + 2 + 2 + 2",
    });
  });

  test("regulates Tendril dice and attaches only explicitly selected bonuses", () => {
    const spell = requireSpell("ley-line-tendril-bolts");
    expect(deriveSpellDamage(spell, { casterLevel: 5, diceCount: 1 })).toMatchObject({
      components: [
        {
          formula: "1D6",
          repetitions: 1,
          parsed: { count: 1, sides: 6, multiplier: 1, modifier: 0 },
        },
      ],
      maximumDiceCount: 4,
      selectedDiceCount: 1,
      optionalBonuses: [],
      bonus: 0,
      displayFormula: "1D6",
    });
    expect(
      deriveSpellDamage(spell, {
        casterLevel: 5,
        diceCount: 3,
        optionalBonusIds: ["doublePpe"],
      }),
    ).toMatchObject({
      components: [{ formula: "3D6", repetitions: 1 }],
      maximumDiceCount: 4,
      selectedDiceCount: 3,
      optionalBonuses: [{ id: "doublePpe", label: "Double P.P.E.", amount: 20 }],
      bonus: 20,
      displayFormula: "3D6 + 20",
    });
    expect(() => deriveSpellDamage(spell, { casterLevel: 5, diceCount: 0 })).toThrow(/diceCount/i);
    expect(() => deriveSpellDamage(spell, { casterLevel: 5, diceCount: 5 })).toThrow(/maximum/i);
    expect(() => deriveSpellDamage(spell, { casterLevel: 5, diceCount: 2.5 })).toThrow(/integer/i);
    expect(() =>
      deriveSpellDamage(spell, { casterLevel: 5, optionalBonusIds: ["overcharge"] }),
    ).toThrow(/unknown.*bonus/i);
    expect(() =>
      deriveSpellDamage(spell, {
        casterLevel: 5,
        optionalBonusIds: ["doublePpe", "doublePpe"],
      }),
    ).toThrow(/duplicate.*bonus/i);
  });

  test("rejects invalid levels and choices that contradict the selection mode", () => {
    expect(() => deriveSpellDamage(requireSpell("fire-ball"), { casterLevel: 0 })).toThrow(
      /casterLevel.*positive/i,
    );
    expect(() => deriveSpellDamage(requireSpell("fire-ball"), { casterLevel: 1.5 })).toThrow(
      /casterLevel.*integer/i,
    );
    expect(() =>
      deriveSpellDamage(requireSpell("fire-ball"), { casterLevel: 1, environment: "normal" }),
    ).toThrow(/environment.*single/i);
    expect(() =>
      deriveSpellDamage(requireSpell("fire-ball"), { casterLevel: 1, diceCount: 1 }),
    ).toThrow(/not adjustable/i);
    const stepped = spellSchema.parse({
      id: "stepped-test",
      name: "Stepped Test",
      level: 1,
      ppe: 1,
      range: "Self",
      duration: "Instant",
      savingThrow: "none",
      damage: "Up to 5D6 M.D. in two-die steps",
      damageEffect: {
        selection: "single",
        variants: [
          {
            id: "default",
            type: "md",
            base: "5D6",
            adjustableDiceCount: { minimum: 1, step: 2 },
          },
        ],
      },
      page: 1,
    });
    expect(() => deriveSpellDamage(stepped, { casterLevel: 1, diceCount: 2 })).toThrow(
      /steps of 2/i,
    );
    expect(deriveSpellDamage(stepped, { casterLevel: 1, diceCount: 3 })).toMatchObject({
      selectedDiceCount: 3,
      displayFormula: "3D6",
    });
  });
});
```

- [ ] **Step 2: Run the focused test and observe the missing derivation failure**

Run: `vp test packages/rules/tests/spell-damage.test.ts`

Expected: FAIL because `deriveSpellDamage` is not exported.

- [ ] **Step 3: Implement variant selection, scaling expansion, adjustable dice, and optional bonuses**

Add these imports to `packages/rules/src/engine/spells.ts`:

```ts
import type { DamageType } from "../schema/damage.ts";
import type {
  SpellDamageEnvironment,
  SpellDamageOptionalBonus,
  SpellDamageVariant,
} from "../schema/spells.ts";
import { parseDice, rollDice, type DiceFormula, type Rng } from "./dice.ts";
```

Replace the existing `rollDice` import rather than keeping two imports from `./dice.ts`. Add this block after `getSpellByName`:

```ts
export interface DeriveSpellDamageOptions {
  casterLevel: number;
  variantId?: string;
  environment?: SpellDamageEnvironment;
  diceCount?: number;
  optionalBonusIds?: readonly string[];
}

export interface DerivedSpellDamageComponent {
  formula: string;
  repetitions: number;
  parsed: DiceFormula;
}

export interface DerivedSpellDamage {
  variantId: string;
  type: DamageType;
  components: DerivedSpellDamageComponent[];
  optionalBonuses: SpellDamageOptionalBonus[];
  bonus: number;
  displayFormula: string;
  maximumDiceCount?: number;
  selectedDiceCount?: number;
}

function selectDamageVariant(spell: Spell, options: DeriveSpellDamageOptions): SpellDamageVariant {
  const effect = spell.damageEffect!;
  if (effect.selection === "single") {
    if (options.environment !== undefined) {
      throw new Error(`${spell.name} uses single damage; environment is not a valid choice.`);
    }
    const variant = effect.variants[0]!;
    if (options.variantId !== undefined && options.variantId !== variant.id) {
      throw new Error(`Unknown damage variant "${options.variantId}" for ${spell.name}.`);
    }
    return variant;
  }
  if (effect.selection === "casterChoice") {
    if (options.environment !== undefined) {
      throw new Error(`${spell.name} uses variantId, not environment, for its caster choice.`);
    }
    if (options.variantId === undefined) {
      throw new Error(`${spell.name} requires a damage variantId.`);
    }
    const variant = effect.variants.find((candidate) => candidate.id === options.variantId);
    if (!variant)
      throw new Error(`Unknown damage variant "${options.variantId}" for ${spell.name}.`);
    return variant;
  }
  if (options.variantId !== undefined) {
    throw new Error(`${spell.name} uses environment selection; variantId is contradictory.`);
  }
  if (options.environment === undefined) {
    throw new Error(`${spell.name} requires a damage environment.`);
  }
  const variant = effect.variants.find(
    (candidate) => candidate.environment === options.environment,
  );
  if (!variant)
    throw new Error(`Unknown damage environment "${options.environment}" for ${spell.name}.`);
  return variant;
}

function scalingRepetitions(
  casterLevel: number,
  scaling: NonNullable<SpellDamageVariant["scaling"]>,
): number {
  if (casterLevel < scaling.startsAtLevel) return 0;
  return Math.floor((casterLevel - scaling.startsAtLevel) / scaling.everyLevels) + 1;
}

function repeatedFormula(components: readonly DerivedSpellDamageComponent[]): string[] {
  return components.flatMap((component) =>
    Array.from({ length: component.repetitions }, () => component.formula),
  );
}

/** Expand one selected spell-damage application without consuming randomness. */
export function deriveSpellDamage(
  spell: Spell,
  options: DeriveSpellDamageOptions,
): DerivedSpellDamage | undefined {
  if (spell.damageEffect === undefined) return undefined;
  if (!Number.isInteger(options.casterLevel)) {
    throw new Error(`casterLevel must be a positive integer, got ${options.casterLevel}.`);
  }
  if (options.casterLevel < 1) {
    throw new Error(`casterLevel must be positive, got ${options.casterLevel}.`);
  }

  const variant = selectDamageVariant(spell, options);
  let components: DerivedSpellDamageComponent[] = [];
  if (variant.base !== undefined) {
    components.push({ formula: variant.base, repetitions: 1, parsed: parseDice(variant.base) });
  }
  if (variant.scaling !== undefined) {
    const repetitions = scalingRepetitions(options.casterLevel, variant.scaling);
    if (repetitions > 0) {
      components.push({
        formula: variant.scaling.formula,
        repetitions,
        parsed: parseDice(variant.scaling.formula),
      });
    }
  }

  let maximumDiceCount: number | undefined;
  let selectedDiceCount: number | undefined;
  if (variant.adjustableDiceCount === undefined) {
    if (options.diceCount !== undefined) {
      throw new Error(`${spell.name} damage is not adjustable; diceCount is invalid.`);
    }
  } else {
    maximumDiceCount = components.reduce(
      (total, component) => total + component.parsed.count * component.repetitions,
      0,
    );
    selectedDiceCount = options.diceCount ?? maximumDiceCount;
    if (!Number.isInteger(selectedDiceCount)) {
      throw new Error(`diceCount must be an integer, got ${selectedDiceCount}.`);
    }
    const { minimum, step } = variant.adjustableDiceCount;
    if (selectedDiceCount < minimum) {
      throw new Error(`diceCount must be at least ${minimum}, got ${selectedDiceCount}.`);
    }
    if (selectedDiceCount > maximumDiceCount) {
      throw new Error(
        `diceCount ${selectedDiceCount} exceeds the derived maximum ${maximumDiceCount}.`,
      );
    }
    if ((selectedDiceCount - minimum) % step !== 0) {
      throw new Error(`diceCount must advance from ${minimum} in steps of ${step}.`);
    }
    const sides = components[0]!.parsed.sides;
    const formula = `${selectedDiceCount}D${sides}`;
    components = [{ formula, repetitions: 1, parsed: parseDice(formula) }];
  }

  const selectedIds = options.optionalBonusIds ?? [];
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new Error(`Duplicate optional damage bonus id for ${spell.name}.`);
  }
  const availableBonuses = new Map(
    (variant.optionalBonuses ?? []).map((bonus) => [bonus.id, bonus] as const),
  );
  const optionalBonuses = selectedIds.map((id) => {
    const bonus = availableBonuses.get(id);
    if (!bonus) throw new Error(`Unknown optional damage bonus "${id}" for ${spell.name}.`);
    return bonus;
  });
  const bonus = optionalBonuses.reduce((total, selected) => total + selected.amount, 0);
  const displayParts = [...repeatedFormula(components), ...(bonus === 0 ? [] : [String(bonus)])];

  return {
    variantId: variant.id,
    type: variant.type,
    components,
    optionalBonuses,
    bonus,
    displayFormula: displayParts.join(" + "),
    ...(maximumDiceCount === undefined || selectedDiceCount === undefined
      ? {}
      : { maximumDiceCount, selectedDiceCount }),
  };
}
```

- [ ] **Step 4: Run the derivation tests**

Run: `vp test packages/rules/tests/spell-damage.test.ts`

Expected: PASS. No RNG is consumed, Tendril boundaries are 2/2/3/3/4 dice at levels 1-5, and caster/environment choices never silently default.

- [ ] **Step 5: Run rules-package check and tests**

Run: `vp run @riftforge/rules#check`

Expected: PASS.

Run: `vp run @riftforge/rules#test`

Expected: PASS.

- [ ] **Step 6: Commit pure derivation**

```bash
git add packages/rules/src/engine/spells.ts packages/rules/tests/spell-damage.test.ts
git commit -m "feat(rules): derive spell damage plans"
```

---

### Task 7: Deterministic Detailed Spell-Damage Rolls

**Files:**

- Modify: `packages/rules/tests/spell-damage.test.ts`
- Modify: `packages/rules/src/engine/spells.ts`

**Interfaces:**

- Consumes: `deriveSpellDamage`, `DeriveSpellDamageOptions`, `DetailedRoll`, `rollDiceDetailed`, and injectable `Rng`.
- Produces: `SpellDamageComponentRoll`, `SpellDamageRoll`, and `rollSpellDamage(spell, options, rng?): SpellDamageRoll | undefined`.

- [ ] **Step 1: Add failing deterministic roll tests**

Replace the imports at the top of `packages/rules/tests/spell-damage.test.ts` with:

```ts
import { describe, expect, test } from "vite-plus/test";
import {
  deriveSpellDamage,
  getSpell,
  rollSpellDamage,
  spellBook,
  spellDamageEffectSchema,
  spellSchema,
  type Spell,
  type SpellDamageEffect,
  type SpellHealing,
} from "../src/index.ts";
```

Then append:

```ts
function sequenceRng(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) throw new Error("Test RNG exhausted.");
    index += 1;
    return value;
  };
}

describe("rollSpellDamage", () => {
  test("returns undefined without structured damage", () => {
    expect(
      rollSpellDamage(requireSpell("globe-of-daylight"), { casterLevel: 1 }, () => 0),
    ).toBeUndefined();
  });

  test("rolls one fixed environment variant with individual dice", () => {
    expect(
      rollSpellDamage(
        requireSpell("energy-bolt"),
        { casterLevel: 1, environment: "normal" },
        sequenceRng([0, 0.2, 0.4, 0.999]),
      ),
    ).toEqual({
      variantId: "normal",
      type: "sdc",
      components: [{ formula: "4D6", dice: [1, 2, 3, 6], total: 12 }],
      dice: [1, 2, 3, 6],
      optionalBonuses: [],
      bonus: 0,
      total: 12,
      displayFormula: "4D6",
    });
  });

  test("rolls repeated scaling as separate telemetry components", () => {
    expect(
      rollSpellDamage(requireSpell("call-lightning"), { casterLevel: 3 }, sequenceRng([0, 0, 0])),
    ).toMatchObject({
      variantId: "default",
      type: "md",
      components: [
        { formula: "1D6", dice: [1], total: 1 },
        { formula: "1D6", dice: [1], total: 1 },
        { formula: "1D6", dice: [1], total: 1 },
      ],
      dice: [1, 1, 1],
      bonus: 0,
      total: 3,
    });
  });

  test("adds the explicitly selected Tendril bonus after regulated dice", () => {
    expect(
      rollSpellDamage(
        requireSpell("ley-line-tendril-bolts"),
        { casterLevel: 5, diceCount: 3, optionalBonusIds: ["doublePpe"] },
        sequenceRng([0.5, 0.5, 0.5]),
      ),
    ).toEqual({
      variantId: "default",
      type: "md",
      components: [{ formula: "3D6", dice: [4, 4, 4], total: 12 }],
      dice: [4, 4, 4],
      optionalBonuses: [{ id: "doublePpe", label: "Double P.P.E.", amount: 20 }],
      bonus: 20,
      total: 32,
      displayFormula: "3D6 + 20",
      maximumDiceCount: 4,
      selectedDiceCount: 3,
    });
  });
});
```

- [ ] **Step 2: Run the focused test and observe the missing rolling API failure**

Run: `vp test packages/rules/tests/spell-damage.test.ts`

Expected: FAIL because `rollSpellDamage` is not exported.

- [ ] **Step 3: Implement detailed component rolling and aggregation**

Add this import to `packages/rules/src/engine/spells.ts`:

```ts
import { rollDiceDetailed, type DetailedRoll } from "./rolls.ts";
```

Add this block immediately after `deriveSpellDamage`:

```ts
export interface SpellDamageComponentRoll extends DetailedRoll {
  formula: string;
}

export interface SpellDamageRoll {
  variantId: string;
  type: DamageType;
  components: SpellDamageComponentRoll[];
  dice: number[];
  optionalBonuses: SpellDamageOptionalBonus[];
  bonus: number;
  total: number;
  displayFormula: string;
  maximumDiceCount?: number;
  selectedDiceCount?: number;
}

/** Roll one derived spell-damage application with detailed, deterministic telemetry. */
export function rollSpellDamage(
  spell: Spell,
  options: DeriveSpellDamageOptions,
  rng: Rng = Math.random,
): SpellDamageRoll | undefined {
  const derived = deriveSpellDamage(spell, options);
  if (derived === undefined) return undefined;
  const components: SpellDamageComponentRoll[] = [];
  for (const component of derived.components) {
    for (let repetition = 0; repetition < component.repetitions; repetition += 1) {
      components.push({ formula: component.formula, ...rollDiceDetailed(component.parsed, rng) });
    }
  }
  const dice = components.flatMap((component) => component.dice);
  const rolledTotal = components.reduce((total, component) => total + component.total, 0);
  return {
    variantId: derived.variantId,
    type: derived.type,
    components,
    dice,
    optionalBonuses: derived.optionalBonuses,
    bonus: derived.bonus,
    total: rolledTotal + derived.bonus,
    displayFormula: derived.displayFormula,
    ...(derived.maximumDiceCount === undefined || derived.selectedDiceCount === undefined
      ? {}
      : {
          maximumDiceCount: derived.maximumDiceCount,
          selectedDiceCount: derived.selectedDiceCount,
        }),
  };
}
```

- [ ] **Step 4: Run spell-damage and existing spell tests**

Run: `vp test packages/rules/tests/spell-damage.test.ts packages/rules/tests/spells.test.ts packages/rules/tests/rolls.test.ts`

Expected: PASS. Existing structured healing and detailed dice rolls remain unchanged.

- [ ] **Step 5: Run package check and test gates**

Run: `vp run @riftforge/rules#check`

Expected: PASS.

Run: `vp run @riftforge/rules#test`

Expected: PASS.

- [ ] **Step 6: Commit rolling support**

```bash
git add packages/rules/src/engine/spells.ts packages/rules/tests/spell-damage.test.ts
git commit -m "feat(rules): roll structured spell damage"
```

---

### Task 8: Final Documentation, Verification, and GitHub Bookkeeping

**Files:**

- Modify: `.codex/superpowers/specs/2026-07-17-combat-resolution-design.md`
- Verify only: all files changed in Tasks 1-7
- GitHub update: issue #16 progress comment `5002421933`
- GitHub update: issue #20 progress comment (leave open pending human merge)
- GitHub update: issue #44 body (remove stale H2H-debt wording only; preserve
  every other paragraph, label, scope, and its open state)
- GitHub verify only: milestone `M3: Rules breadth`

**Interfaces:**

- Consumes: all APIs and tests from Tasks 1-7 plus clean package/root gates.
- Produces: an implementation-outcome record, evidence-backed issue comments, a clean checkpoint commit, and a branch ready for push/draft PR when the user requests publication.

- [ ] **Step 1: Append the implementation outcome to the approved design**

Append this section to `.codex/superpowers/specs/2026-07-17-combat-resolution-design.md` only after Tasks 1-7 pass:

```md
## Implementation outcome

Implemented on `feat/combat-resolution` with the approved content/schema/engine
boundary:

- `combatResolutionRules` loads the exact printed p.346 constants;
- `resolveStrike` validates completed d20 rolls and applies the approved natural
  roll, post-bonus miss, opposed-defense, and trained-critical ordering;
- `combatProfile` and `deriveSheet` preserve the sparse raw H2H bonus record and
  expose maneuver-specific auto-dodge, thrown, gun, initiative, Horror Factor,
  and unconditional critical values;
- 15 finite damage spells carry explicit `damageEffect` content, while seven
  compound/special spells remain deliberately prose-only; and
- `deriveSpellDamage` and `rollSpellDamage` provide pure, caller-selected,
  RNG-injectable damage plans and detailed rolls without applying armor or
  mutating a target.

Final verification passed the package-equivalent CI gates and the repository
gates listed below. No frontend/backend behavior changed, so browser verification
was not applicable to this slice. Equipment-aware A.R., armor routing, and
persisted hostile damage remain in #44.
```

- [ ] **Step 2: Run format repair, then inspect the diff**

Run: `vp check --fix`

Expected: PASS; formatting changes are limited to the intended files.

Run: `git diff --check`

Expected: no output and exit code 0.

Run: `git diff --stat`

Expected: only the Task 1-8 rules, tests, content, index, and design files appear.

- [ ] **Step 3: Run the per-package CI-equivalent gates**

Run: `vp run @riftforge/rules#check`

Expected: PASS.

Run: `vp run @riftforge/rules#test`

Expected: PASS with all rules tests, including `strike-resolution.test.ts` and `spell-damage.test.ts`.

- [ ] **Step 4: Run the root completion gates**

Run: `vp check`

Expected: PASS with format, lint, and typecheck clean.

Run: `vp test`

Expected: PASS for the entire workspace with zero failures.

- [ ] **Step 5: Commit the verified documentation outcome**

```bash
git add .codex/superpowers/specs/2026-07-17-combat-resolution-design.md
git commit -m "docs: record combat resolution implementation"
```

- [ ] **Step 6: Post the verified issue #16 progress update**

Edit issue #16 comment `5002421933` to this exact content after all four gates pass:

```md
Implementation is complete locally on `feat/combat-resolution`.

Specification: `.codex/superpowers/specs/2026-07-17-combat-resolution-design.md`
Execution plan: `.codex/superpowers/plans/2026-07-17-combat-resolution.md`

Delivered:

- Page-stamped p.346 combat constants and a pure `resolveStrike` truth table, including validated completed rolls, post-bonus 1-4 misses, natural-20 defense precedence, defendable trained critical ranges, and explicit defense authorization.
- Complete H2H bonus preservation through `combatProfile` and `deriveSheet`, including maneuver-specific auto-dodge, thrown, gun, initiative, Horror Factor, and unconditional critical totals.
- Shared S.D.C./M.D. damage typing plus load-validated `damageEffect` data for all 15 finite current damage spells.
- Pure `deriveSpellDamage` and RNG-injectable `rollSpellDamage`, including caster choices, ley environments, level scaling, Tendril regulation, and its explicit doubled-P.P.E. bonus.
- Prose/structure correspondence tests for every structured damage spell and every structured healing spell, plus explicit coverage of the seven special-only damage spells.

Verification passed:

- `vp run @riftforge/rules#check`
- `vp run @riftforge/rules#test`
- `vp check`
- `vp test`

No UI/backend mutation was added. A.R., armor-first routing, M.D.C. pool application, and persisted hostile damage remain in #44. #16 remains open pending branch publication, PR review, and human merge.
```

- [ ] **Step 7: Post issue #20 evidence without closing it**

Add this exact comment to issue #20:

```md
The implementation on `feat/combat-resolution` now carries the complete sparse `handToHandBonuses` record through `CombatProfile` and `deriveSheet`, so `pullPunch`, `rollWithImpact`, `disarm`, `entangle`, and future content keys reach `CharacterSheet.combat` without another projection change.

Focused coverage in `packages/rules/tests/combat.test.ts` and `packages/rules/tests/character.test.ts` proves the raw Basic level-1 keys reach the sheet and verifies the new maneuver-specific totals. Package and root check/test gates pass. Leaving #20 open until the branch is published, reviewed, and human-merged.
```

- [ ] **Step 8: Align #44 wording, then verify tracker boundaries and branch state**

Replace only the stale issue #44 Engine bullet that says the H2H bonus keys are
still unwired / #16 standing debt with:

```md
- #16 now surfaces the needed H2H bonuses (`initiative`, `autoDodge`, `saveVsHorrorFactor`, `strikeThrown`, and `strikeGuns`); this issue consumes those derived values when it adds equipment-aware resolution.
```

Preserve every other paragraph, label, scope, and the issue's open state.

Run:

```bash
gh issue view 16 --repo StreamDemon/RiftForge --json state,milestone,url
gh issue view 20 --repo StreamDemon/RiftForge --json state,url
gh issue view 44 --repo StreamDemon/RiftForge --json state,body,url
git status --short --branch
git log --oneline --decorate -12
```

Expected:

- #16 remains open in `M3: Rules breadth`.
- #20 remains open until merge.
- #44's stale H2H-debt wording is replaced while the open issue still explicitly
  owns A.R., armor damage, M.D.C. application, and hostile persistence.
- The working tree is clean on `feat/combat-resolution`.
- The log contains the Task 1-8 checkpoint commits and no commit on `main`.

Do not change milestone M3 state or issue #44's labels, scope, or state: local
completion of one issue does not complete the milestone or its equipment-aware
follow-on.

---

## Completion Boundary

At the end of this plan, issue #16 is implemented and verified locally, issue #20 has concrete evidence that its sheet-projection defect is fixed on the branch, and issue #44 remains the follow-on owner of equipment-aware damage application. Publishing the branch, opening the draft PR, responding to Cubic, and merging are separate workflow steps; the human maintainer performs the merge.
