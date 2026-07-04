import type { Narrative } from "@riftforge/rules";

/** Raw form strings for the narrative fields (wizard + dossier editor). */
export interface NarrativeForm {
  epithet: string;
  height: string;
  weight: string;
  age: string;
  eyes: string;
  origin: string;
  disposition: string;
  /** Comma-separated in the form; split into chips on save. */
  traits: string;
  backstory: string;
}

export const emptyNarrativeForm: NarrativeForm = {
  epithet: "",
  height: "",
  weight: "",
  age: "",
  eyes: "",
  origin: "",
  disposition: "",
  traits: "",
  backstory: "",
};

const opt = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

/** Form strings -> a Narrative, or undefined when every field is blank. */
export function toNarrative(form: NarrativeForm): Narrative | undefined {
  const appearance = {
    height: opt(form.height),
    weight: opt(form.weight),
    age: opt(form.age),
    eyes: opt(form.eyes),
    origin: opt(form.origin),
    disposition: opt(form.disposition),
  };
  const hasAppearance = Object.values(appearance).some((v) => v !== undefined);
  const traits = form.traits
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const narrative: Narrative = {
    ...(opt(form.epithet) !== undefined ? { epithet: opt(form.epithet) } : {}),
    ...(hasAppearance ? { appearance } : {}),
    ...(traits.length > 0 ? { traits } : {}),
    ...(opt(form.backstory) !== undefined ? { backstory: opt(form.backstory) } : {}),
  };
  return Object.keys(narrative).length > 0 ? narrative : undefined;
}

/** A stored Narrative -> form strings (for the dossier editor). */
export function fromNarrative(narrative: Narrative | undefined): NarrativeForm {
  return {
    epithet: narrative?.epithet ?? "",
    height: narrative?.appearance?.height ?? "",
    weight: narrative?.appearance?.weight ?? "",
    age: narrative?.appearance?.age ?? "",
    eyes: narrative?.appearance?.eyes ?? "",
    origin: narrative?.appearance?.origin ?? "",
    disposition: narrative?.appearance?.disposition ?? "",
    traits: narrative?.traits?.join(", ") ?? "",
    backstory: narrative?.backstory ?? "",
  };
}
