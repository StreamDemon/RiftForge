# Full M.D.C. Combat Exchange Design

**Date:** 2026-07-21
**Status:** Approved in conversation
**Branch:** `feat/mdc-combat-exchange`
**Primary issue:** [#51 — Full M.D.C. combat](https://github.com/StreamDemon/RiftForge/issues/51)

## Goal

Extend the persisted hostile-combat vertical slice from Issue #44 through the
complete core S.D.C./M.D.C. damage-tier boundary without inventing optional
injury rules or introducing a generic effect interpreter.

This slice will:

- support owned S.D.C. and M.D. weapon attacks through one exchange protocol;
- apply the printed S.D.C.-to-M.D.C. conversion and imperviousness rules;
- resolve S.D.C. and M.D. attacks against S.D.C. and M.D.C. body armor;
- preserve the final-blast absorption rule for destroyed armor;
- preserve the limited S.D.C. protection of depleted M.D.C. body armor;
- resolve M.D. against an unprotected mortal and persist deterministic death;
- keep all dice, conversion, routing, and writes authoritative on the server;
- keep existing Issue #44 exchange history readable without a data rewrite; and
- present the complete route in the live SolidJS combat rail.

The existing exchange remains the authority boundary. Issue #51 does not add
M.D. input to the sheet's manual damage control.

## Approved decisions

1. **One exchange protocol.** Extend the existing typed exchange model. Do not
   build a parallel M.D.C. ledger or resolver.
2. **Core outcomes only.** M.D. against an unprotected mortal follows the core
   damage and death rules. The optional near-fatal injury procedure on RUE
   pp.358-359 is deferred to Issue #54.
3. **Exchange-only M.D. writes.** M.D. can enter persistent character state only
   through the server-rolled exchange. The manual damage control remains S.D.C.
4. **No generic effects layer.** Issue #51 remains feature-specific. A future
   page-stamped effect pipeline is tracked in Issue #53 and has explicit entry
   criteria.
5. **Backward-compatible history.** Existing resolved, cancelled, stale, and
   pending Issue #44 records remain accepted. Legacy pending records may safely
   stale when their page-stamped rules token no longer matches.
6. **Terminal death is explicit.** Fatal overflow cannot be represented as a
   survivable character clamped to the coma floor. A persisted terminal marker
   distinguishes death from a character exactly at the legal negative H.P.
   floor.
7. **No client-authored tier.** Weapon content determines S.D.C. versus M.D.; the
   UI never submits a damage tier or conversion.

## Rendered rules evidence

The scanned local Rifts Ultimate Edition has no usable text layer. The following
pages were rendered from PDF indexes `printed page + 2` at 2.2x and inspected
visually on 2026-07-21.

| Printed page | Rule used in this design                                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 287          | Artificial S.D.C. armor routes every completed strike by A.R.: at or below A.R. the armor absorbs the attack; above A.R. the attack reaches the wearer. Depleted S.D.C. armor affords no future protection.                                             |
| 288          | One M.D. equals 100 S.D.C. M.D.C. armor is impervious to S.D.C./Hit Point damage below 100. S.D.C. totals of 100 or more can harm M.D.C.; divide by 100 and round down. M.D.C. armor has no A.R. The last M.D.C. absorbs the complete destroying blast. |
| 354-355      | Zero or negative H.P. is the coma band down to `-P.E.` inclusive. Damage beyond that floor is death with no hope of recovery. The final M.D.C. of armor absorbs the complete destroying blast; subsequent M.D. attacks reach the unprotected wearer.    |
| 355          | At zero M.D.C., body armor is scrap but still stops S.D.C. strike totals 1-7; totals of 8 or higher reach the body inside. Ordinary S.D.C. weapons do not harm M.D.C. beings except for printed vulnerabilities.                                        |
| 356-357      | Context only: M.D.C. technology, equipment scarcity, and GM guidance. No new deterministic damage constant is introduced from these pages.                                                                                                              |
| 358          | Core text describes M.D. against an S.D.C. body as normally lethal. The near-fatal survival procedure begins as an optional guideline requiring GM agreement and medical intervention.                                                                  |
| 359          | The optional survival path introduces hit locations, called-shot eligibility, limb/internal injury, immediate care, surgery, and trauma. Those mechanics are deliberately outside Issue #51 and tracked in Issue #54.                                   |

Existing Issue #44 sources remain authoritative for declaration, defense,
critical multiplication, ranged combat, S.D.C. armor A.R., and S.D.C.-before-H.P.
routing.

## Scope

### In scope

- Owned S.D.C. knife, axe, handgun, and submachine-gun attacks already supported
  by Issue #44.
- Owned M.D. energy-pistol and energy-rifle attacks from the current catalog.
- Existing melee/ranged declaration context, defense authorization, critical
  rules, and server-owned dice.
- S.D.C. attacks against intact and depleted M.D.C. body armor.
- M.D. attacks against S.D.C. armor, intact M.D.C. armor, depleted M.D.C.
  armor, and an unprotected S.D.C./Hit Point body.
- Final-blast armor absorption without spill into the wearer.
- Explicit stopped, armor, body, and fatal route evidence.
- Persisted terminal death state and derived alive/coma/dead presentation.
- Consistent fatal-threshold handling for the existing manual S.D.C. damage
  mutation, without adding an M.D. input mode.
- Backward-compatible Convex validators and history formatting.
- Live two-dossier combat acceptance and parameter-route ownership checks.

### Out of scope

- Optional near-fatal M.D. survival, hit locations, limb loss, medical checks,
  surgery, trauma, and bionic reconstruction (Issue #54).
- A generic spell/psionic/combat effect pipeline (Issue #53).
- General called shots, aimed locations, bursts, payload tracking, thrown weapon
  modes, initiative, rounds, or action-budget enforcement.
- M.D.C. creatures, supernatural bodies, dragons, vehicles, robot vehicles,
  power-armor operation, force fields, and printed vulnerability exceptions.
- Explosions, blast radii, impact damage, knockdown, cover geometry, and VTT
  positioning.
- Authentication, ownership, GM permissions, resurrection, or character deletion
  policy.
- Manual M.D. damage entry.

## Architecture

The existing authority flow remains intact:

```text
page-stamped tier constants + pure exchange resolver
                         |
                         v
Convex exchange ledger + atomic character write
                         |
                         v
SolidJS declaration / response / history rail
```

Issue #51 expands the types and route calculation inside each boundary. It does
not add a fourth orchestration layer.

### Rules package

The pure rules layer owns:

- damage-tier classification from weapon content;
- page-stamped S.D.C./M.D.C. conversion constants;
- protection classification, including depleted M.D.C. armor identity;
- critical multiplication before tier conversion;
- stopped, armor, body, and fatal route calculation;
- life-state derivation and terminal-state invariants; and
- stable combat-state tokens over every route-relevant input.

Random rolls, elapsed time, completed strike/defense rolls, and current pools are
inputs. The rules layer never reads Convex or mutates a character.

### Backend

Convex continues to own exchange identity, synchronization, random dice,
immutable history, current-state rederivation, and the exactly-once character
write. It persists the rules layer's authorized route rather than reproducing
tier math.

### Web

SolidJS surfaces server-derived weapon/target choices, declaration context,
authorized defenses, and immutable route evidence. It never converts S.D.C. to
M.D.C., decides death, or calculates armor damage.

## Page-stamped combat content

The combat exchange content and Zod schema gain explicit printed references and
constants for:

- M.D.C. introduction: p.288;
- M.D.C. combat: p.355;
- S.D.C. per M.D.: `100`;
- minimum S.D.C. total that can harm intact M.D.C.: `100`;
- depleted M.D.C. body-armor bypass strike total: `8`; and
- final-blast absorption: enabled for the last positive armor point.

The schema pins literal printed values and rejects contradictory shapes at import.
Tests assert the complete content object so page or constant drift fails loudly.

## Pure rules model

### Attack profiles

`AttackProfile` expands its supported branch from `damageType: "sdc"` to
`damageType: "sdc" | "md"`.

| Weapon category               | Attack kind | Tier   |
| ----------------------------- | ----------- | ------ |
| `knife`, `axe`                | melee       | S.D.C. |
| `handgun`, `submachineGun`    | ranged      | S.D.C. |
| `energyPistol`, `energyRifle` | ranged      | M.D.   |

Existing strike bonuses, ranged minimums, defense options, critical thresholds,
and firearm restrictions apply unchanged. M.D. weapons do not receive invented
bonuses or special defense behavior.

The attack snapshot and attacker state token include the damage tier and all
page-stamped conversion constants. Any weapon/content change invalidates a pending
exchange before additional dice or writes.

### Protection classification

Protection remains derived from the worn physical item:

- `none`;
- `sdcArmor` with A.R., maximum, and current S.D.C.; or
- `mdcArmor` with maximum and current M.D.C.

Unlike Issue #44, a worn M.D.C. suit at zero remains `mdcArmor`. Printed p.355
gives depleted body armor limited S.D.C. protection, so treating it as `none`
would lose a real mechanic and its identity.

A dice-capacity M.D.C. suit whose per-instance maximum has not been rolled is
classified as unready. It can be displayed, but no attack may be declared against
it until its maximum/current protection is known.

### Resolution order

1. Validate the attack snapshot and combat context.
2. Validate the completed strike roll and declaration minimum.
3. Resolve an authorized defense with the existing `resolveStrike` primitive.
4. Determine critical state and multiplier.
5. Validate and total the native weapon damage roll.
6. Apply the critical multiplier in the weapon's native tier.
7. Classify current protection, including a depleted M.D.C. shell.
8. Convert tiers only when the route requires conversion.
9. Apply the route without spill from a destroying armor hit.
10. Return immutable before/after evidence and terminal outcome.

Conversion never happens before the critical multiplier. This makes the value
being converted the actual completed damage total.

### Routing matrix

| Attack | Protection            | Pure result                                                                                                                                                                                                                             |
| ------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S.D.C. | None                  | Apply to personal S.D.C., then H.P.; classify survivable versus fatal overflow.                                                                                                                                                         |
| S.D.C. | S.D.C. armor          | Existing strike-vs-A.R. route: at/below A.R. ablates armor; above A.R. reaches body. Destroying armor absorbs the full hit.                                                                                                             |
| S.D.C. | Intact M.D.C. armor   | Under 100 is stopped with no pool change. At 100+, apply `floor(total / 100)` M.D. to armor. Destroying armor absorbs the full hit.                                                                                                     |
| S.D.C. | Depleted M.D.C. armor | Completed strike totals 1-7 are stopped. Totals 8+ reach personal S.D.C./H.P. as S.D.C.                                                                                                                                                 |
| M.D.   | None                  | Convert completed M.D. to `M.D. * 100` S.D.C./H.P. damage and classify fatal overflow.                                                                                                                                                  |
| M.D.   | S.D.C. armor          | Apply the existing A.R. comparison. At/below A.R., convert to S.D.C. and ablate armor with no destroying-hit spill. Above A.R., convert the full hit to personal S.D.C./H.P. damage and classify fatal overflow without changing armor. |
| M.D.   | Intact M.D.C. armor   | Apply native M.D. to armor. The destroying hit does not spill into the body.                                                                                                                                                            |
| M.D.   | Depleted M.D.C. armor | Convert the full completed M.D. total to S.D.C./H.P. damage and classify fatal overflow.                                                                                                                                                |

An intact M.D.C. hit by 99 S.D.C. yields a persisted stopped route. A hit by 450
or 496 S.D.C. applies 4 M.D., matching the printed round-down examples. A hit by
21 M.D. against 3 remaining M.D.C. changes armor from 3 to 0 and leaves body
pools untouched. A subsequent M.D. hit reaches the wearer.

### Versioned route evidence

Existing Issue #44 routes remain valid in their original shape. New routes carry
a required routing version so the validator and UI can distinguish legacy and
tier-aware evidence without guessing from optional fields.

A tier-aware route records:

- native completed damage value and tier;
- converted damage value and tier when conversion occurred;
- route kind: `stopped`, `armor`, `body`, or `fatal`;
- stable stopped reason, when applicable;
- armor identity and before/after pool, when applicable;
- body S.D.C./H.P. before and after, when applicable;
- whether final-blast absorption prevented spill; and
- life state before and after for fatal routes.

`totalDamage` remains the completed native weapon total. Converted/application
values live in route evidence so old S.D.C. records do not change meaning.

### Life state and fatal overflow

Character storage gains `current.lifeState?: "dead"`. Absence means the
character is not terminally dead and remains backward-compatible with every
existing document.

The derived sheet exposes:

- `alive` when current H.P. is above zero;
- `coma` when current H.P. is zero through `-P.E.` inclusive and no terminal
  marker exists; and
- `dead` when the terminal marker exists.

Body damage calculates the raw H.P. result before enforcing the storable numeric
floor:

- raw H.P. at or above `-P.E.` is survivable and stores the actual value;
- raw H.P. below `-P.E.` is fatal, stores H.P. at `-P.E.`, stores personal S.D.C.
  at zero, and sets `lifeState: "dead"`.

The terminal marker is valid only when rolled vitals exist, current personal
S.D.C. is zero, and current H.P. equals the derived `-P.E.` floor. These
contradictions are rejected by `deriveSheet`, so no mutation can store a dead
character with healthy pools.

Death is terminal in current product scope. Existing damage, healing, treatment,
rest, inventory, and combat mutations must preserve the marker or reject the
operation. Only a separately designed resurrection mechanic may clear it.

The existing manual damage mutation remains S.D.C.-only but uses the same raw
overflow classifier. This fixes the existing case where arbitrarily large S.D.C.
damage could clamp to the coma floor and remain survivable.

## Persisted exchange model

The existing discriminated exchange variants remain:

- `pendingDefense`;
- `resolved`;
- `cancelled`; and
- `stale`.

The base attack snapshot expands `damageType` to the tier union. The resolved
result validator accepts both the legacy Issue #44 route and the new versioned
tier-aware route.

No historical rewrite is required:

- old characters lack `current.lifeState` and derive as nonterminal;
- old attack snapshots already contain `damageType: "sdc"`;
- old resolved routes remain accepted by their legacy validator branch; and
- old pending exchanges whose state tokens no longer match resolve safely to
  `stale`, never through legacy rules.

## Combat-state tokens

Attacker tokens continue to fingerprint the selected weapon and derived attack.
They additionally cover damage tier and the page-stamped M.D.C. constants.

Defender tokens continue to fingerprint rolled/current body pools and complete
worn-protection identity. They additionally cover:

- derived life state;
- the terminal marker;
- depleted M.D.C. armor identity and zero pool; and
- armor readiness for a dice-capacity suit.

Narrative, P.P.E., and unrelated inventory entries remain excluded so irrelevant
edits do not stale combat.

## Backend operations

### Target query

The bounded target query continues to exclude self and report readiness. It now
also reports:

- derived life state;
- protection tier and current/max pool;
- whether a dice-capacity M.D.C. suit still needs its roll; and
- a stable disabled reason for dead or protection-unready targets.

M.D.C. protection is no longer itself a disabled reason.

### Declare attack

Declaration continues to:

1. load and rederive attacker and defender;
2. reject self, missing, unready, or dead combatants;
3. derive the selected owned weapon profile;
4. derive current protection and require any per-suit armor roll;
5. parse explicit combat context;
6. roll the strike on the server;
7. persist an immediate miss or a pending defense; and
8. return only stable exchange/result data.

M.D. weapon modes are no longer refused. No damage die is rolled for an immediate
miss.

### Respond to attack

Response retains the exactly-once transaction:

1. load a pending exchange;
2. rederive both combatants;
3. compare weapon, attack, context, defense options, state tokens, life state, and
   current protection;
4. parse and authorize the selected response;
5. roll defense when required;
6. roll native damage only for a hit;
7. resolve the tier-aware route;
8. atomically patch armor/body/life state when changed; and
9. replace pending history with the immutable resolved result.

Any changed route-relevant state finalizes the exchange as stale before defense or
damage dice and before character writes.

### Existing character mutations

Every mutation that can change resources or combat readiness is audited against
the terminal-state invariant. Dead characters cannot:

- take additional manual damage;
- heal or receive battle-injury treatment;
- rest or restore resources;
- declare, receive, or respond to a live combat action as an active combatant.

Read queries and immutable combat history remain available. A pre-existing
pending exchange involving a newly dead combatant may still be cancelled as
ledger cleanup; any attempted resolution finalizes it as stale before dice or
character writes. Inventory management does not clear or bypass the terminal
marker.

## Web experience

### Weapon and target selection

Energy pistols and rifles become selectable and keep explicit `M.D.` units in
their labels. Tier is informational and cannot be edited.

M.D.C.-armored targets become legal. A target with an unrolled dice-capacity suit
is disabled with a precise instruction to roll the suit's M.D.C. first. Dead
characters are disabled with terminal-state text.

### Declaration and response

The existing GM-context and defense forms remain unchanged. M.D. attacks use the
same ranged awareness, dodge, automatic-dodge, modifier, and response authority as
their weapon category requires.

No new conversion, armor, or fatality controls appear. These are outputs.

### Result presentation

The recent-history formatter renders explicit route evidence, including examples
such as:

```text
96 S.D.C. -> M.D.C. ARMOR IMPERVIOUS - NO EFFECT
250 S.D.C. -> 2 M.D. :: ARMOR 70 -> 68
21 M.D. :: ARMOR 3 -> 0 :: FINAL BLAST ABSORBED
1 M.D. -> 100 S.D.C. :: UNPROTECTED BODY :: FATAL
DEPLETED SHELL STOPPED STRIKE 7
DEPLETED SHELL BYPASSED :: BODY S.D.C. 12 -> 4
```

Legacy Issue #44 results continue through their existing formatter branch.

Fatal outcomes use the existing blood-red signal and explicit text such as
`LIFE SIGNS TERMINATED`. M.D.C. is technological, not magical, so it never uses
ley cyan. Stopped/no-effect armor results use the machine's amber voice; defended
results retain confirmed green.

### Terminal dossier state

The dossier remains navigable and readable after death. Vitals show the terminal
state without relying on color alone. Damage, healing, treatment, rest, and combat
controls are unavailable with a concise explanation. Historical exchanges remain
visible.

### Navigation and asynchronous ownership

The Issue #44 ownership model remains mandatory:

- parameterized routes do not remount;
- route ID changes reset weapon/target/context drafts, incoming/outgoing/recent
  feeds, notices, telemetry, and row-local state;
- in-flight declaration, response, and cancellation results carry route ID plus
  monotonic epoch; and
- results are ignored when ownership no longer matches.

## Error handling

Stable structured failures cover:

- dead attacker or defender;
- missing per-suit M.D.C. roll;
- changed weapon or attack tier;
- changed armor identity, pool, or life state;
- illegal context or defense;
- missing combatant or exchange; and
- non-pending exchange operations.

The following are successful persisted outcomes, not errors:

- S.D.C. below the intact-M.D.C. threshold;
- depleted shell stopping a low S.D.C. strike;
- final-blast absorption;
- a survivable coma result; and
- a deterministic fatal result.

## Migration and compatibility

Convex schema deployment adds optional character state and expanded union
branches. No data rewrite or backfill runs.

Compatibility requirements:

- existing characters derive without a terminal marker;
- existing resolved S.D.C. history remains queryable and renderable;
- new code accepts old cancelled and stale variants;
- legacy pending exchanges can be cancelled or safely become stale; and
- current indexes remain sufficient because exchange identity/status ownership
  does not change.

## Testing strategy

### Rules package

Pin printed constants and page stamps, then test the complete matrix:

- 99, 100, 199, and 200 S.D.C. against intact M.D.C.;
- the printed 450 and 496 S.D.C. round-down examples;
- native M.D. against intact and nearly depleted M.D.C.;
- final-blast absorption for native and converted damage;
- depleted-shell completed strike totals 7 and 8;
- M.D. at/below and above S.D.C. armor A.R., including no destroying-hit spill;
- M.D. against an unprotected body;
- exact `-P.E.` survival versus one point beyond fatal overflow;
- critical multiplication before conversion;
- malformed or mismatched native/converted route evidence;
- life-state invariants and terminal mutation inputs;
- old S.D.C. route compatibility; and
- state-token sensitivity for tier, rules, depleted armor, and death.

### Backend

Verify:

- target readiness for fixed, rolled, unrolled, intact, depleted, and dead state;
- M.D. attack declaration through the existing exchange API;
- no defense/damage dice or writes for invalid declarations;
- authoritative native damage rolls and conversions;
- atomic armor/body/death updates;
- final-blast no-spill;
- immutable stopped and fatal history;
- stale-state rejection before rolls/writes;
- two concurrent responses produce one winner and one character write;
- all existing recovery/resource mutations reject dead characters; and
- legacy exchange documents remain readable.

### Web

Verify:

- M.D. weapons are selectable and accurately labelled;
- M.D.C. protection is targetable when ready;
- unrolled armor and dead targets explain why they are disabled;
- every tiered route format includes units, conversion, and before/after evidence;
- fatal state disables every relevant control without color-only meaning;
- old S.D.C. history formatting is unchanged;
- combat colors remain semantic with no non-magic cyan;
- async ownership rejects late results after route changes; and
- history disclosure/accessibility contracts remain intact.

## Live-browser acceptance

Use at least two local dossiers and server-owned dice to verify:

1. M.D. against intact M.D.C. armor.
2. A final M.D.C. point absorbing an oversized blast with no body change.
3. A subsequent M.D. hit reaching the now-unprotected wearer.
4. S.D.C. below 100 producing an immutable no-effect route.
5. S.D.C. at/above 100 converting and ablating M.D.C.
6. Depleted-shell S.D.C. strike totals on both sides of 8.
7. M.D. against an unprotected character producing deterministic death.
8. The dead dossier remaining readable while damage, recovery, rest, and combat
   controls remain unavailable.
9. Old S.D.C. history beside new tier-aware results.
10. A-to-B route changes with pending/completed exchanges and no stale UI state.
11. Keyboard and screen-reader labels, narrow-rail overflow, and clean consoles.

## Validation gates

Before publication, run with fresh, time-scoped evidence:

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
```

User-visible changes also require the live-browser acceptance above. Test counts
must be quoted as observations from the final branch revision, never as timeless
project totals.

## Tracker and documentation delivery

- Keep Issue #51 aligned with the implemented core scope and rendered evidence.
- Keep optional near-fatal survival in Issue #54.
- Keep the generic page-stamped effect pipeline in Issue #53.
- Update README/current-status wording once M.D.C. exchanges are live.
- Record explicit exclusions and final validation evidence in the PR and Issue
  #51.
- Follow branch -> PR -> Cubic review -> human merge. Never merge the PR from the
  agent workflow.

## Success criteria

Issue #51 is complete when:

- printed M.D.C. constants are page-stamped and load-validated;
- one pure resolver covers the approved S.D.C./M.D.C. routing matrix;
- existing history remains valid without a rewrite;
- Convex persists server-authorized armor/body/death outcomes atomically and
  exactly once;
- terminal death cannot be bypassed by existing mutations;
- the SolidJS rail presents all new route evidence and terminal state;
- package, root, diff, and live-browser gates pass; and
- the branch is published as a PR for Cubic and human review.
