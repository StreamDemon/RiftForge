import {
  occSkillPlan,
  relatedSkillPlan,
  secondarySkillPlan,
  type Skill,
  type SkillPick,
} from "@riftforge/rules";
import { createMemo, For, Show } from "solid-js";
import { Alert, Panel } from "../../components/ui.tsx";
import type { BuilderStore } from "../store.ts";

function groupByCategory(skills: Skill[]): [string, Skill[]][] {
  const groups = new Map<string, Skill[]>();
  for (const skill of skills) {
    const list = groups.get(skill.category) ?? [];
    list.push(skill);
    groups.set(skill.category, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function CheckboxPool(props: {
  options: Skill[];
  picks: SkillPick[];
  max: number;
  bonuses?: Record<string, number>;
  onToggle: (skillId: string) => void;
}) {
  return (
    <div class="mt-2 grid gap-x-8 gap-y-3 md:grid-cols-2">
      <For each={groupByCategory(props.options)}>
        {([category, skills]) => (
          <div>
            <h4 class="font-mono text-[11.5px] tracking-[0.12em] text-muted uppercase">
              {category}
              <Show when={props.bonuses?.[category]}>
                <span class="text-amber"> +{props.bonuses![category]}%</span>
              </Show>
            </h4>
            <div class="mt-1 space-y-0.5">
              <For each={skills}>
                {(skill) => (
                  <label class="flex cursor-pointer items-center gap-2 font-mono text-[13px] hover:text-amber">
                    <input
                      type="checkbox"
                      class="accent-amber"
                      checked={props.picks.some((p) => p.skillId === skill.id)}
                      onChange={() => props.onToggle(skill.id)}
                    />
                    {skill.name} <span class="text-dead">(base {skill.baseSkill}%)</span>
                  </label>
                )}
              </For>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

/** O.C.C. Related and Secondary skill picks, plus the hand-to-hand slot. */
export function RelatedSkillsStep(props: { store: BuilderStore }) {
  const occ = () => props.store.occ();
  const related = createMemo(() => {
    const chosen = occ();
    return chosen ? relatedSkillPlan(chosen) : undefined;
  });
  const secondary = createMemo(() => {
    const chosen = occ();
    return chosen ? secondarySkillPlan(chosen) : undefined;
  });
  const hth = createMemo(() => {
    const chosen = occ();
    return chosen ? occSkillPlan(chosen).hth : undefined;
  });

  const upgradeCost = createMemo(() => {
    const chosen = props.store.draft.hthId;
    const grant = hth();
    if (!grant || chosen === undefined || chosen === grant.hthId) return 0;
    return grant.upgrades.find((u) => u.hthId === chosen)?.cost ?? 0;
  });
  const relatedTarget = () => Math.max(0, (related()?.count ?? 0) - upgradeCost());

  const toggle = (field: "related" | "secondary", max: number) => (skillId: string) => {
    const current = props.store.draft[field];
    const without = current.filter((p) => p.skillId !== skillId);
    props.store.setDraft(
      field,
      without.length < current.length || current.length >= max
        ? without
        : [...current, { skillId }],
    );
  };

  const countBadge = (have: number, want: number) => (
    <span classList={{ "text-ok": have === want, "text-amber": have !== want }}>
      [{have}/{want}]
    </span>
  );

  return (
    <div class="space-y-4">
      <Show when={hth()}>
        {(grant) => (
          <Panel class="space-y-1.5 p-5">
            <h3 class="font-display text-[15px] tracking-[0.1em] text-muted">// HAND TO HAND</h3>
            <label class="flex cursor-pointer items-center gap-2 font-mono text-[13px]">
              <input
                type="radio"
                name="hth"
                class="accent-amber"
                checked={(props.store.draft.hthId ?? grant().hthId) === grant().hthId}
                onChange={() => props.store.setDraft("hthId", grant().hthId)}
              />
              {grant().name} <span class="text-ok">(GRANTED)</span>
            </label>
            <For each={grant().upgrades}>
              {(upgrade) => (
                <label
                  class="flex items-center gap-2 font-mono text-[13px]"
                  classList={{
                    "cursor-pointer": upgrade.available,
                    "text-dead": !upgrade.available,
                  }}
                >
                  <input
                    type="radio"
                    name="hth"
                    class="accent-amber"
                    disabled={!upgrade.available}
                    checked={
                      upgrade.hthId !== undefined && props.store.draft.hthId === upgrade.hthId
                    }
                    onChange={() => props.store.setDraft("hthId", upgrade.hthId)}
                  />
                  {upgrade.to} — costs {upgrade.cost} O.C.C. Related{" "}
                  {upgrade.cost === 1 ? "selection" : "selections"}
                  <Show when={upgrade.requiresAlignmentCategory}>
                    {(category) => <span class="text-blood-text">, requires {category()}</span>}
                  </Show>
                  <Show when={!upgrade.available}>
                    <span>[NOT MODELED — #15]</span>
                  </Show>
                </label>
              )}
            </For>
          </Panel>
        )}
      </Show>

      <Show when={related()}>
        {(plan) => (
          <Panel class="p-5">
            <h3 class="font-display text-[15px] tracking-[0.1em] text-muted">
              // O.C.C. RELATED SKILLS — PICK {relatedTarget()}{" "}
              {countBadge(props.store.draft.related.length, relatedTarget())}
            </h3>
            <ul class="mt-1 font-mono text-[12px] text-muted">
              <For each={plan().constraints}>
                {(constraint) => {
                  const have = () =>
                    props.store.draft.related.filter((p) =>
                      plan()
                        .options.filter((s) => s.category === constraint.fromCategory)
                        .some((s) => s.id === p.skillId),
                    ).length;
                  return (
                    <li
                      classList={{
                        "text-ok": have() >= constraint.min,
                        "text-amber": have() < constraint.min,
                      }}
                    >
                      AT LEAST {constraint.min} FROM {constraint.fromCategory.toUpperCase()} (
                      {have()} SO FAR)
                    </li>
                  );
                }}
              </For>
            </ul>
            <CheckboxPool
              options={plan().options}
              picks={props.store.draft.related}
              max={relatedTarget()}
              bonuses={plan().categoryBonuses}
              onToggle={toggle("related", relatedTarget())}
            />
          </Panel>
        )}
      </Show>

      <Show when={secondary()}>
        {(plan) => (
          <Panel class="p-5">
            <h3 class="font-display text-[15px] tracking-[0.1em] text-muted">
              // SECONDARY SKILLS — PICK {plan().count}{" "}
              {countBadge(props.store.draft.secondary.length, plan().count)}
            </h3>
            <p class="mt-1 font-mono text-[12px] text-dead">
              // no O.C.C. bonuses apply to secondary skills
            </p>
            <CheckboxPool
              options={plan().options}
              picks={props.store.draft.secondary}
              max={plan().count}
              onToggle={toggle("secondary", plan().count)}
            />
          </Panel>
        )}
      </Show>

      <Show when={(props.store.assembled()?.errors.length ?? 0) > 0}>
        <div class="space-y-1.5">
          <For each={props.store.assembled()?.errors}>
            {(error) => <Alert tone="warn">{error.toUpperCase()}</Alert>}
          </For>
        </div>
      </Show>
    </div>
  );
}
