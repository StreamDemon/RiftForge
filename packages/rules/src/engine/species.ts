import speciesRaw from "../content/species/species.json" with { type: "json" };
import { speciesCatalogSchema, type Species } from "../schema/species.ts";

export type ImmutableSpecies = Readonly<
  Omit<Species, "source"> & { source: Readonly<Species["source"]> }
>;

const parsedCatalog = speciesCatalogSchema.parse(speciesRaw);
const immutableSpecies = Object.freeze(
  parsedCatalog.species.map(
    (species): ImmutableSpecies =>
      Object.freeze({ ...species, source: Object.freeze({ ...species.source }) }),
  ),
);

export const speciesCatalog = Object.freeze({
  ...parsedCatalog,
  species: immutableSpecies,
});

export function buildSpeciesIndex(
  species: readonly ImmutableSpecies[],
): ReadonlyMap<string, ImmutableSpecies> {
  const byId = new Map<string, ImmutableSpecies>();
  for (const entry of species) {
    if (byId.has(entry.id)) throw new Error(`Duplicate species id "${entry.id}".`);
    byId.set(entry.id, entry);
  }
  return byId;
}

const speciesById = buildSpeciesIndex(speciesCatalog.species);

export function getSpecies(id: string): ImmutableSpecies | undefined {
  return speciesById.get(id);
}

const human = getSpecies("human");
if (human === undefined || human.playable !== true) {
  throw new Error('Species catalog must contain playable species "human".');
}
export const humanSpecies: ImmutableSpecies = human;
