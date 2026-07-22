import { z } from "zod";
import { sourceRefSchema } from "./attributes.ts";

export const speciesSchema = z.object({
  source: sourceRefSchema,
  id: z.string().min(1),
  name: z.string().min(1),
  playable: z.boolean(),
  availabilityNote: z.string().min(1).optional(),
});
export type Species = z.infer<typeof speciesSchema>;

export const speciesCatalogSchema = z.object({
  book: z.string().min(1),
  species: z.array(speciesSchema).min(1),
});
export type SpeciesCatalog = z.infer<typeof speciesCatalogSchema>;
