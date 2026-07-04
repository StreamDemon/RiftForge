import {
  assembleSkills,
  deriveSheet,
  getOcc,
  meetsAttributeRequirements,
  occSkillPlan,
  validateInitialSpells,
  type AttributeCode,
  type AttributeRoll,
  type BuilderSelections,
  type CharacterInput,
  type CharacterSheet,
  type PsionicsRoll,
  type PsychicClass,
  type SkillPick,
} from "@riftforge/rules";
import { createMemo, type Accessor } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import { emptyNarrativeForm, toNarrative, type NarrativeForm } from "../lib/narrative.ts";

/** Everything the player has chosen so far. */
export interface Draft {
  name: string;
  /** Optional player-authored identity (raw form strings). */
  narrative: NarrativeForm;
  attributes?: Record<AttributeCode, AttributeRoll>;
  occId?: string;
  alignmentId?: string;
  psychicClass: PsychicClass;
  /** Kept for display when the player rolled instead of picking. */
  psionicsRoll?: PsionicsRoll;
  occChoices: Record<string, SkillPick[]>;
  related: SkillPick[];
  secondary: SkillPick[];
  hthId?: string;
  spellIds: string[];
}

export interface BuilderStore {
  draft: Draft;
  setDraft: SetStoreFunction<Draft>;
  /** The chosen O.C.C., once picked. */
  occ: Accessor<ReturnType<typeof getOcc>>;
  /** Rolled attribute totals, once rolled. */
  attributeTotals: Accessor<Record<AttributeCode, number> | undefined>;
  /** Engine validation of every skill selection (empty errors = legal). */
  assembled: Accessor<ReturnType<typeof assembleSkills> | undefined>;
  spellErrors: Accessor<string[]>;
  /** The final character, when every step is satisfied. */
  characterInput: Accessor<CharacterInput | undefined>;
  /** The derived preview for the review step, or the error preventing it. */
  preview: Accessor<{ sheet?: CharacterSheet; error?: string }>;
}

export function createBuilderStore(): BuilderStore {
  const [draft, setDraft] = createStore<Draft>({
    name: "",
    narrative: { ...emptyNarrativeForm },
    psychicClass: "ordinary",
    occChoices: {},
    related: [],
    secondary: [],
    spellIds: [],
  });

  const occ = createMemo(() => (draft.occId !== undefined ? getOcc(draft.occId) : undefined));

  const attributeTotals = createMemo(() => {
    if (!draft.attributes) return undefined;
    const out = {} as Record<AttributeCode, number>;
    for (const [code, roll] of Object.entries(draft.attributes)) {
      out[code as AttributeCode] = roll.total;
    }
    return out;
  });

  const selections = createMemo(
    (): BuilderSelections => ({
      occChoices: draft.occChoices,
      related: draft.related,
      secondary: draft.secondary,
      hthId: draft.hthId,
      alignmentId: draft.alignmentId,
    }),
  );

  const assembled = createMemo(() => {
    const chosen = occ();
    return chosen ? assembleSkills(chosen, selections()) : undefined;
  });

  const spellErrors = createMemo(() => {
    const chosen = occ();
    return chosen ? validateInitialSpells(chosen, draft.spellIds) : [];
  });

  const characterInput = createMemo((): CharacterInput | undefined => {
    const attributes = attributeTotals();
    const skills = assembled();
    if (!draft.occId || !attributes || !skills) return undefined;
    const narrative = toNarrative(draft.narrative);
    return {
      name: draft.name.trim(),
      occId: draft.occId,
      ...(draft.alignmentId !== undefined ? { alignmentId: draft.alignmentId } : {}),
      level: 1,
      attributes,
      hthType: skills.hthType,
      psychicClass: draft.psychicClass,
      skills: skills.skills,
      spellIds: draft.spellIds,
      ...(narrative !== undefined ? { narrative } : {}),
    };
  });

  const preview = createMemo(() => {
    const input = characterInput();
    if (!input) return { error: "The build is incomplete." };
    try {
      return { sheet: deriveSheet(input) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  return { draft, setDraft, occ, attributeTotals, assembled, spellErrors, characterInput, preview };
}

/** Per-step gating — a step is reachable when all before it are valid. */
export function stepValidity(store: BuilderStore) {
  const requirements = createMemo(() => {
    const chosen = store.occ();
    const attrs = store.attributeTotals();
    return chosen && attrs ? meetsAttributeRequirements(chosen, attrs) : undefined;
  });

  return {
    requirements,
    identity: createMemo(() => store.draft.name.trim().length > 0),
    attributes: createMemo(() => store.draft.attributes !== undefined),
    occ: createMemo(() => store.occ() !== undefined && requirements()?.ok === true),
    alignment: createMemo(() => store.draft.alignmentId !== undefined),
    psionics: createMemo(() => true),
    // The O.C.C.-skills step only checks its own slots: related/secondary
    // picks come later, so full-assembly validity would block it.
    occSkills: createMemo(() => {
      const chosen = store.occ();
      if (!chosen) return false;
      return occSkillPlan(chosen).choices.every((slot) => {
        const picks = store.draft.occChoices[slot.key] ?? [];
        const ids = new Set(slot.options.map((s) => s.id));
        return picks.length === slot.choose && picks.every((p) => ids.has(p.skillId));
      });
    }),
    skills: createMemo(() => (store.assembled()?.errors.length ?? 1) === 0),
    spells: createMemo(() => store.spellErrors().length === 0),
    review: createMemo(() => store.preview().sheet !== undefined),
  };
}
