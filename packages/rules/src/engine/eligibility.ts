import type { AttributeCode } from "../schema/attributes.ts";
import type { Occ } from "../schema/occ.ts";
import type { Species } from "../schema/species.ts";
import { getSpecies } from "./species.ts";

export type OccEligibilityFailure =
  | { kind: "unknownSpecies"; speciesId: string }
  | { kind: "unavailableSpecies"; speciesId: string; name: string }
  | { kind: "speciesNotAllowed"; speciesId: string; allowedSpeciesIds: string[] }
  | { kind: "attribute"; code: AttributeCode; min: number; actual: number };

export interface OccEligibilityResult {
  ok: boolean;
  species?: Species;
  failures: OccEligibilityFailure[];
}

export function validateOccEligibility(
  occ: Occ,
  speciesId: string,
  attributes: Partial<Record<AttributeCode, number>>,
): OccEligibilityResult {
  const failures: OccEligibilityFailure[] = [];
  const species = getSpecies(speciesId);

  if (species === undefined) {
    failures.push({ kind: "unknownSpecies", speciesId });
  } else {
    if (!species.playable) {
      failures.push({ kind: "unavailableSpecies", speciesId, name: species.name });
    }
    if (
      occ.speciesEligibility.kind === "oneOf" &&
      !occ.speciesEligibility.speciesIds.includes(speciesId)
    ) {
      failures.push({
        kind: "speciesNotAllowed",
        speciesId,
        allowedSpeciesIds: [...occ.speciesEligibility.speciesIds],
      });
    }
  }

  for (const requirement of occ.attributeRequirements) {
    const actual = attributes[requirement.code] ?? 0;
    if (actual < requirement.min) {
      failures.push({
        kind: "attribute",
        code: requirement.code,
        min: requirement.min,
        actual,
      });
    }
  }

  return {
    ok: failures.length === 0,
    ...(species === undefined ? {} : { species }),
    failures,
  };
}

const attributeLabel: Record<AttributeCode, string> = {
  IQ: "I.Q.",
  ME: "M.E.",
  MA: "M.A.",
  PS: "P.S.",
  PP: "P.P.",
  PE: "P.E.",
  PB: "P.B.",
  Spd: "Spd",
};

export function describeOccEligibilityFailure(failure: OccEligibilityFailure): string {
  switch (failure.kind) {
    case "unknownSpecies":
      return `Unknown species "${failure.speciesId}".`;
    case "unavailableSpecies":
      return `${failure.name} is known but not playable.`;
    case "speciesNotAllowed":
      return `Species "${failure.speciesId}" is not allowed; expected ${failure.allowedSpeciesIds.join(
        ", ",
      )}.`;
    case "attribute":
      return `${attributeLabel[failure.code]} ${failure.actual}; requires ${failure.min}+.`;
  }
}
