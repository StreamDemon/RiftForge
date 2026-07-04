import alignmentsRaw from "../content/alignments.json" with { type: "json" };
import { alignmentBookSchema, type Alignment } from "../schema/alignments.ts";

/** The seven canonical alignments (RUE printed pp.289-292), validated at load. */
export const alignmentBook = alignmentBookSchema.parse(alignmentsRaw);

/** All alignments in book order (Good → Selfish → Evil). */
export const alignments: readonly Alignment[] = alignmentBook.alignments;

const byId = new Map(alignments.map((a) => [a.id, a]));

export function getAlignment(id: string): Alignment | undefined {
  return byId.get(id);
}
