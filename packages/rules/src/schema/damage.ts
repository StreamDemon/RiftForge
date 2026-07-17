import { z } from "zod";

/** The two general damage systems modeled by weapons and finite spell damage. */
export const damageTypeSchema = z.enum(["sdc", "md"]);
export type DamageType = z.infer<typeof damageTypeSchema>;
