import {
  occSkillPlan,
  relatedSkillPlan,
  secondarySkillPlan,
  type Skill,
  type SkillPick,
} from "@riftforge/rules";
import { createMemo, For, Show } from "solid-js";
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
    <For each={groupByCategory(props.options)}>
      {([category, skills]) => (
        <div>
          <h4 class="font-bold">
            {category}
            <Show when={props.bonuses?.[category]}> (+{props.bonuses![category]}%)</Show>
          </h4>
          <For each={skills}>
            {(skill) => (
              <label class="block">
                <input
                  type="checkbox"
                  checked={props.picks.some((p) => p.skillId === skill.id)}
                  onChange={() => props.onToggle(skill.id)}
                />{" "}
                {skill.name} (base {skill.baseSkill}%)
              </label>
            )}
          </For>
        </div>
      )}
    </For>
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

  return (
    <section class="space-y-4">
      <Show when={hth()}>
        {(grant) => (
          <div>
            <h3 class="font-bold">Hand to hand</h3>
            <label class="block">
              <input
                type="radio"
                name="hth"
                checked={(props.store.draft.hthId ?? grant().hthId) === grant().hthId}
                onChange={() => props.store.setDraft("hthId", grant().hthId)}
              />{" "}
              {grant().name} (granted)
            </label>
            <For each={grant().upgrades}>
              {(upgrade) => (
                <label class="block">
                  <input
                    type="radio"
                    name="hth"
                    disabled={!upgrade.available}
                    checked={
                      upgrade.hthId !== undefined && props.store.draft.hthId === upgrade.hthId
                    }
                    onChange={() => props.store.setDraft("hthId", upgrade.hthId)}
                  />{" "}
                  {upgrade.to} — costs {upgrade.cost} O.C.C. Related{" "}
                  {upgrade.cost === 1 ? "selection" : "selections"}
                  <Show when={upgrade.requiresAlignmentCategory}>
                    {(category) => <>, requires an {category()} alignment</>}
                  </Show>
                  <Show when={!upgrade.available}> (not modeled yet — #15)</Show>
                </label>
              )}
            </For>
          </div>
        )}
      </Show>

      <Show when={related()}>
        {(plan) => (
          <div>
            <h3 class="font-bold">
              O.C.C. Related skills — pick {relatedTarget()} ({props.store.draft.related.length}/
              {relatedTarget()})
            </h3>
            <ul>
              <For each={plan().constraints}>
                {(constraint) => (
                  <li>
                    At least {constraint.min} from {constraint.fromCategory} (
                    {
                      props.store.draft.related.filter((p) =>
                        plan()
                          .options.filter((s) => s.category === constraint.fromCategory)
                          .some((s) => s.id === p.skillId),
                      ).length
                    }{" "}
                    so far)
                  </li>
                )}
              </For>
            </ul>
            <CheckboxPool
              options={plan().options}
              picks={props.store.draft.related}
              max={relatedTarget()}
              bonuses={plan().categoryBonuses}
              onToggle={toggle("related", relatedTarget())}
            />
          </div>
        )}
      </Show>

      <Show when={secondary()}>
        {(plan) => (
          <div>
            <h3 class="font-bold">
              Secondary skills — pick {plan().count} ({props.store.draft.secondary.length}/
              {plan().count})
            </h3>
            <p>No O.C.C. bonuses apply to secondary skills.</p>
            <CheckboxPool
              options={plan().options}
              picks={props.store.draft.secondary}
              max={plan().count}
              onToggle={toggle("secondary", plan().count)}
            />
          </div>
        )}
      </Show>

      <Show when={(props.store.assembled()?.errors.length ?? 0) > 0}>
        <div>
          <h3 class="font-bold">Not legal yet</h3>
          <ul>
            <For each={props.store.assembled()?.errors}>{(error) => <li>{error}</li>}</For>
          </ul>
        </div>
      </Show>
    </section>
  );
}
