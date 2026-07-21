import { z } from "zod";

export const attackKindSchema = z.enum(["melee", "ranged"]);
export type AttackKind = z.infer<typeof attackKindSchema>;

export const rangeBandSchema = z.enum(["pointBlank", "close", "normal"]);
export type RangeBand = z.infer<typeof rangeBandSchema>;

export const parryModeSchema = z.enum(["unavailable", "standard", "bareHanded"]);
export type ParryMode = z.infer<typeof parryModeSchema>;

const safeModifierSchema = z.number().int().safe().min(-100).max(100).optional();
const modifierReasonSchema = z.string().trim().min(1).optional();
const rawCombatContextSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("melee"),
    defenderAware: z.boolean(),
    parryMode: parryModeSchema,
    strikeModifier: safeModifierSchema,
    strikeModifierReason: modifierReasonSchema,
  }),
  z.object({
    kind: z.literal("ranged"),
    defenderAware: z.boolean(),
    rangeBand: rangeBandSchema,
    strikeModifier: safeModifierSchema,
    strikeModifierReason: modifierReasonSchema,
  }),
]);

export const combatContextSchema = rawCombatContextSchema.superRefine((context, check) => {
  if ((context.strikeModifier ?? 0) !== 0 && context.strikeModifierReason === undefined) {
    check.addIssue({
      code: "custom",
      path: ["strikeModifierReason"],
      message: "A reason is required for a nonzero strike modifier.",
    });
  }
});
export type CombatContext = z.infer<typeof combatContextSchema>;

export const combatResponseKindSchema = z.enum(["parry", "dodge", "autoDodge", "none"]);
export type CombatResponseKind = z.infer<typeof combatResponseKindSchema>;

const rawCombatResponseInputSchema = z.object({
  kind: combatResponseKindSchema,
  defenseModifier: safeModifierSchema,
  defenseModifierReason: modifierReasonSchema,
});
export const combatResponseInputSchema = rawCombatResponseInputSchema.superRefine(
  (response, check) => {
    if (response.kind === "none" && (response.defenseModifier ?? 0) !== 0) {
      check.addIssue({
        code: "custom",
        path: ["defenseModifier"],
        message: "Take-the-hit cannot include a nonzero defense modifier.",
      });
    }
    if ((response.defenseModifier ?? 0) !== 0 && response.defenseModifierReason === undefined) {
      check.addIssue({
        code: "custom",
        path: ["defenseModifierReason"],
        message: "A reason is required for a nonzero defense modifier.",
      });
    }
  },
);
export type CombatResponseInput = z.infer<typeof combatResponseInputSchema>;

export const combatExchangeErrorCodeSchema = z.enum([
  "selfTarget",
  "attackerNotReady",
  "defenderNotReady",
  "weaponMissingOrChanged",
  "unsupportedWeaponMode",
  "unsupportedMdWeapon",
  "unsupportedMdcProtection",
  "invalidContext",
  "modifierReasonRequired",
  "illegalDefense",
  "exchangeNotPending",
  "combatStateChanged",
  "characterMissing",
]);
export type CombatExchangeErrorCode = z.infer<typeof combatExchangeErrorCodeSchema>;

export const combatExchangeRulesSchema = z.object({
  book: z.string().min(1),
  pages: z.object({
    armorAndVitals: z.literal(287),
    megaDamageIntro: z.literal(288),
    sdcCombat: z.literal(339),
    defense: z.literal(340),
    damage: z.literal(341),
    automaticDodge: z.literal(344),
    megaDamageCombat: z.literal(355),
    modernWeapons: z.literal(360),
    rangedDodging: z.literal(361),
  }),
  rules: z.object({
    sdcPerMd: z.literal(100),
    minimumSdcToDamageMdc: z.literal(100),
    depletedMdcArmorBypassStrike: z.literal(8),
    finalMdcAbsorbsDestroyingBlast: z.literal(true),
  }),
  minimumStrikeTotal: z.object({ melee: z.literal(5), ranged: z.literal(8) }),
  rangedDodgeModifier: z.object({
    pointBlank: z.literal(-10),
    close: z.literal(-5),
    normal: z.literal(0),
  }),
});
export type CombatExchangeRules = z.infer<typeof combatExchangeRulesSchema>;
