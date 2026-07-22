import speciesRaw from "../content/species/species.json" with { type: "json" };
import { speciesCatalogSchema, type Species } from "../schema/species.ts";

export const speciesCatalog = speciesCatalogSchema.parse(speciesRaw);

export function buildSpeciesIndex(species: readonly Species[]): Map<string, Species> {
  const byId = new Map<string, Species>();
  for (const entry of species) {
    if (byId.has(entry.id)) throw new Error(`Duplicate species id "${entry.id}".`);
    byId.set(entry.id, entry);
  }
  return byId;
}

const speciesById = buildSpeciesIndex(speciesCatalog.species);

export function getSpecies(id: string): Species | undefined {
  return speciesById.get(id);
}

const human = getSpecies("human");
if (human === undefined || human.playable !== true) {
  throw new Error('Species catalog must contain playable species "human".');
}
export const humanSpecies: Species = human;
