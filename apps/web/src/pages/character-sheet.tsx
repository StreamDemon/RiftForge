import { api } from "@riftforge/backend/api";
import type { Id } from "@riftforge/backend/dataModel";
import {
  rollD20,
  rollSave,
  rollSkillCheck,
  type CharacterSheet,
  type Narrative,
} from "@riftforge/rules";
import { useParams } from "@solidjs/router";
import { createEffect, createSignal, Match, on, Show, Switch, type Accessor } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { NarrativeFields } from "../components/narrative-fields.tsx";
import { SheetView, type SheetActions } from "../components/sheet-view.tsx";
import { TelemetryRail } from "../components/telemetry-rail.tsx";
import { Alert, Button, MonoLabel, Panel } from "../components/ui.tsx";
import { convex } from "../lib/client.ts";
import { createMutation, createQuery } from "../lib/convex.ts";
import { fromNarrative, toNarrative } from "../lib/narrative.ts";
import { createTelemetry, d20Line, machineName } from "../lib/telemetry.ts";

/** Edit the player-authored file fields in place; saves via updateNarrative. */
function NarrativeEditor(props: { id: Id<"characters">; narrative: Narrative | undefined }) {
  const updateNarrative = createMutation(convex, api.characters.updateNarrative);
  const [open, setOpen] = createSignal(false);
  const [form, setForm] = createStore(fromNarrative(props.narrative));
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<Error>();

  // Never carry one character's draft into another's file: reset the form
  // whenever the route id changes, regardless of mount timing.
  createEffect(
    on(
      () => props.id,
      () => {
        setForm(reconcile(fromNarrative(props.narrative)));
        setOpen(false);
        setError(undefined);
      },
      { defer: true },
    ),
  );

  const save = async () => {
    if (saving()) return;
    setError(undefined);
    setSaving(true);
    try {
      await updateNarrative({ id: props.id, narrative: toNarrative({ ...form }) });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSaving(false);
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
 * (saves, skills, strikes, casts) run CLIENT-SIDE through the isomorphic
 * engine and print to the log — moments at the table, not records. Only
 * `rollVitals` persists, via its mutation.
 */
export function CharacterSheetPage() {
  const params = useParams<{ id: string }>();
  const id = () => params.id as Id<"characters">;
  const query = createQuery(convex, api.characters.sheet, () => ({ id: id() }));
  // `characters.sheet` validates as `v.any()` (shape owned by @riftforge/rules),
  // so re-pin the rules-layer type here.
  const sheet = query.data as Accessor<CharacterSheet | null | undefined>;
  const rollVitals = createMutation(convex, api.characters.rollVitals);
  const telemetry = createTelemetry(["// ley-link established", "// awaiting command…"]);
  const [rollError, setRollError] = createSignal<Error>();

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
      telemetry.log(`> CAST :: ${spell.name.toUpperCase()} — ${spell.ppe} P.P.E.`, "magic");
    },
    rollCombat: (kind, bonus) => {
      telemetry.log(`> ${kind.toUpperCase()} :: ${d20Line(rollD20(bonus))}`);
    },
  };

  const roll = async () => {
    setRollError(undefined);
    try {
      const rolled = await rollVitals({ id: id() });
      telemetry.log(
        `> ROLL VITALS :: H.P. ${rolled.hitPoints} · S.D.C. ${rolled.sdc}${rolled.ppe !== undefined ? ` · P.P.E. ${rolled.ppe}` : ""} — LOCKED`,
      );
    } catch (error) {
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
              <SheetView sheet={sheet()!} actions={actions} />
              <NarrativeEditor id={id()} narrative={sheet()?.narrative} />
            </div>
            <TelemetryRail
              entries={telemetry.entries()}
              actions={
                <div class="space-y-2">
                  <Button variant="primary" class="w-full text-left" onClick={() => void roll()}>
                    {"> Roll Vitals"}
                  </Button>
                  <Show when={rollError()}>
                    {(err) => <Alert tone="danger">ROLL FAILED — {err().message}</Alert>}
                  </Show>
                </div>
              }
            />
          </div>
        </Match>
      </Switch>
    </div>
  );
}
