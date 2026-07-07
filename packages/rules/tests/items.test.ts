import { describe, expect, test } from "vite-plus/test";
import {
  armorMaxPool,
  armorNeedsRoll,
  armorSchema,
  damageArmor,
  getItem,
  itemCatalog,
  itemsByKind,
  rollArmorMdc,
  type Armor,
} from "../src/index.ts";

describe("item catalog (RUE equipment)", () => {
  test("pins the per-kind counts (silent drift is caught forever after)", () => {
    expect(itemsByKind("armor")).toHaveLength(8);
    expect(itemsByKind("weapon")).toHaveLength(11);
    expect(itemsByKind("gear")).toHaveLength(15);
    expect(itemCatalog.items).toHaveLength(34);
  });

  test("Ley Line Walker concealed armor rolls its M.D.C. per suit (p.113)", () => {
    const light = getItem("llw-concealed-light");
    expect(light).toMatchObject({
      kind: "armor",
      mdc: { mainBody: "2D6+32" },
      page: 113,
    });
    const medium = getItem("llw-concealed-medium");
    expect(medium).toMatchObject({
      kind: "armor",
      mdc: { mainBody: "3D6+50" },
      page: 113,
    });
  });

  test("M.D.C. body armor suits carry the printed main-body values (pp.267-268)", () => {
    // RUE p.267
    expect(getItem("gladiator")).toMatchObject({ mdc: { mainBody: "70" }, page: 267 });
    expect(getItem("crusader")).toMatchObject({ mdc: { mainBody: "95" }, page: 267 });
    // RUE p.268
    expect(getItem("urban-warrior")).toMatchObject({ mdc: { mainBody: "50" }, page: 268 });
    expect(getItem("plastic-man")).toMatchObject({ mdc: { mainBody: "35" }, page: 268 });
    expect(getItem("huntsman")).toMatchObject({
      mdc: { mainBody: "45" },
      environmental: false,
      page: 268,
    });
    expect(getItem("bushman")).toMatchObject({ mdc: { mainBody: "60" }, page: 268 });
  });

  test("energy weapons carry the printed damage dice (pp.268-270)", () => {
    expect(getItem("wilks-320-laser-pistol")).toMatchObject({
      damage: { formula: "1D6", type: "md" },
      range: "1000 feet (305 m)",
      page: 268,
    });
    expect(getItem("wilks-447-laser-rifle")).toMatchObject({
      damage: { formula: "3D6", type: "md" },
      range: "2000 feet (610 m)",
      page: 269,
    });
    expect(getItem("ng-57-ion-blaster")).toMatchObject({
      damage: { formula: "3D6", type: "md" },
      page: 269,
    });
    expect(getItem("ng-33-laser-pistol")).toMatchObject({
      damage: { formula: "1D6", type: "md" },
      page: 269,
    });
    expect(getItem("ng-l5-laser-rifle")).toMatchObject({
      damage: { formula: "3D6", type: "md" },
      page: 270,
    });
    expect(getItem("ng-p7-particle-beam-rifle")).toMatchObject({
      damage: { formula: "1D4*10", type: "md" },
      page: 270,
    });
    expect(getItem("l-20-pulse-rifle")).toMatchObject({
      damage: { formula: "2D6", type: "md" },
      page: 270,
    });
  });

  test("conventional weapons carry the printed W.P. damage (pp.326-329)", () => {
    // W.P. Axe: small axes and hatchets do 1D6 (p.326).
    expect(getItem("hand-axe")).toMatchObject({
      damage: { formula: "1D6", type: "sdc" },
      page: 326,
    });
    // W.P. Knife: typical 1D6 (p.327).
    expect(getItem("survival-knife")).toMatchObject({
      damage: { formula: "1D6", type: "sdc" },
      page: 327,
    });
    // W.P. Handguns: heavy/large caliber 4D6 (.45 automatic) (p.328).
    expect(getItem("automatic-pistol")).toMatchObject({
      damage: { formula: "4D6", type: "sdc" },
      page: 328,
    });
    // W.P. Submachine-Gun: 4D6 per single round (p.329).
    expect(getItem("submachine-gun")).toMatchObject({
      damage: { formula: "4D6", type: "sdc" },
      page: 329,
    });
  });

  test("the LLW standard-equipment gear is present, page-stamped to the list (p.116)", () => {
    for (const id of ["robe-or-cape", "canteen", "wooden-stakes-and-mallet", "flashlight"]) {
      expect(getItem(id)).toMatchObject({ kind: "gear", page: 116 });
    }
  });
});

describe("armor schema refinements", () => {
  const base = { kind: "armor" as const, id: "x", name: "X", page: 1 };

  test("rejects armor that is neither M.D.C. nor a full S.D.C. (A.R. + pool) shape", () => {
    expect(() => armorSchema.parse(base)).toThrow();
    expect(() => armorSchema.parse({ ...base, ar: 12 })).toThrow(); // A.R. without a pool
    expect(() => armorSchema.parse({ ...base, sdc: 50 })).toThrow(); // pool without an A.R.
  });

  test("rejects an M.D.C. shell that also declares A.R./S.D.C. (no A.R. on M.D.C. armor)", () => {
    expect(() =>
      armorSchema.parse({ ...base, mdc: { mainBody: "70" }, ar: 12, sdc: 50 }),
    ).toThrow();
  });

  test("accepts the two legal shapes", () => {
    expect(armorSchema.parse({ ...base, ar: 14, sdc: 38 }).ar).toBe(14);
    expect(armorSchema.parse({ ...base, mdc: { mainBody: "2D6+32" } }).mdc?.mainBody).toBe(
      "2D6+32",
    );
  });
});

describe("armor pools", () => {
  const sdcArmor = armorSchema.parse({
    kind: "armor",
    id: "test-sdc",
    name: "Test S.D.C. Armor",
    ar: 14,
    sdc: 38,
    page: 287,
  });

  test("fixed suits need no roll; dice suits do", () => {
    expect(armorNeedsRoll(getItem("gladiator") as Armor)).toBe(false);
    expect(armorNeedsRoll(getItem("llw-concealed-light") as Armor)).toBe(true);
    expect(armorNeedsRoll(sdcArmor)).toBe(false);
  });

  test("armorMaxPool: S.D.C. pool, printed constant, or the per-suit roll", () => {
    expect(armorMaxPool(sdcArmor)).toBe(38);
    expect(armorMaxPool(getItem("gladiator") as Armor)).toBe(70); // p.267
    const llw = getItem("llw-concealed-light") as Armor;
    expect(armorMaxPool(llw)).toBeUndefined(); // 2D6+32: no pool until rolled
    expect(armorMaxPool(llw, 40)).toBe(40);
  });

  test("rollArmorMdc stays within the printed 2D6+32 bounds (p.113)", () => {
    const llw = getItem("llw-concealed-light") as Armor;
    for (let i = 0; i < 50; i++) {
      const rolled = rollArmorMdc(llw);
      expect(rolled).toBeGreaterThanOrEqual(34);
      expect(rolled).toBeLessThanOrEqual(44);
    }
    expect(() => rollArmorMdc(getItem("gladiator") as Armor)).toThrow(/fixed capacity/);
  });

  test("damageArmor absorbs the whole hit, floors at zero, never spills (p.287)", () => {
    expect(damageArmor(38, 10)).toBe(28);
    // "The armor absorbs the attack" — even the depleting hit is fully
    // absorbed; only FUTURE attacks reach the body.
    expect(damageArmor(5, 12)).toBe(0);
    expect(damageArmor(0, 12)).toBe(0);
    expect(() => damageArmor(10, -1)).toThrow();
    expect(() => damageArmor(10, 2.5)).toThrow();
  });
});
