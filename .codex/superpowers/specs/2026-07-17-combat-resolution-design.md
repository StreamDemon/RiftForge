# Combat Resolution and Structured Spell Damage Design

**Date:** 2026-07-17  
**Branch:** `feat/combat-resolution`  
**Primary issue:** [#16 — Combat resolution constants + resolver](https://github.com/StreamDemon/RiftForge/issues/16)  
**Follow-on issue:** [#44 — Equipment-aware A.R./armor/M.D.C. routing](https://github.com/StreamDemon/RiftForge/issues/44)

## Status

Approved in conversation on 2026-07-17. This document records the approved
architecture, data contract, integration boundary, and verification strategy
before production implementation begins.

## Goal

Add the pure rules-layer foundation needed to resolve a strike and roll spell
damage without introducing a second authority for live character damage.

This slice will:

- transcribe the strike-resolution constants from rendered RUE page 346 into
  page-stamped, load-validated content;
- add a deterministic resolver for an already-rolled strike opposed by an
  optional valid parry, dodge, or automatic dodge;
- preserve the complete Hand-to-Hand bonus surface through `combatProfile` and
  `deriveSheet` instead of silently dropping non-basic keys;
- add load-validated structured spell damage for finite, rollable damage
  expressions, including level scaling, caster choices, and ley-location
  variants; and
- expose the resulting APIs from `@riftforge/rules` for the later server/VTT
  flow.

## Non-goals

The following remain in #44 or later work:

- selecting a live hostile target in the web app;
- applying attack damage in a Convex mutation;
- S.D.C. armor A.R. penetration and armor-first damage routing;
- worn-armor destruction and persisted M.D.C. damage;
- called shots, hit locations, paired weapons, bursts, payload, and W.P.
  proficiency;
- a generic spell-effect interpreter for reflection, percentage pool loss,
  supernatural-strength substitution, coma, or other non-dice effects;
- conditional or positional critical/lethal moves — knockout/stun, death blow,
  and the "critical strike from behind" (and its triple-damage case) — beyond
  the _unconditional_ critical-strike range, which this slice does model; and
- new combat controls or other user-visible UI.

No frontend or backend behavior changes are required by this slice. The rules
APIs are the seam #44 will consume when it makes hostile combat server-derived.

## Printed sources

All rule facts below were checked against rendered pages of the scanned local
Rifts Ultimate Edition rulebook. The PDF has no usable text layer.

| Printed page | Mechanic used here                                                                                                                                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 344          | Combat bonuses are maneuver-specific; critical strikes deal double damage; automatic dodge uses P.P. and specifically named auto-dodge bonuses.                                                                                                           |
| 345          | A dodge succeeds when the defender rolls equal to or higher than the attacker's strike.                                                                                                                                                                   |
| 346          | Parry normally applies to physical attacks, not bullets or energy; one M.D. equals 100 S.D.C.; a melee is 15 seconds; a post-bonus strike total of 1–4 misses; natural 1 always misses; natural 20 is critical and only another natural 20 can defend it. |
| 326          | Ancient-weapon (incl. thrown) W.P. strike/parry bonuses are combined with the character's P.P. attribute, O.C.C., and Hand to Hand Combat bonuses.                                                                                                        |
| 360          | Modern weapons (guns/energy): P.P. attribute bonuses and Hand to Hand combat bonuses do NOT apply — only W.P. bonuses. An untrained shooter rolls 1D20 with no strike bonus.                                                                              |
| 202          | Energy Bolt deals 4D6 S.D.C., 6D6 on a ley line, or 8D6 at a nexus.                                                                                                                                                                                       |
| 205          | Fire Bolt lets the caster choose 4D6 M.D. or 1D6x10 S.D.C.                                                                                                                                                                                                |
| 209–210      | Call Lightning deals 1D6 M.D. per caster level; Fire Ball deals 1D4 M.D. per caster level.                                                                                                                                                                |
| 215          | Ley Line Tendril Bolts start at 2D6 M.D. and add 1D6 every two additional levels; the caster may regulate the result in 1D6 increments; doubling P.P.E. adds 20 M.D. per bolt. Lightning Arc deals 4D6 plus 2 M.D. per level.                             |
| 219          | Meteor deals 1D6x10 plus 2 M.D. per caster level. Deathword demonstrates a deliberately excluded compound effect: direct Hit Point or M.D. damage plus a conditional doubling rule.                                                                       |

Content JSON continues to use the printed page number, never the PDF index.

The remaining structured spells (Ignite Fire p.202, Electric Arc p.204, Circle
of Flame p.207, Ballistic Fire p.211, Lightblade p.213, Shockwave p.216, Dragon
Fire p.217, Firequake p.222) are already page-stamped in the catalog and are
re-expressed structurally without new transcription.

## Architecture

The implementation stays in the rules package's existing content/schema/engine
layers:

```text
page-stamped JSON -> Zod schema -> pure derivation/resolution -> exported API
```

The recommended design is additive:

- existing printed spell `damage` strings remain intact for display and full
  prose fidelity;
- a new optional `damageEffect` field carries only damage expressions the
  engine can honestly derive and roll;
- resolver inputs contain completed rolls, so random generation remains an
  explicit caller concern; and
- current convenience combat fields remain compatible while a complete bonus
  record is added alongside them.

This avoids a breaking spell-content migration and avoids prematurely building
a generic effect language.

## Shared damage type

Introduce a shared schema and type:

```ts
damageTypeSchema = z.enum(["sdc", "md"]);
type DamageType = z.infer<typeof damageTypeSchema>;
```

Weapon damage and spell damage both consume this definition. Hit Point damage
is not added as a third general damage system in #16: direct-Hit-Point spells
have exceptional routing and remain special-only until their whole mechanic is
modeled.

## Page-stamped combat constants

Add a small combat-resolution content document validated at module load:

```ts
interface CombatResolutionRules {
  book: string;
  page: 346;
  meleeSeconds: 15;
  automaticMissAtOrBelow: 4;
  sdcPerMd: 100;
  naturalTwentyDamageMultiplier: 2;
}
```

The numeric literal types above illustrate the transcribed values; the runtime
schema validates positive integers and the tests assert the exact printed
values. The resolver reads the parsed content rather than duplicating magic
numbers.

`sdcPerMd` is exported for #44. This slice does not use it to mutate a live
M.D.C. pool or decide armor routing.

## Strike resolver contract

The resolver receives completed `D20Roll` values from the existing roll engine:

```ts
type DefenseKind = "parry" | "dodge" | "autoDodge";

interface StrikeDefense {
  kind: DefenseKind;
  roll: D20Roll;
}

interface ResolveStrikeInput {
  strike: D20Roll;
  defense?: StrikeDefense;
  allowedDefenses: readonly DefenseKind[];
  damageType: DamageType;
  /** Lowest natural die that scores a critical strike. Defaults to 20; trained
   * fighters crit lower (see `criticalStrikeOn` on the combat profile). */
  criticalOn?: number;
}

type StrikeOutcome = "hit" | "miss" | "defended";

type StrikeReason =
  | "naturalOne"
  | "belowMinimum"
  | "parried"
  | "dodged"
  | "unopposed"
  | "strikeWon";

interface StrikeResolution {
  outcome: StrikeOutcome;
  reason: StrikeReason;
  critical: boolean;
  damageMultiplier: 1 | 2;
  damageType: DamageType;
}
```

`allowedDefenses` is explicit rather than inferred from a coarse weapon class.
That lets the caller express the book's normal restriction on parrying bullets
and energy while leaving room for a future page-stamped exception. Submitting a
defense kind that is not allowed is contradictory input and throws.

Although the input reuses `D20Roll`, the resolver derives natural-roll status
from `die` and validates that the die is an integer from 1–20 and that
`total === die + bonus`. It does not trust contradictory natural-roll booleans
or totals supplied by an external caller. When supplied, `criticalOn` must be an
integer from 2–20 because a natural 1 always misses.

### Resolution order

`resolveStrike` evaluates in this order:

1. A natural 1 strike misses regardless of bonuses.
2. A strike whose final total is at or below `automaticMissAtOrBelow` (the
   printed 1–4) misses. Thus a natural 2 with +3 reaches 5 and is not an
   automatic miss; the printed threshold is explicitly after bonuses.
3. With no defense, the strike hits. It is critical when its natural die is at
   or above `criticalOn` (default 20; lower for trained fighters).
4. A natural 20 defense succeeds regardless of modified totals, including
   against a natural-20 strike.
5. A natural 20 strike defeats every non-natural-20 defense. This
   "undefendable" property is keyed strictly to a natural 20 — NOT to the
   critical threshold — so a critical strike on an 18 or 19 is still defended by
   a normal equal-or-higher roll.
6. In every other opposed roll, a defense total equal to or greater than the
   strike total defends; otherwise the strike hits.

A successful critical strike (natural die at or above `criticalOn`) returns
`critical: true`, with `damageMultiplier` 2 (RUE p.346). A defended or
missed strike returns `critical: false` and multiplier 1 so callers cannot
accidentally apply damage for a failed strike.

`resolveStrike` does not roll damage, apply a multiplier, inspect armor, or
write state. It reports the authoritative outcome and damage system to the next
stage.

A natural 1 on a defense has no special auto-fail rule on page 346. It uses the
ordinary equal-or-higher comparison with its bonus.

## Complete combat bonus surface

`hthBonuses` already accumulates every content key, but `combatProfile` and
`CharacterSheet.combat` currently retain only `strike`, `parry`, `dodge`,
`damageBonus`, and `attacksPerMelee`. The change adds the complete raw
Hand-to-Hand record while preserving existing fields.

The profile will expose:

- `handToHandBonuses`: the complete accumulated content record, including future
  keys without requiring another projection change. This is the RAW Hand-to-Hand
  accumulation — e.g. `handToHandBonuses.strike` is the H2H strike alone,
  distinct from the combined `strike` total below, which also folds in the
  attribute bonus;
- existing compatible totals: `strike`, `parry`, `dodge`, and `damageBonus`
  (each = attribute bonus + the like-named Hand-to-Hand bonus, as today);
- `initiative`: the Hand-to-Hand initiative bonus;
- `autoDodge`: the P.P. attribute dodge bonus plus the specifically named
  auto-dodge bonus, but not the ordinary Hand-to-Hand dodge progression;
- `strikeThrown`: the general strike total (P.P. attribute plus Hand-to-Hand
  strike) plus the specifically named thrown-strike bonus. Pages 326 and 347
  direct ancient/thrown attacks to combine the applicable P.P. and Hand-to-Hand
  combat bonuses; the future W.P. thrown bonus remains out of scope;
- `strikeGuns`: the specifically named gun-strike bonus only — p.360 states P.P.
  attribute and Hand-to-Hand bonuses do NOT apply to modern weapons, so neither
  the P.P. bonus nor the general strike is added;
- `saveVsHorrorFactor`: the specifically named Hand-to-Hand bonus; and
- `criticalStrikeOn`: the lowest natural die that scores a critical strike at
  this level (default 20; 17–19 for trained fighters), promoted from the H2H
  content's unconditional "Critical Strike on an unmodified roll of X-20" notes
  so the caller can pass it to the resolver as `criticalOn`.

Each Hand-to-Hand level entry gains an optional, load-validated
`criticalStrikeOn` integer from 2–20. `combatProfile` selects the lowest
threshold reached at the character's level, defaulting to 20. Only
unconditional critical ranges are structured; knockout/stun, death blow, and
from-behind moves remain page-faithful prose and out of scope.

All absent bonuses resolve to zero at the named-total boundary. The raw record
remains sparse so absence is distinguishable from printed `+0` content.

`deriveSheet` copies this combat profile without recomputing it and adds
`combat.saveVsHorrorFactor` to the O.C.C. bonus in
`saves.horrorFactor`. Existing web consumers remain valid because no current
field is renamed or removed.

## Structured spell damage schema

The existing `damage?: string` remains the full printed display sentence. Add:

```ts
type SpellDamageSelection = "single" | "casterChoice" | "environment";
type SpellDamageEnvironment = "normal" | "leyLine" | "nexus";

interface SpellDamageScaling {
  formula: DiceFormula;
  startsAtLevel: number;
  everyLevels: number;
}

interface AdjustableDiceCount {
  minimum: number;
  step: number;
}

interface SpellDamageOptionalBonus {
  id: string;
  label: string;
  amount: number;
}

interface SpellDamageVariant {
  id: string;
  label?: string;
  type: DamageType;
  base?: DiceFormula;
  scaling?: SpellDamageScaling;
  environment?: SpellDamageEnvironment;
  adjustableDiceCount?: AdjustableDiceCount;
  optionalBonuses?: SpellDamageOptionalBonus[];
  note?: string;
}

interface SpellDamageEffect {
  selection: SpellDamageSelection;
  variants: SpellDamageVariant[];
}
```

`adjustableDiceCount` is the fidelity hook discovered on rendered page 215:
Tendril Bolts may be reduced from their level-derived maximum in one-die
increments. The same page's doubled-P.P.E. option is represented as an optional
flat bonus of +20 M.D. per bolt. The caller must explicitly select that bonus;
the existing `ppeNote` retains the complete printed cost rule, while charging
the alternate cost remains outside this pure damage-roll function.

The structured formula represents one printed damage application: for example,
one missile, one bolt, one passage through a barrier, or one melee's ongoing
damage. Target count, duration, strike bonuses, saves, and timing remain in
their existing dedicated fields or printed prose; `damageEffect` does not claim
to be a complete spell-effect graph.

### Schema invariants

Content load rejects:

- an effect with no variants;
- duplicate variant IDs;
- a variant with neither `base` nor `scaling`;
- a base or scaling damage formula whose minimum result is not strictly
  positive;
- non-positive scaling levels or intervals;
- environment fields on non-environment effects;
- environment effects with duplicate environments;
- `single` effects with anything other than exactly one variant;
- `casterChoice` effects with fewer than two variants;
- `environment` effects without a complete, unambiguous normal/ley-line/nexus
  set for the spell that declares those modes;
- duplicate optional-bonus IDs or non-positive optional-bonus amounts;
- adjustable dice counts on formulas that cannot be safely reduced in the
  declared increments;
- an adjustable base whose dice count is not on the declared
  `minimum + n * step` grid;
- adjustable scaling whose per-application dice count is not divisible by the
  declared step, because any scaling application would move the maximum
  off-grid; and
- a `damageEffect` without a non-blank authoritative printed `damage` prose
  string.

Printed `damage` prose without a `damageEffect` remains legal for compound and
special-only spells whose full mechanic is deliberately not structured.

All formula strings pass the existing `diceFormulaSchema` at content load.

Because the display `damage` sentence and `damageEffect` represent the same
printed damage, table-driven tests assert both values together for every
structured spell. The tests use explicit expected prose and structured objects;
the content loader does not attempt to infer mechanics from free text. The same
test helper can pair healing descriptions with their structured `healing`
objects.

## Spell-damage derivation and rolling

Derivation and randomness remain separate:

```ts
deriveSpellDamage(spell, {
  casterLevel,
  variantId?,
  environment?,
  diceCount?,
  optionalBonusIds?,
}): DerivedSpellDamage | undefined

rollSpellDamage(spell, options, rng?): SpellDamageRoll | undefined
```

`deriveSpellDamage`:

1. returns `undefined` when the spell has no structured damage;
2. validates caster level as a positive integer;
3. resolves the only variant, required caster choice, or required environment;
4. counts scaling applications from `startsAtLevel` in `everyLevels`
   intervals;
5. combines base and scaling into a concrete roll plan without consuming RNG;
6. validates an optional adjustable die count against the derived maximum; and
7. validates and attaches explicitly selected optional flat bonuses; and
8. returns the variant ID, type, component formulas, selected bonuses, and
   display-ready expanded formula metadata.

The roll plan may contain a base component and repeated scaling components.
This avoids string-building assumptions and preserves individual dice for
telemetry. Constant scaling such as Lightning Arc's `+2 per level` uses the
already supported constant dice formula `"2"`.

`rollSpellDamage` rolls each derived component with the injected RNG, combines
their individual dice and totals, adds selected optional flat bonuses, and
returns the selected variant and `DamageType`. It does not apply saves,
critical multipliers, armor, or pool mutation.

Missing required choices, ambiguous context, unknown IDs, impossible adjustable
counts, and invalid levels throw descriptive errors. No function silently picks
a damaging mode for the caster.

## Spell coverage

Every current spell carrying printed `damage` prose is placed in one explicit
test classification. This prevents an entry from being silently forgotten.

### Structured in #16

- Energy Bolt
- Ignite Fire
- Electric Arc
- Fire Bolt
- Circle of Flame
- Call Lightning
- Fire Ball
- Ballistic Fire
- Lightblade
- Ley Line Tendril Bolts
- Lightning Arc
- Shockwave
- Dragon Fire
- Meteor
- Firequake

These entries have a finite per-application damage roll expressible by this
schema. Their printed prose remains present for timing, targeting, save, and
other rules.

### Intentionally special-only

- Fist of Fury — substitutes Supernatural P.S. damage rather than declaring one
  standalone roll.
- House of Glass — reflects damage inflicted by an attacker.
- Lifeblast — changes effect and damage system by target creature category.
- Agony — explicitly causes no physical damage.
- Life Drain — removes a percentage of current pools.
- Desiccate the Supernatural — branches between M.D.C. and direct Hit Point damage.
- Deathword — branches between direct Hit Point and M.D. damage, includes a
  conditional double, and has coma/death consequences.

The test suite asserts both ID sets and their union against all spells with a
`damage` display string. Adding or reclassifying a damage spell therefore
requires an explicit test and schema decision.

## Error handling

The rules layer follows the existing illegal-state policy:

- contradictory content fails during module load through Zod;
- contradictory resolver inputs throw before returning an outcome;
- caller choices are required where the book grants a choice;
- pure functions never clamp, default an ambiguous choice, or mutate state; and
- RNG remains injectable for deterministic tests.

## Test-first implementation strategy

Production changes follow red-green-refactor in small units.

### Combat constants and resolver

Tests will first assert:

- exact page-346 constants;
- rejection of inconsistent or out-of-range externally constructed d20 rolls;
- natural 1 despite a large bonus;
- final totals 1–4 missing and total 5 continuing;
- an unopposed ordinary hit;
- an equal-total parry or dodge defending;
- natural 20 beating a non-natural-20 defense even when its modified total is
  lower;
- natural 20 versus natural 20 resolving as defended (a matching natural 20
  defends regardless of modified totals);
- a natural-20 defense beating a non-natural-20 strike even when the strike's
  modified total is higher;
- an expanded `criticalOn` (e.g. 18) making a natural 18 a critical HIT that is
  still defendable by a normal equal-or-higher roll (crit ≠ undefendable);
- default `criticalOn` of 20 leaving a natural 19 a non-critical hit;
- the critical multiplier applied only on a successful critical strike;
- a defender natural 1 receiving no special auto-fail (ordinary comparison);
- an invalid defense kind throwing; and
- S.D.C./M.D. type propagation without armor routing.

### Combat profile

Tests will first assert:

- the raw accumulated bonus record survives `combatProfile`;
- Commando automatic dodge uses P.P. plus `autoDodge`, not ordinary dodge;
- Assassin thrown totals include P.P., general Hand-to-Hand strike, and the
  specific thrown bonus, while gun totals include only the specific gun bonus;
- `criticalStrikeOn` per type/level: Expert 18 at L6, Commando 17 at L15, and
  the default 20 below the granting level;
- initiative and Horror Factor bonuses survive; and
- the same values appear on `deriveSheet` output without regressing current
  combat fields.

### Spell damage

Tests will first assert:

- schema rejection for every invariant above;
- focused load-time rejection of an off-grid adjustable base, off-grid
  adjustable scaling, and structured damage without printed damage prose;
- exact page-stamped structured content for representative fixed, scaling,
  choice, and environment spells;
- per-level and every-two-level derivation at boundary levels;
- Tendril Bolt regulated dice counts;
- Tendril Bolt's explicitly selected doubled-P.P.E. +20 M.D. bonus;
- deterministic detailed rolls from injected RNG;
- errors for missing/unknown choices and environments;
- structured `damageEffect` staying consistent with the display `damage` string
  for every structured spell through the explicit correspondence table;
- structured `healing` staying consistent with its display description through
  the same test helper; and
- the complete structured/special-only classification; and
- exact equality between catalog IDs carrying `damageEffect` and the explicit
  structured-damage correspondence-table IDs.

Existing structured-healing and weapon-damage tests remain regression coverage.

## Documentation and GitHub bookkeeping

- This design specification is committed before production implementation.
- The later implementation plan will live under `.codex/superpowers/plans/`.
- Issue #16 receives evidence-backed progress updates after design, after
  implementation, and after final verification.
- Issue #44 remains the explicit owner of armor/A.R./persisted hostile damage.
- M3 state is changed only when the corresponding milestone state genuinely
  changes.
- If the richer combat profile fully satisfies another issue such as #20, that
  issue is updated with exact evidence rather than silently treated as done.
- The branch follows the repository workflow: checkpoint commits, push, draft
  PR, Cubic review, and human merge. No issue is prematurely closed merely
  because the local implementation exists.

## Verification gates

At minimum, completion requires:

```text
vp run @riftforge/rules#check
vp run @riftforge/rules#test
vp check
vp test
```

Because this design intentionally makes no user-visible change, browser
verification is not required for #16. It becomes mandatory when #44 wires these
APIs into live hostile combat.

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
