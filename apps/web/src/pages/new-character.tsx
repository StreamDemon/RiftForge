import { api } from "@riftforge/backend/api";
import { useNavigate } from "@solidjs/router";
import { createMemo, createSignal, For, Show, Switch, Match } from "solid-js";
import { AlignmentStep } from "../builder/steps/alignment.tsx";
import { AttributesStep } from "../builder/steps/attributes.tsx";
import { IdentityStep } from "../builder/steps/identity.tsx";
import { OccSkillsStep } from "../builder/steps/occ-skills.tsx";
import { OccStep } from "../builder/steps/occ.tsx";
import { PsionicsStep } from "../builder/steps/psionics.tsx";
import { RelatedSkillsStep } from "../builder/steps/related-skills.tsx";
import { ReviewStep } from "../builder/steps/review.tsx";
import { SpellsStep } from "../builder/steps/spells.tsx";
import { createBuilderStore, stepValidity } from "../builder/store.ts";
import { Alert, Button, MonoLabel } from "../components/ui.tsx";
import { convex } from "../lib/client.ts";
import { createMutation } from "../lib/convex.ts";

/** The guided builder (#9): blank slate to a rules-legal level-1 character. */
export function NewCharacterPage() {
  const store = createBuilderStore();
  const validity = stepValidity(store);
  const navigate = useNavigate();
  const create = createMutation(convex, api.characters.create);
  const [step, setStep] = createSignal(0);
  const [createError, setCreateError] = createSignal<Error>();
  const [submitting, setSubmitting] = createSignal(false);

  const steps = [
    { id: "identity", title: "Name", valid: validity.identity },
    { id: "attributes", title: "Attributes", valid: validity.attributes },
    { id: "occ", title: "O.C.C.", valid: validity.occ },
    { id: "alignment", title: "Alignment", valid: validity.alignment },
    { id: "psionics", title: "Psionics", valid: validity.psionics },
    { id: "occSkills", title: "O.C.C. skills", valid: validity.occSkills },
    { id: "skills", title: "Related & secondary", valid: validity.skills },
    { id: "spells", title: "Spells", valid: validity.spells },
    { id: "review", title: "Review", valid: validity.review },
  ] as const;

  const current = () => steps[step()]!;
  const isLast = () => step() === steps.length - 1;
  const canAdvance = createMemo(() => current().valid());

  const submit = async () => {
    const input = store.characterInput();
    if (!input || submitting()) return;
    setCreateError(undefined);
    setSubmitting(true);
    try {
      const id = await create(input);
      navigate(`/characters/${id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div class="mx-auto max-w-4xl space-y-4">
      <div>
        <MonoLabel>CHARACTER FORGE // BOOT SEQUENCE</MonoLabel>
        <h1 class="font-display text-4xl tracking-[0.02em]">NEW FILE</h1>
      </div>
      <ol class="flex flex-wrap gap-x-4 gap-y-1 border border-line bg-surface px-4 py-2.5 font-mono text-[12px]">
        <For each={steps}>
          {(entry, index) => (
            <li
              classList={{
                "text-amber [text-shadow:0_0_8px_rgb(255_174_61/0.5)]": index() === step(),
                "text-ok": index() < step(),
                "text-dead": index() > step(),
              }}
            >
              <Show
                when={index() === step()}
                fallback={
                  <>
                    {String(index() + 1).padStart(2, "0")} {entry.title.toUpperCase()}
                    {index() < step() ? " ✓" : ""}
                  </>
                }
              >
                ▸ {String(index() + 1).padStart(2, "0")}/{String(steps.length).padStart(2, "0")} ::{" "}
                {entry.title.toUpperCase()}
              </Show>
            </li>
          )}
        </For>
      </ol>

      <Switch>
        <Match when={current().id === "identity"}>
          <IdentityStep store={store} />
        </Match>
        <Match when={current().id === "attributes"}>
          <AttributesStep store={store} />
        </Match>
        <Match when={current().id === "occ"}>
          <OccStep store={store} />
        </Match>
        <Match when={current().id === "alignment"}>
          <AlignmentStep store={store} />
        </Match>
        <Match when={current().id === "psionics"}>
          <PsionicsStep store={store} />
        </Match>
        <Match when={current().id === "occSkills"}>
          <OccSkillsStep store={store} />
        </Match>
        <Match when={current().id === "skills"}>
          <RelatedSkillsStep store={store} />
        </Match>
        <Match when={current().id === "spells"}>
          <SpellsStep store={store} />
        </Match>
        <Match when={current().id === "review"}>
          <ReviewStep store={store} />
        </Match>
      </Switch>

      <div class="flex gap-2">
        <Button disabled={step() === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          Back
        </Button>
        <Show
          when={isLast()}
          fallback={
            <Button
              variant="primary"
              disabled={!canAdvance()}
              onClick={() => setStep((s) => s + 1)}
            >
              Next
            </Button>
          }
        >
          <Button
            variant="primary"
            disabled={!canAdvance() || submitting()}
            onClick={() => void submit()}
          >
            {submitting() ? "> Forging…" : "> Forge Character"}
          </Button>
        </Show>
      </div>
      <Show when={createError()}>
        {(err) => <Alert tone="danger">FORGE FAILED — {err().message}</Alert>}
      </Show>
    </div>
  );
}
