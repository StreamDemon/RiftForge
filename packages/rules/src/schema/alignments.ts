import { z } from "zod";

/**
 * The three basic alignment categories (RUE p.289). There are no neutral
 * alignments (p.290) — the book eliminates them explicitly.
 */
export const alignmentCategorySchema = z.enum(["good", "selfish", "evil"]);
export type AlignmentCategory = z.infer<typeof alignmentCategorySchema>;

/** One of the seven canonical alignments (RUE printed pp.289-292). */
export const alignmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: alignmentCategorySchema,
  page: z.number().int().positive(),
  summary: z.string().min(1),
});
export type Alignment = z.infer<typeof alignmentSchema>;

export const alignmentBookSchema = z.object({
  book: z.string().min(1),
  page: z.number().int().positive(),
  note: z.string().optional(),
  alignments: z
    .array(alignmentSchema)
    .min(1)
    .refine((arr) => new Set(arr.map((a) => a.id)).size === arr.length, {
      message: "Alignment ids must be unique.",
    }),
});
export type AlignmentBook = z.infer<typeof alignmentBookSchema>;
