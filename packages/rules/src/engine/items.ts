import { itemCatalogSchema, type Armor, type Item } from "../schema/items.ts";
import itemsRaw from "../content/items/items.json" with { type: "json" };
import { diceMax, diceMin, rollDice, type Rng } from "./dice.ts";

/** The item catalog (RUE equipment chapter + W.P. weapon damage), validated at load. */
export const itemCatalog = itemCatalogSchema.parse(itemsRaw);

// id index, failing fast on collisions (same approach as the spell/skill catalogs).
const itemById = new Map<string, Item>();
for (const item of itemCatalog.items) {
  if (itemById.has(item.id)) {
    throw new Error(`Duplicate item id "${item.id}" in the item catalog.`);
  }
  itemById.set(item.id, item);
}

export function getItem(id: string): Item | undefined {
  return itemById.get(id);
}

/** All items of a given kind, in catalog order. */
export function itemsByKind<K extends Item["kind"]>(kind: K): Extract<Item, { kind: K }>[] {
  return itemCatalog.items.filter((i): i is Extract<Item, { kind: K }> => i.kind === kind);
}

/**
 * Whether this armor's main-body capacity is printed as a per-suit roll
 * (LLW concealed: "2D6+32 M.D.C. main body", p.113) rather than a constant.
 */
export function armorNeedsRoll(armor: Armor): boolean {
  if (armor.mdc === undefined) return false;
  return diceMin(armor.mdc.mainBody) !== diceMax(armor.mdc.mainBody);
}

/** Roll a concrete main-body M.D.C. for a dice-capacity suit (throws otherwise). */
export function rollArmorMdc(armor: Armor, rng: Rng = Math.random): number {
  if (!armorNeedsRoll(armor)) {
    throw new Error(`${armor.name} has a fixed capacity — nothing to roll.`);
  }
  // armorNeedsRoll only passes when mdc is present.
  return rollDice(armor.mdc!.mainBody, rng);
}

/**
 * The armor's maximum main-body pool: the S.D.C. pool for S.D.C. armor, the
 * printed constant for fixed M.D.C. suits, or the recorded per-suit roll for
 * dice-capacity suits — `undefined` until that roll exists.
 */
export function armorMaxPool(armor: Armor, rolledMdc?: number): number | undefined {
  if (armor.mdc === undefined) return armor.sdc;
  if (!armorNeedsRoll(armor)) return diceMin(armor.mdc.mainBody);
  return rolledMdc;
}

/**
 * Damage absorbed by a worn armor pool. The armor takes the WHOLE hit — "the
 * armor absorbs the attack — subtract the damage from the armor's S.D.C."
 * (RUE p.287); nothing spills onto the body. A depleted suit (0) no longer
 * affords protection: *future* attacks hit the character's body.
 */
export function damageArmor(pool: number, damage: number): number {
  if (!Number.isInteger(damage) || damage < 0) {
    throw new Error(`Damage must be a non-negative integer, got ${damage}.`);
  }
  return Math.max(0, pool - damage);
}
