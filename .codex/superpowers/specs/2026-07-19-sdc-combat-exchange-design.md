# S.D.C. Combat Exchange Design

**Date:** 2026-07-19
**Status:** Approved in conversation
**Branch:** `feat/sdc-combat-exchange`
**Primary issue:** [#44 — A.R. and armor damage in combat](https://github.com/StreamDemon/RiftForge/issues/44)

## Goal

Deliver a rules-faithful, multiplayer-safe S.D.C. hostile-combat vertical slice
without prematurely building the complete VTT encounter system or inventing
Mega-Damage outcomes the current character model cannot represent.

This slice will:

- classify an owned weapon attack as melee or ranged and derive its legal bonuses;
- let the attacker declare a target and GM-adjudicated combat context;
- roll the strike on the server and persist a pending defense when appropriate;
- let the defender or GM choose an engine-authorized parry, dodge, automatic
  dodge, or no defense;
- revalidate the exchange against current attacker and defender state;
- roll defense and damage on the server;
- route S.D.C. damage to artificial S.D.C. armor or the defender's body;
- apply the result atomically to the correct persisted pool; and
- surface incoming, outgoing, and recent exchanges on the live dossier.

The rules engine enumerates and validates choices. It never chooses how a player
role-plays a character and never substitutes for the Game Master's situational
judgment.

## Approved decisions

1. **S.D.C. tier only.** Full M.D.C. resolution is a separate follow-up.
2. **Persisted two-phase exchange.** The attacker declares and rolls first; a
   potential hit waits for a defender/GM response.
3. **No full encounter model.** Initiative, rounds, action budgets, ownership,
   and map positioning remain future work.
4. **No natural A.R. path.** Rendered RUE p.339 explicitly says Natural A.R. does
   not apply in Rifts. Issue #44's contrary wording is stale and will be corrected.
5. **M.D.C. fails safely.** M.D. weapons and M.D.C.-protected targets are visible
   but cannot enter this resolver. Refusal happens before dice or state changes.
6. **GM context is explicit and recorded.** Situational facts and modifiers are
   inputs, not hidden assumptions or client-side arithmetic.
7. **State drift invalidates the exchange.** A response never lands against a
   changed weapon, build, armor layer, or damage pool.

## Printed rules evidence

All facts were checked visually against rendered pages of the scanned local Rifts
Ultimate Edition rulebook. The PDF has no usable text layer.

| Printed page | Rule used in this design                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 287          | Physical S.D.C. is depleted before Hit Points. Artificial S.D.C. armor has A.R. plus an ablative S.D.C. pool. A strike at or below A.R. damages armor; a strike above A.R. damages the wearer. Depleted armor stops protecting future hits. |
| 288          | One M.D. equals 100 S.D.C.; M.D.C. armor is generally impervious to S.D.C./Hit Point damage and has no A.R. Full interaction is outside this slice.                                                                                         |
| 339          | The attacker rolls first. A total of 1-4 misses in ordinary combat. Artificial S.D.C. armor routing uses the completed strike total. The page explicitly says Natural A.R. does not apply in Rifts.                                         |
| 340          | A natural 20 is a critical unless met by a natural-20 defense. Defenders may choose parry or dodge. Trained parry is action-free; untrained parry costs the next action. Bare-handed weapon parries receive no normal parry bonus.          |
| 341          | Handheld melee weapons add applicable P.S./Hand-to-Hand damage bonuses. Add bonuses before critical multiplication. Dodging costs an action; automatic dodge does not.                                                                      |
| 344          | Automatic dodge is an explicit ability, not an automatic success, and uses only bonuses that specifically apply to it.                                                                                                                      |
| 345-346      | Dodge ties favor the defender. A roll of 1 always misses. A natural 20 can only be beaten by a natural-20 defense.                                                                                                                          |
| 355          | The last point of armor absorbs the entire destroying hit. Subsequent attacks reach the wearer. This supports the same no-spill rule used for S.D.C. armor.                                                                                 |
| 360-361      | Modern firearms do not use P.P. or general Hand-to-Hand strike bonuses. Ranged attacks normally require 8+ to strike. Gunfire may be dodged only when seen/anticipated, with point-blank and close-range penalties.                         |

The existing p.346 constants remain page-stamped content. New ranged-target and
range-penalty constants must also live in page-stamped, load-validated content
rather than source-code literals.

## Scope

### In scope

- Owned knife and axe attacks as melee S.D.C. weapon attacks.
- Owned handgun and submachine-gun attacks as ranged S.D.C. weapon attacks.
- Current untrained firearm behavior plus any already-modeled, specifically named
  gun bonus such as `strikeGuns`.
- Server-controlled strike, defense, and damage dice.
- Parry, dodge, automatic dodge, and taking the hit.
- GM-declared awareness, parry mode, range band, and situational modifiers.
- Artificial S.D.C. armor A.R. and ablation in the pure rules layer.
- Unarmored S.D.C./Hit Point application in the live backend.
- S.D.C. armor persistence automatically when page-stamped S.D.C. armor content
  becomes available.
- M.D.C. boundary messages and a dedicated follow-up tracker.
- Persisted incoming/outgoing/recent exchange UI.

### Out of scope

- M.D.-to-M.D.C. damage, S.D.C.-to-M.D.C. conversion, impervious armor, and the
  usually-lethal result of M.D. against an unprotected mortal.
- Natural A.R.; it does not apply in this rulebook's Rifts combat rules.
- Initiative, melee rounds, attacks-per-melee expenditure, or turn enforcement.
- Authentication, player ownership, GM roles, permissions, and adversarial clients.
- VTT maps, measured distance, line-of-sight geometry, or cover geometry.
- Called/aimed shots, bursts, payload tracking, thrown weapon modes, hit locations,
  paired weapons, entangle, disarm, roll with impact, and weapon breakage.
- Unarmed strikes and special Hand-to-Hand moves.
- Long-term combat-log retention or encounter archival policy.
- A generic spell attack/effect interpreter.

## Architecture

The feature has three boundaries with one-directional authority:

```text
page-stamped content + pure rules
             |
             v
Convex exchange ledger + atomic mutations
             |
             v
SolidJS declaration/response/history UI
```

### Rules package

The existing `resolveStrike(input)` remains the low-level opposed-roll primitive.
A new pure combat-exchange layer sits above it and owns:

- attack classification;
- melee versus ranged minimum strike totals;
- attacker and defender bonus selection;
- legal defense enumeration and action-cost metadata;
- critical damage multiplication;
- protection classification;
- artificial S.D.C. armor routing; and
- pure body/armor result calculation.

The layer accepts already-derived sheets, explicit GM context, completed rolls, and
damage input. It never reads Convex, generates identifiers, or mutates a character.
Random rolls remain injectable at the function boundary.

### Backend

Convex owns exchange identity, synchronization, dice, immutable outcome records,
and the character write. The response mutation reloads and re-derives both
characters before it applies anything.

### Web

SolidJS presents server-derived options and results. It does not reproduce bonus,
A.R., critical, or routing calculations. Client state is limited to an unsubmitted
declaration/response form and in-flight ownership tokens.

## Pure rules model

### Attack classification

Weapon category defines attack kind; damage type defines tier support.

| Weapon category               | Attack kind | #44 support                                    |
| ----------------------------- | ----------- | ---------------------------------------------- |
| `knife`, `axe`                | melee       | Supported when damage type is `sdc`            |
| `handgun`, `submachineGun`    | ranged      | Supported when damage type is `sdc`            |
| `energyPistol`, `energyRifle` | ranged      | Refused because current catalog damage is `md` |

Thrown use of a knife or axe is not inferred from category. It requires a future
explicit attack mode and is outside this slice.

### Attack profile

The engine derives a profile containing at least:

- attack kind;
- minimum successful strike total;
- base strike bonus and named sources;
- damage formula;
- applicable flat damage bonus;
- critical threshold;
- damage type;
- weapon index and instance snapshot; and
- a supported/refused result with a stable reason code.

Melee uses the normal derived strike and damage bonuses. Ranged uses only bonuses
that specifically apply to guns. P.P. and general Hand-to-Hand strike or damage
bonuses never leak into firearms.

The current skill catalog contains no structured modern W.P. entries. Current
characters therefore fire as untrained shooters except for a separately modeled,
specifically named gun bonus already present in the combat profile. The design
leaves a typed proficiency-bonus seam but does not invent missing content.

### GM context

The declaration stores explicit situational context:

- `defenderAware`: whether the defender sees and knows the attack is coming;
- melee `parryMode`: `unavailable`, `standard`, or `bareHanded`;
- ranged `rangeBand`: `pointBlank`, `close`, or `normal`;
- optional `strikeModifier`; and
- `strikeModifierReason`, required when the modifier is nonzero.

A situational modifier must be a safe integer from -100 through +100 inclusive.
That application bound prevents corrupt or accidental extreme values; it does not
purport to be a printed rule. Book-defined modifiers such as ranged dodge penalties
are derived by the engine and are not re-entered as situational modifiers.

### Defense options

Each legal option includes its kind, derived bonus, action-cost metadata, and a
short explanation for the UI and persisted result.

#### Melee

- `parry` is offered only when `parryMode` is not `unavailable` and the defender
  is aware of the attack.
  - `standard` uses the derived parry bonus.
  - `bareHanded` uses no ordinary parry bonus against the weapon.
  - formal Hand-to-Hand training makes the parry action-free; otherwise the
    metadata records a one-action cost.
- `dodge` is offered when the defender is aware and records a one-action cost.
- `autoDodge` is offered only when the sheet explicitly grants that capability;
  it records zero action cost and uses only the automatic-dodge bonus.
- `none` is always available as “take the hit.”

#### Ranged

- Only dodge-family defense is available, and only when the defender is aware.
- The bonus excludes general Hand-to-Hand dodge bonuses.
- The engine applies the printed point-blank or close-range penalty from content.
- Automatic dodge is offered only if the sheet explicitly grants the capability;
  any bonus still obeys the ranged-defense bonus restrictions.
- `none` is always available.

The response may include a safe-integer `defenseModifier` with a required reason
when nonzero. The engine revalidates the selected option; the client cannot submit
an arbitrary defense kind or bonus.

### Resolution order

1. Validate the completed strike roll.
2. Apply natural-one and attack-kind minimum-total rules.
3. Resolve an authorized opposed defense with `resolveStrike`.
4. Determine critical state and multiplier.
5. Roll damage and add only the applicable flat damage bonus.
6. Apply the multiplier after the flat bonus.
7. Route a hit against current protection.
8. Return new pool values without mutating input.

### S.D.C. routing

Protection is classified as:

- `none` — damage personal S.D.C., then Hit Points;
- `sdcArmor` — compare completed strike total to A.R.; or
- `mdcArmor` — return `unsupportedMdcProtection` before rolling.

For nondepleted S.D.C. armor:

- strike total at or below A.R. routes the entire hit to armor;
- strike total above A.R. routes the entire hit to the wearer;
- armor floors at zero;
- a destroying hit never spills to the wearer; and
- a future attack treats zero-point armor as no protection.

The current production catalog contains no page-stamped S.D.C. armor suit. Pure
rules tests therefore exercise this branch with validated fixtures. The backend
uses the same generic path and will activate it without redesign when real content
exists.

## Persisted exchange model

A new `combatExchanges` table stores a queryable ledger. Its validator mirrors a
discriminated status model rather than a loose object with contradictory optional
fields.

Shared fields include:

- attacker and defender character IDs;
- attacker/defender display names captured for history;
- weapon index, item ID, display name, and expected instance snapshot;
- attack kind and damage type;
- GM context;
- attacker and defender combat-state tokens;
- completed server strike roll;
- status; and
- Convex creation time.

Statuses are:

- `pendingDefense` — a potential hit awaits a response;
- `resolved` — miss, defended attack, or applied hit with immutable details;
- `cancelled` — withdrawn before response; and
- `stale` — relevant character state changed before response.

Resolved details include the chosen defense, completed defense roll when present,
critical state, detailed damage roll, total damage, routed pool, previous and next
pool values, and a stable outcome/reason code.

Indexes support bounded queries for:

- pending exchanges by defender;
- pending/outgoing exchanges by attacker; and
- recent exchanges involving a character.

Queries always use hard limits. Records are not automatically deleted in this
slice; long-term retention belongs to the future encounter/history design.

## Combat-state tokens

The declaration stores deterministic tokens made from only combat-relevant state.
They are stale-state guards, not hashes for authorization or secrecy.

The attacker token covers:

- level, attributes, Hand-to-Hand type, and derived combat profile;
- selected weapon index and expected item instance; and
- any future structured proficiency data consumed by the attack profile.

The defender token covers:

- level, attributes, Hand-to-Hand type, and relevant defensive profile;
- rolled/current S.D.C. and Hit Points;
- worn armor identity, instance state, maximum, current pool, tier, and A.R.; and
- any future structured defensive data consumed by option derivation.

Tokens use a stable serialization of an explicitly ordered value. Narrative,
P.P.E., unrelated inventory entries, and other noncombat changes do not stale an
exchange.

If either token differs at response time, the mutation records `stale` and returns
without applying damage. Resolving one hit may intentionally stale another pending
hit against the same old pools.

## Backend operations

### `combatTargets`

A bounded query returns other characters with only target-selection data:

- ID and display name;
- whether vitals are rolled and combat-ready; and
- protection tier (`none`, `sdcArmor`, or `mdcArmor`).

The query supports good disabled-state copy, but the declaration mutation repeats
all validation. Self-targeting is refused.

### `declareAttack`

1. Load and derive attacker and defender.
2. Resolve and verify the indexed weapon against the client's expected instance.
3. Derive the attack profile and defender protection.
4. Validate GM context and modifier reason.
5. Refuse unsupported M.D. or M.D.C. state before dice or inserts.
6. Compute combat-state tokens.
7. Roll the strike with Convex's replay-safe mutation randomness.
8. Record an immediate resolved miss or a pending defense.
9. Return the persisted exchange.

Even a successful strike with no active defense option remains pending with “take
the hit” as the only response. This preserves defender/GM acknowledgement and keeps
all successful strikes on the same two-phase path.

### `respondToAttack`

1. Load the pending exchange; reject resolved/cancelled/stale state.
2. Reload and re-derive both characters.
3. Recompute tokens and mark stale on mismatch.
4. Recompute legal defenses and validate the selected response.
5. Roll the defense when selected.
6. Resolve the opposed strike.
7. On a hit, roll damage and route it through the pure engine.
8. Revalidate the new defender through `deriveSheet`.
9. Patch the defender and finalize the exchange in the same transaction.

Convex mutation serialization ensures that only one concurrent response can win.
No mutation path leaves a finalized exchange without its matching pool update or a
pool update without its matching finalized exchange.

### `cancelAttack`

A pending exchange can be cancelled. Authentication is not yet present, so the
backend cannot enforce player-versus-GM ownership; that limitation is explicit and
belongs to the accounts/VTT authorization work.

### Existing direct damage

The current manual damage mutation remains a GM pool-adjustment utility and is not
called by hostile combat. The new exchange path never accepts client-routed damage.
Automated M.D.C. interaction remains refused even though a GM may continue to track
a displayed armor pool manually.

## Web experience

A new focused `CombatExchangePanel` lives at the top of the dossier's right-hand
command rail. It is separate from `SheetView` so the sheet component does not absorb
workflow, query, and mutation state.

### Declare attack

- Target selector excludes the current character.
- Weapon selector lists owned weapons and allows only supported S.D.C. weapons.
- M.D. weapons remain visible with a disabled follow-up explanation.
- Target readiness and M.D.C. protection appear before submission.
- Context controls are conditional: melee parry mode versus ranged range band,
  plus awareness and optional reasoned modifier.
- The primary command reads `DECLARE ATTACK`, not `DEAL DAMAGE`.

### Incoming attacks

- Pending attacks show attacker, weapon, natural die, bonus, total, and context.
- The defender sees the completed strike before choosing, matching the printed
  sequence.
- Only server-derived response options render as enabled commands.
- Each option shows its modifier and whether it consumes an action for manual
  table tracking.
- “Take the hit” is explicit and never represented as an accidental default.

### Recent exchanges

A bounded persisted list shows:

- miss, defended, hit, cancelled, or stale;
- strike and defense totals;
- critical state;
- damage formula/roll/total;
- armor/body routing; and
- the affected pool's remaining value.

Local telemetry also receives concise machine-voice lines, but persisted history is
the cross-client source of truth.

### Visual language and accessibility

- Amber: prompts and unresolved machine state.
- Red: hostile hits and damage.
- Green: successful defense or safe completion.
- No cyan: this workflow is not magic.
- Existing notched panels, HUD typography, focus treatment, and compact density.
- Native labels for every selector/input, keyboard-operable defense commands, clear
  disabled reasons, and live status/error announcements.

## Navigation and asynchronous ownership

Parameterized character routes do not remount. On route ID change, the combat panel
must:

- reset target, weapon, context, response draft, errors, and expanded history;
- re-key incoming/outgoing/history queries;
- advance a monotonic ownership token; and
- ignore late mutation results unless both route ID and exchange ID still match.

This follows the existing dossier rule: IDs and tokens own asynchronous work;
booleans do not.

## Error handling

Expected refusals use stable reason codes plus readable messages:

- `selfTarget`
- `attackerNotReady`
- `defenderNotReady`
- `weaponMissingOrChanged`
- `unsupportedWeaponMode`
- `unsupportedMdWeapon`
- `unsupportedMdcProtection`
- `invalidContext`
- `modifierReasonRequired`
- `illegalDefense`
- `exchangeNotPending`
- `combatStateChanged`
- `characterMissing`

Invalid declarations create no exchange. Invalid responses change neither exchange
nor character. State-token mismatch is different: it deliberately finalizes the
pending record as `stale` so every participant can see why it cannot resolve.

## Testing strategy

### Rules package

Tests pin printed values and exercise:

- melee 5+ and ranged 8+ strike thresholds;
- natural 1/natural 20 and defense tie behavior;
- weapon category and damage-tier classification;
- no P.P./general H2H leakage into firearm strike or damage;
- standard and bare-handed parry bonuses/action metadata;
- dodge and automatic-dodge capability/action metadata;
- ranged awareness and distance penalties;
- optional reasoned situational modifiers;
- critical multiplication after applicable melee damage bonus;
- A.R. equality, penetration, depleted armor, and no-spill destruction;
- pure body S.D.C.-then-Hit-Point damage; and
- refusal of M.D. weapons and M.D.C. protection.

Pure exchange tests use injected RNG sequences so every branch has deterministic
strike, defense, and detailed damage assertions.

### Backend

Convex tests cover:

- target summaries and self-exclusion;
- declaration validation and server rolls;
- immediate resolved misses;
- pending strikes and all legal response kinds;
- atomic hit plus exchange finalization;
- cancellation and immutable final states;
- concurrent responses where only one wins;
- attacker and defender token drift;
- unrelated narrative changes that do not stale combat;
- M.D.C. and unrolled-vitals refusal with no insert or pool change; and
- bounded incoming/outgoing/recent queries.

Backend tests assert invariants from returned server rolls instead of accepting
client-supplied dice. Specific roll ordering remains proven in the pure injected-RNG
tests.

### Web and live browser

Automated web checks cover form filtering, disabled reasons, option presentation,
route resets, and stale/late-result guards where practical in the current web test
setup.

Live verification uses at least two seeded characters and two dossiers:

1. Roll both characters' vitals.
2. Give the attacker an S.D.C. melee weapon and firearm.
3. Declare a melee attack and respond from the defender dossier.
4. Repeat until miss, defense, and hit result presentation have been observed.
5. Verify the body pools and persisted history update together.
6. Navigate between dossiers while a request is in flight and verify no state/log
   crosses ownership.
7. Equip M.D.C. armor on the defender and verify the declaration is disabled and
   server-refused if called directly.

The production catalog has no S.D.C. armor suit, so that routing branch is verified
in pure engine tests until valid page-stamped content activates it live.

## Validation gates

Before publication:

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

The exact task aliases must be confirmed against repository configuration before
execution. Root gates do not replace affected-package gates.

## Tracker and documentation delivery

Implementation delivery includes:

- correcting issue #44's natural-A.R. statement with rendered p.339 evidence;
- updating issue #44 with the approved S.D.C.-tier and persisted-exchange scope;
- creating a dedicated full-M.D.C. follow-up for conversion, impervious armor,
  final-blast absorption, depleted protection, unarmored lethal outcomes, and any
  required injury/death state;
- recording evidence-backed progress and verification totals; and
- opening a PR for Cubic review and human merge.

Issue #44 is not complete merely because local code exists. It is complete only
when implementation, package/root gates, live browser verification, tracker state,
and the PR review are genuinely aligned. The human maintainer remains the merger.

## Success criteria

- An attacker can declare a supported S.D.C. weapon attack against another ready,
  unprotected S.D.C. character.
- The strike is server-rolled and visible before the defender chooses.
- The defender sees only rules- and context-authorized responses and retains the
  choice to take the hit.
- A valid response resolves exactly once and atomically updates history and the
  correct target pool.
- Relevant state changes safely stale pending attacks; unrelated narrative edits do
  not.
- Artificial S.D.C. armor routing is pure, tested, and ready for future page-stamped
  content.
- M.D. weapons and M.D.C.-protected targets never enter S.D.C. arithmetic.
- No natural-A.R. behavior is added contrary to RUE p.339.
- Navigation cannot leak combat drafts, logs, or late results between characters.
- All affected package gates, root gates, and live-browser checks pass.
