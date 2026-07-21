import { api } from "@riftforge/backend/api";
import type { Id } from "@riftforge/backend/dataModel";
import {
  getItem,
  rollD20,
  rollDice,
  rollSave,
  rollSkillCheck,
  type CharacterSheet,
  type Narrative,
  type SheetEquipmentEntry,
  type Spell,
  type Weapon,
} from "@riftforge/rules";
import { useParams } from "@solidjs/router";
import {
  createEffect,
  createSignal,
  Match,
  on,
  onCleanup,
  Show,
  Switch,
  type Accessor,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { CombatExchangePanel } from "../components/combat-exchange-panel.tsx";
import { NarrativeFields } from "../components/narrative-fields.tsx";
import { SheetView, type SheetActions } from "../components/sheet-view.tsx";
import { TelemetryRail } from "../components/telemetry-rail.tsx";
import { Alert, Button, MonoLabel, Panel, TextInput, ToggleChip } from "../components/ui.tsx";
import { convex } from "../lib/client.ts";
import { createMutation, createQuery } from "../lib/convex.ts";
import { fromNarrative, toNarrative } from "../lib/narrative.ts";
import { createTelemetry, d20Line, machineName } from "../lib/telemetry.ts";

const TERMINAL_GAMEPLAY_REASON = "Life signs terminated; gameplay actions are unavailable.";

/** Edit the player-authored file fields in place; saves via updateNarrative. */
function NarrativeEditor(props: { id: Id<"characters">; narrative: Narrative | undefined }) {
  const updateNarrative = createMutation(convex, api.characters.updateNarrative);
  const [open, setOpen] = createSignal(false);
  const [form, setForm] = createStore(fromNarrative(props.narrative));
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<Error>();
  let routeEpoch = 0;
  const ownsRoute = (owner: { routeId: Id<"characters">; routeEpoch: number }) =>
    owner.routeId === props.id && owner.routeEpoch === routeEpoch;

  // Never carry one character's draft into another's file: reset the form
  // whenever the route id changes, regardless of mount timing.
  createEffect(
    on(
      () => props.id,
      () => {
        routeEpoch += 1;
        setForm(reconcile(fromNarrative(props.narrative)));
        setOpen(false);
        setSaving(false);
        setError(undefined);
      },
      { defer: true },
    ),
  );
  onCleanup(() => {
    routeEpoch += 1;
  });

  const save = async () => {
    if (saving()) return;
    const owner = { routeId: props.id, routeEpoch };
    setError(undefined);
    setSaving(true);
    try {
      await updateNarrative({ id: owner.routeId, narrative: toNarrative({ ...form }) });
      if (!ownsRoute(owner)) return;
      setOpen(false);
    } catch (err) {
      if (!ownsRoute(owner)) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (ownsRoute(owner)) setSaving(false);
    }
  };

  return (
    <Panel class="p-4">
      <div class="flex items-baseline gap-3">
        <h2 class="font-display text-[17px] tracking-[0.12em] text-muted">
          <span class="text-dead">// </span>EDIT FILE
        </h2>
        <MonoLabel class="text-dead">EPITHET / APPEARANCE / TRAITS / BACKSTORY</MonoLabel>
        <Button
          variant="ghost"
          class="ml-auto"
          aria-expanded={open()}
          aria-controls="edit-file-fields"
          onClick={() => setOpen((v) => !v)}
        >
          {open() ? "close" : "open"}
        </Button>
      </div>
      <Show when={open()}>
        <div class="mt-3 space-y-3" id="edit-file-fields">
          <NarrativeFields form={form} onChange={(field, value) => setForm(field, value)} />
          <div class="flex items-center gap-3">
            <Button variant="primary" disabled={saving()} onClick={() => void save()}>
              {saving() ? "> Writing…" : "> Commit to File"}
            </Button>
            <Show when={error()}>
              {(err) => <Alert tone="danger">WRITE FAILED — {err().message}</Alert>}
            </Show>
          </div>
        </div>
      </Show>
    </Panel>
  );
}

/**
 * The dossier: the live sheet plus the field-telemetry rail. Gameplay rolls
 * (saves, skills, manual strikes, and weapon damage) are ephemeral client-side
 * utility telemetry. Hostile combat exchanges are server-owned and persisted;
 * resource and inventory commands also write through their mutations.
 */
export function CharacterSheetPage() {
  const params = useParams<{ id: string }>();
  const id = () => params.id as Id<"characters">;
  const query = createQuery(convex, api.characters.sheet, () => ({ id: id() }));
  // `characters.sheet` validates as `v.any()` (shape owned by @riftforge/rules),
  // so re-pin the rules-layer type here.
  const sheet = query.data as Accessor<CharacterSheet | null | undefined>;
  const gameplayDisabledReason = () =>
    sheet()?.vitals.lifeState === "dead" ? TERMINAL_GAMEPLAY_REASON : undefined;
  const rollVitals = createMutation(convex, api.characters.rollVitals);
  const castSpellMutation = createMutation(convex, api.characters.castSpell);
  const applyDamageMutation = createMutation(convex, api.characters.applyDamage);
  const restoreVitals = createMutation(convex, api.characters.restoreVitals);
  const restMutation = createMutation(convex, api.characters.rest);
  const leyLineDrawMutation = createMutation(convex, api.characters.leyLineDraw);
  const treatMutation = createMutation(convex, api.characters.treat);
  const addItemMutation = createMutation(convex, api.characters.addItem);
  const removeItemMutation = createMutation(convex, api.characters.removeItem);
  const equipArmorMutation = createMutation(convex, api.characters.equipArmor);
  const telemetry = createTelemetry(["// ley-link established", "// awaiting command…"]);
  const [rollError, setRollError] = createSignal<Error>();
  const [damageInput, setDamageInput] = createSignal("");
  // Where the hit lands: the body pools, or the worn armor's own layer.
  // WHICH hits strike armor (strike-vs-A.R.) is GM adjudication for now.
  const [toArmor, setToArmor] = createSignal(false);
  const [restHours, setRestHours] = createSignal("");
  const [atNexus, setAtNexus] = createSignal(false);
  const [professional, setProfessional] = createSignal(false);
  // The treatment-course position lives on the DOCUMENT (`current.
  // treatmentDays`) — it survives reloads and clears with a full restore or
  // vitals reroll. `dayInput` is the GM override: "" follows the stored
  // course (next day = stored + 1); a typed value declares which course day
  // this is (e.g. a new injury course). `treating` serializes clicks: two
  // in-flight calls would apply the same day twice.
  const [dayInput, setDayInput] = createSignal("");
  const [treating, setTreating] = createSignal(false);
  // Monotonic token naming the request that holds the `treating` gate. Newer
  // requests and route changes bump it, so a stale settle can never release a
  // gate it no longer owns — not even back on the same dossier.
  let treatToken = 0;
  let routeEpoch = 0;
  const routeOwner = () => ({ routeId: id(), routeEpoch });
  const ownsRoute = (owner: ReturnType<typeof routeOwner>) =>
    owner.routeId === id() && owner.routeEpoch === routeEpoch;

  // A new dossier starts with a fresh log: rolls belong to the character
  // they were rolled for, not whoever the page shows next.
  createEffect(
    on(
      id,
      () => {
        routeEpoch += 1;
        telemetry.reset();
        setRollError(undefined);
        setDamageInput("");
        setToArmor(false);
        setRestHours("");
        setAtNexus(false);
        setProfessional(false);
        setDayInput("");
        treatToken++;
        setTreating(false);
      },
      { defer: true },
    ),
  );
  onCleanup(() => {
    routeEpoch += 1;
    treatToken += 1;
  });

  /** Convex mutation errors carry an "Uncaught Error: …" preamble — strip to the message. */
  const reason = (error: unknown): string => {
    const text = error instanceof Error ? error.message : String(error);
    return text
      .replace(/^.*Uncaught Error:\s*/s, "")
      .split("\n")[0]!
      .trim();
  };

  // Casting SPENDS — the server derives the cost and refuses what the
  // character can't afford. Like all persisting actions, a result that comes
  // back after the dossier switched characters is dropped.
  const cast = async (spell: Spell) => {
    const owner = routeOwner();
    // Exclusive either/or heals (Light Healing) need a pool choice: prefer
    // the wounded pool (H.P. if down, else S.D.C.) of the character the heal
    // LANDS on. Today that is always the caster (`sheet()`), and the only
    // exclusive spell is also others-only, so the server refuses the cast
    // before the pool matters — but when the VTT target picker arrives, this
    // MUST read the TARGET's vitals instead.
    let healPool: "hitPoints" | "sdc" | undefined;
    if (spell.healing?.exclusive) {
      const hp = sheet()?.vitals.hitPoints;
      healPool =
        hp?.rolled !== undefined && (hp.current ?? hp.rolled) < hp.rolled ? "hitPoints" : "sdc";
    }
    try {
      const result = await castSpellMutation({
        id: owner.routeId,
        spellId: spell.id,
        ...(healPool !== undefined ? { healPool } : {}),
      });
      if (!ownsRoute(owner)) return;
      // Healing spells report what actually landed (post-clamp), per pool.
      const healed = result.healed
        ? ` → ${[
            result.healed.hitPoints !== undefined ? `H.P. +${result.healed.hitPoints}` : undefined,
            result.healed.sdc !== undefined ? `S.D.C. +${result.healed.sdc}` : undefined,
          ]
            .filter(Boolean)
            .join(" · ")}`
        : "";
      telemetry.log(
        `> CAST :: ${spell.name.toUpperCase()} — ${result.spent} P.P.E. [${result.ppe.current}/${result.ppe.max}]${healed}`,
        "magic",
      );
    } catch (error) {
      if (!ownsRoute(owner)) return;
      telemetry.log(`> CAST :: ${spell.name.toUpperCase()} — REFUSED (${reason(error)})`, "bad");
    }
  };

  // Recovery names TIME (hours, melees, days) — the server owns the rates and
  // clamps at the rolled maximums; the log reports what actually landed.
  const rest = async (mode: "rest" | "meditation") => {
    const verb = mode === "meditation" ? "MEDITATE" : "REST";
    // Strict parse, like damage: "3.5" and "3abc" are refused, not truncated.
    const raw = restHours().trim();
    const hours = Number(raw);
    if (raw === "" || !Number.isInteger(hours) || hours <= 0) {
      if (raw !== "") {
        telemetry.log(`> ${verb} :: REFUSED (not a whole number of hours: "${raw}")`, "bad");
      }
      return;
    }
    const owner = routeOwner();
    try {
      const result = await restMutation({ id: owner.routeId, hours, mode });
      if (!ownsRoute(owner)) return;
      setRestHours("");
      telemetry.log(
        `> ${verb} :: ${hours} HR — P.P.E. +${result.gained} [${result.ppe.current}/${result.ppe.max}]`,
        "magic",
      );
    } catch (error) {
      if (!ownsRoute(owner)) return;
      telemetry.log(`> ${verb} :: REFUSED (${reason(error)})`, "bad");
    }
  };

  const leyDraw = async () => {
    const owner = routeOwner();
    const nexus = atNexus();
    try {
      const result = await leyLineDrawMutation({ id: owner.routeId, melees: 1, atNexus: nexus });
      if (!ownsRoute(owner)) return;
      telemetry.log(
        `> LEY DRAW${nexus ? " (NEXUS)" : ""} :: +${result.gained} P.P.E. [${result.ppe.current}/${result.ppe.max}]`,
        "magic",
      );
    } catch (error) {
      if (!ownsRoute(owner)) return;
      telemetry.log(`> LEY DRAW :: REFUSED (${reason(error)})`, "bad");
    }
  };

  const treatDay = async () => {
    if (treating()) return;
    // Strict parse, like damage/hours: only a whole positive day number counts
    // as a GM override; an untouched input follows the stored course.
    const raw = dayInput().trim();
    const override = raw === "" ? undefined : Number(raw);
    if (override !== undefined && (!Number.isInteger(override) || override <= 0)) {
      telemetry.log(`> TREATMENT :: REFUSED (not a whole day number: "${raw}")`, "bad");
      return;
    }
    setTreating(true);
    const token = ++treatToken;
    const owner = routeOwner();
    const pro = professional();
    try {
      const result = await treatMutation({
        id: owner.routeId,
        professional: pro,
        ...(override !== undefined ? { day: override } : {}),
      });
      if (!ownsRoute(owner)) return;
      setDayInput(""); // back to following the stored course
      telemetry.log(
        `> TREATMENT :: DAY ${result.day}${pro ? " (PRO)" : ""} — H.P. +${result.gained.hitPoints} · S.D.C. +${result.gained.sdc}`,
        "good",
      );
    } catch (error) {
      if (!ownsRoute(owner)) return;
      telemetry.log(`> TREATMENT :: REFUSED (${reason(error)})`, "bad");
    } finally {
      // Only the gate's current owner may release it: a stale settle must not
      // unlock a treat a newer request has in flight.
      if (ownsRoute(owner) && token === treatToken) setTreating(false);
    }
  };

  const damage = async () => {
    // Strict parse: `Number` (unlike `parseInt`) makes "3.5" and "3abc"
    // fail the integer check instead of silently truncating to 3.
    const raw = damageInput().trim();
    const amount = Number(raw);
    if (raw === "" || !Number.isInteger(amount) || amount <= 0) {
      if (raw !== "") telemetry.log(`> DAMAGE :: REFUSED (not a whole number: "${raw}")`, "bad");
      return;
    }
    const owner = routeOwner();
    const strikesArmor = toArmor();
    try {
      const next = await applyDamageMutation({
        id: owner.routeId,
        amount,
        ...(strikesArmor ? { toArmor: true } : {}),
      });
      if (!ownsRoute(owner)) return;
      setDamageInput("");
      telemetry.log(
        "armor" in next
          ? `> DAMAGE (ARMOR) :: ${amount} — ARMOR ${next.armor}`
          : `> DAMAGE :: ${amount} — S.D.C. ${next.sdc} · H.P. ${next.hitPoints}`,
        "bad",
      );
    } catch (error) {
      if (!ownsRoute(owner)) return;
      telemetry.log(`> DAMAGE :: REFUSED (${reason(error)})`, "bad");
    }
  };

  // Inventory writes persist; like every persisting action, a result that
  // arrives after the dossier switched characters is dropped.
  const acquire = async (itemId: string) => {
    const owner = routeOwner();
    const name = (getItem(itemId)?.name ?? itemId).toUpperCase();
    try {
      const result = await addItemMutation({ id: owner.routeId, itemId });
      if (!ownsRoute(owner)) return;
      // Dice-capacity suits (LLW concealed) are rated at acquisition.
      telemetry.log(
        `> ACQUIRE :: ${name}${result.rolledMdc !== undefined ? ` — SUIT RATED ${result.rolledMdc} M.D.C.` : ""}`,
        "good",
      );
    } catch (error) {
      if (!ownsRoute(owner)) return;
      telemetry.log(`> ACQUIRE :: ${name} — REFUSED (${reason(error)})`, "bad");
    }
  };

  // The instance state the click targeted — the server refuses the write if
  // the manifest shifted under an in-flight request (index races).
  const expectOf = (entry: SheetEquipmentEntry) => ({
    itemId: entry.item.id,
    ...(entry.worn === true ? { worn: true } : {}),
    ...(entry.rolledMdc !== undefined ? { rolledMdc: entry.rolledMdc } : {}),
  });

  const discard = async (index: number, entry: SheetEquipmentEntry) => {
    const owner = routeOwner();
    const name = entry.item.name.toUpperCase();
    try {
      await removeItemMutation({ id: owner.routeId, index, expect: expectOf(entry) });
      if (!ownsRoute(owner)) return;
      telemetry.log(`> DISCARD :: ${name}`);
    } catch (error) {
      if (!ownsRoute(owner)) return;
      telemetry.log(`> DISCARD :: ${name} — REFUSED (${reason(error)})`, "bad");
    }
  };

  const equip = async (index: number | null, entry?: SheetEquipmentEntry) => {
    const owner = routeOwner();
    const name = entry?.item.name.toUpperCase();
    try {
      // Wear and doff both name the instance the click saw: doffing verifies
      // the WORN suit, so a racing swap can't be unequipped blind.
      await equipArmorMutation({
        id: owner.routeId,
        index,
        ...(entry !== undefined ? { expect: expectOf(entry) } : {}),
      });
      if (!ownsRoute(owner)) return;
      telemetry.log(index === null ? "> DOFF :: ARMOR OFFLINE" : `> EQUIP :: ${name} — WORN`);
    } catch (error) {
      if (!ownsRoute(owner)) return;
      telemetry.log(`> EQUIP :: ${name ?? "—"} — REFUSED (${reason(error)})`, "bad");
    }
  };

  const restore = async () => {
    const owner = routeOwner();
    try {
      await restoreVitals({ id: owner.routeId });
      if (!ownsRoute(owner)) return;
      telemetry.log("> RESTORE :: ALL POOLS FULL", "good");
    } catch (error) {
      if (!ownsRoute(owner)) return;
      telemetry.log(`> RESTORE :: REFUSED (${reason(error)})`, "bad");
    }
  };

  const actions: SheetActions = {
    rollSave: (name, save) => {
      const roll = rollSave(save);
      telemetry.log(
        `> SAVE VS ${machineName(name)} :: ${d20Line(roll)}`,
        roll.success === undefined ? "machine" : roll.success ? "good" : "bad",
      );
    },
    rollSkill: (skill) => {
      const check = rollSkillCheck(skill.value);
      const label = skill.label ? ` (${skill.label.toUpperCase()})` : "";
      telemetry.log(
        `> SKILL :: ${skill.name.toUpperCase()}${label} d%[${check.roll}] vs ${check.value}% ${check.success ? "✓" : "✗"}`,
        check.success ? "good" : "bad",
      );
    },
    castSpell: (spell) => {
      void cast(spell);
    },
    rollCombat: (kind, bonus) => {
      telemetry.log(`> ${kind.toUpperCase()} :: ${d20Line(rollD20(bonus))}`);
    },
    // Weapon damage is table telemetry, not a persisted write — the rolled
    // points go through the Damage control on whoever they actually hit.
    rollWeapon: (weapon: Weapon) => {
      const total = rollDice(weapon.damage.formula);
      const unit = weapon.damage.type === "md" ? "M.D." : "S.D.C.";
      telemetry.log(
        `> WEAPON :: ${weapon.name.toUpperCase()} — ${weapon.damage.formula} = ${total} ${unit}`,
      );
    },
    acquireItem: (itemId) => {
      void acquire(itemId);
    },
    discardItem: (index, entry) => {
      void discard(index, entry);
    },
    equipArmor: (index, entry) => {
      void equip(index, entry);
    },
  };

  const roll = async () => {
    // If the dossier switches while the mutation is in flight, the result
    // belongs to the character it was rolled for — drop it silently.
    const owner = routeOwner();
    setRollError(undefined);
    try {
      const rolled = await rollVitals({ id: owner.routeId });
      if (!ownsRoute(owner)) return;
      telemetry.log(
        `> ROLL VITALS :: H.P. ${rolled.hitPoints} · S.D.C. ${rolled.sdc}${rolled.ppe !== undefined ? ` · P.P.E. ${rolled.ppe}` : ""} — LOCKED`,
      );
    } catch (error) {
      if (!ownsRoute(owner)) return;
      setRollError(error instanceof Error ? error : new Error(String(error)));
      telemetry.log("> ROLL VITALS :: WRITE FAILED", "bad");
    }
  };

  return (
    <div class="mx-auto max-w-6xl">
      <Switch fallback={<p class="font-mono text-[12.5px] text-muted">// loading dossier…</p>}>
        <Match when={query.error()}>
          {(err) => <Alert tone="danger">COULDN'T LOAD DOSSIER — {err().message}</Alert>}
        </Match>
        <Match when={sheet() === null}>
          <Alert tone="warn">NO FILE ON RECORD.</Alert>
        </Match>
        <Match when={sheet() != null}>
          {/* Non-keyed on purpose: subscription updates flow through
            fine-grained reactivity instead of remounting the sheet, so the
              strike flash can see values change and editor state survives. */}
          <div class="gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_300px]">
            <div class="min-w-0 space-y-4">
              <SheetView
                sheet={sheet()!}
                actions={actions}
                gameplayDisabledReason={gameplayDisabledReason()}
              />
              <NarrativeEditor id={id()} narrative={sheet()?.narrative} />
            </div>
            <aside class="min-w-0 space-y-3" aria-label="Dossier command rail">
              <CombatExchangePanel
                characterId={id()}
                sheet={sheet()!}
                gameplayDisabledReason={gameplayDisabledReason()}
                onTelemetry={telemetry.log}
              />
              <TelemetryRail
                entries={telemetry.entries()}
                actions={
                  <Show
                    when={gameplayDisabledReason()}
                    fallback={
                      <div class="space-y-2">
                        <Button
                          variant="primary"
                          class="w-full text-left"
                          onClick={() => void roll()}
                        >
                          {"> Roll Vitals"}
                        </Button>
                        <Show when={rollError()}>
                          {(err) => <Alert tone="danger">ROLL FAILED — {err().message}</Alert>}
                        </Show>
                        <div class="flex gap-2">
                          <TextInput
                            aria-label="Damage amount"
                            inputmode="numeric"
                            placeholder="DMG"
                            class="w-16 min-w-0 px-2 py-1.5 text-center"
                            value={damageInput()}
                            onInput={(e) => setDamageInput(e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void damage();
                            }}
                          />
                          <Button class="flex-1 px-2 text-left" onClick={() => void damage()}>
                            {"> Damage"}
                          </Button>
                          <ToggleChip pressed={toArmor()} onToggle={() => setToArmor((v) => !v)}>
                            Armor
                          </ToggleChip>
                        </div>
                        <Button class="w-full text-left" onClick={() => void restore()}>
                          {"> Full Restore"}
                        </Button>
                        <div class="space-y-2 border-t border-line pt-2">
                          <MonoLabel class="block text-dead">RECOVERY</MonoLabel>
                          <Show when={sheet()?.ppe}>
                            <div class="flex gap-2">
                              <TextInput
                                aria-label="Hours of rest"
                                inputmode="numeric"
                                placeholder="HRS"
                                class="w-14 min-w-0 px-2 py-1.5 text-center"
                                value={restHours()}
                                onInput={(e) => setRestHours(e.currentTarget.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void rest("rest");
                                }}
                              />
                              <Button
                                class="flex-1 px-2 text-left"
                                onClick={() => void rest("rest")}
                              >
                                {"> Rest"}
                              </Button>
                              <Button
                                class="shrink-0 px-2 text-left whitespace-nowrap"
                                onClick={() => void rest("meditation")}
                              >
                                {"> Meditate"}
                              </Button>
                            </div>
                            <div class="flex gap-2">
                              <Button class="flex-1 px-2 text-left" onClick={() => void leyDraw()}>
                                {"> Ley Draw"}
                              </Button>
                              <ToggleChip
                                pressed={atNexus()}
                                onToggle={() => setAtNexus((v) => !v)}
                                tone="ley"
                              >
                                Nexus
                              </ToggleChip>
                            </div>
                          </Show>
                          <div class="flex gap-2">
                            <TextInput
                              aria-label="Treatment day"
                              inputmode="numeric"
                              class="w-14 min-w-0 px-2 py-1.5 text-center"
                              value={
                                dayInput() !== ""
                                  ? dayInput()
                                  : String((sheet()?.vitals.treatmentDays ?? 0) + 1)
                              }
                              onInput={(e) => setDayInput(e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void treatDay();
                              }}
                            />
                            <Button class="flex-1 px-2 text-left" onClick={() => void treatDay()}>
                              {"> Treatment Day"}
                            </Button>
                            <ToggleChip
                              pressed={professional()}
                              onToggle={() => setProfessional((v) => !v)}
                            >
                              Pro
                            </ToggleChip>
                          </div>
                        </div>
                      </div>
                    }
                  >
                    {(reason) => (
                      <Alert tone="danger">
                        <MonoLabel class="mr-2 !text-inherit">LIFE SIGNS TERMINATED</MonoLabel>
                        {reason()}
                      </Alert>
                    )}
                  </Show>
                }
              />
            </aside>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
