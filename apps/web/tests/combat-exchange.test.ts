/// <reference types="node" />

import { deriveSheet, type CharacterInput } from "@riftforge/rules";
import { ConvexError } from "convex/values";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";
import {
  combatErrorMessage,
  combatTargetDisabledReason,
  combatWeaponChoices,
  exchangeResultLabel,
  exchangeTone,
  formatExchangeSummary,
  ownsAsyncResult,
  type CombatTargetSummary,
  type ExchangeSummary,
} from "../src/lib/combat-exchange.ts";

function source(relative: string): string {
  const url = new URL(relative, import.meta.url);
  if (!existsSync(url)) throw new Error(`Missing source under test: ${relative}`);
  return readFileSync(url, "utf8");
}

test("fails loudly when a source contract points at a missing file", () => {
  expect(() => source("../src/definitely-missing-combat-source.tsx")).toThrow(
    "Missing source under test: ../src/definitely-missing-combat-source.tsx",
  );
});

const panelSource = source("../src/components/combat-exchange-panel.tsx");
const uiSource = source("../src/components/ui.tsx");
const telemetryRailSource = source("../src/components/telemetry-rail.tsx");
const characterSheetSource = source("../src/pages/character-sheet.tsx");

const combatant: CharacterInput = {
  name: "Vesper",
  occId: "ley-line-walker",
  level: 1,
  attributes: { IQ: 18, ME: 16, MA: 12, PS: 16, PP: 20, PE: 14, PB: 11, Spd: 12 },
  hthType: "basic",
  skills: [
    { skillId: "wilderness-survival", occBonus: 10 },
    { skillId: "math-basic", occBonus: 10 },
    { skillId: "land-navigation", occBonus: 4 },
  ],
  spellIds: ["globe-of-daylight", "energy-bolt", "armor-of-ithan"],
  rolled: { hitPoints: 18, sdc: 20 },
};

const exchangeBase = {
  _id: "exchange-1" as ExchangeSummary["_id"],
  _creationTime: 1,
  attackerId: "attacker-1" as ExchangeSummary["attackerId"],
  defenderId: "defender-1" as ExchangeSummary["defenderId"],
  attackerName: "Vesper",
  defenderName: "Deadboy",
  weapon: {
    index: 0,
    itemId: "survival-knife",
    name: "Survival Knife",
    category: "knife" as const,
  },
  attack: {
    kind: "melee" as const,
    minimumStrikeTotal: 5,
    strikeBonus: 3,
    strikeBonusSources: [{ source: "attribute" as const, label: "P.P.", value: 3 }],
    proficiencyBonus: 0,
    damageFormula: "1D6",
    damageBonus: 1,
    criticalOn: 20,
    damageType: "sdc" as const,
  },
  context: {
    kind: "melee" as const,
    defenderAware: true,
    parryMode: "standard" as const,
  },
  attackerStateToken: "attacker-state",
  defenderStateToken: "defender-state",
  strikeRoll: {
    die: 12,
    bonus: 3,
    total: 15,
    target: 5,
    success: true,
    naturalTwenty: false,
    naturalOne: false,
  },
};

function pendingExchange(): Extract<ExchangeSummary, { status: "pendingDefense" }> {
  return {
    ...exchangeBase,
    status: "pendingDefense",
    defenseOptions: [
      { kind: "parry", bonus: 4, actionCost: 0, explanation: "Parry the melee weapon." },
    ],
  };
}

function cancelledExchange(): Extract<ExchangeSummary, { status: "cancelled" }> {
  return { ...exchangeBase, status: "cancelled", cancelledAt: 2 };
}

function staleExchange(): Extract<ExchangeSummary, { status: "stale" }> {
  return { ...exchangeBase, status: "stale", staleAt: 2, reason: "combatStateChanged" };
}

function missedExchange(): Extract<ExchangeSummary, { status: "resolved" }> {
  return {
    ...exchangeBase,
    status: "resolved",
    resolution: {
      outcome: "miss",
      reason: "belowMinimum",
      critical: false,
      damageMultiplier: 1,
    },
  };
}

function defendedExchange(): Extract<ExchangeSummary, { status: "resolved" }> {
  return {
    ...exchangeBase,
    status: "resolved",
    resolution: {
      outcome: "defended",
      reason: "parried",
      response: {
        kind: "parry",
        bonus: 4,
        actionCost: 0,
        explanation: "Parry the melee weapon.",
        defenseModifier: 0,
        totalBonus: 4,
      },
      defenseRoll: {
        die: 16,
        bonus: 4,
        total: 20,
        target: 15,
        success: true,
        naturalTwenty: false,
        naturalOne: false,
      },
      critical: false,
      damageMultiplier: 1,
    },
  };
}

function bodyHitExchange(): Extract<ExchangeSummary, { status: "resolved" }> {
  return {
    ...exchangeBase,
    status: "resolved",
    resolution: {
      outcome: "hit",
      reason: "unopposed",
      response: {
        kind: "none",
        bonus: 0,
        actionCost: 0,
        explanation: "Take the hit.",
        defenseModifier: 0,
        totalBonus: 0,
      },
      critical: true,
      damageMultiplier: 2,
      damageRoll: { dice: [5], bonus: 1, total: 6 },
      totalDamage: 12,
      route: {
        kind: "body",
        body: {
          before: { sdc: 5, hitPoints: 18 },
          after: { sdc: 0, hitPoints: 11 },
        },
      },
    },
  };
}

function armorHitExchange(): Extract<ExchangeSummary, { status: "resolved" }> {
  return {
    ...exchangeBase,
    status: "resolved",
    resolution: {
      outcome: "hit",
      reason: "strikeWon",
      response: {
        kind: "parry",
        bonus: 4,
        actionCost: 0,
        explanation: "Parry the melee weapon.",
        defenseModifier: -2,
        defenseModifierReason: "Bad footing",
        totalBonus: 2,
      },
      defenseRoll: {
        die: 7,
        bonus: 2,
        total: 9,
        target: 15,
        success: false,
        naturalTwenty: false,
        naturalOne: false,
      },
      critical: false,
      damageMultiplier: 1,
      damageRoll: { dice: [4], bonus: 1, total: 5 },
      totalDamage: 5,
      route: {
        kind: "armor",
        armor: { before: 20, after: 15 },
        body: {
          before: { sdc: 20, hitPoints: 18 },
          after: { sdc: 20, hitPoints: 18 },
        },
      },
    },
  };
}

type ResolvedExchange = Extract<ExchangeSummary, { status: "resolved" }>;
type HitResolution = Extract<ResolvedExchange["resolution"], { outcome: "hit" }>;
type TieredRoute = Extract<HitResolution["route"], { routingVersion: 2 }>;

function tieredHitExchange(route: TieredRoute): ResolvedExchange {
  return {
    ...exchangeBase,
    attack: {
      ...exchangeBase.attack,
      damageType: route.nativeDamage.type,
    },
    status: "resolved",
    resolution: {
      outcome: "hit",
      reason: "unopposed",
      response: {
        kind: "none",
        bonus: 0,
        actionCost: 0,
        explanation: "Take the hit.",
        defenseModifier: 0,
        totalBonus: 0,
      },
      critical: false,
      damageMultiplier: 1,
      damageRoll: { dice: [5], bonus: 1, total: 6 },
      totalDamage: route.nativeDamage.value,
      route,
    },
  };
}

const unchangedBody = {
  before: { sdc: 20, hitPoints: 18 },
  after: { sdc: 20, hitPoints: 18 },
};

const stoppedMdcExchange = tieredHitExchange({
  routingVersion: 2,
  kind: "stopped",
  reason: "intactMdcImpervious",
  nativeDamage: { type: "sdc", value: 96 },
  armor: {
    kind: "mdcArmor",
    itemId: "gladiator",
    name: "Gladiator Full Environmental Body Armor",
    before: 10,
    after: 10,
  },
  body: unchangedBody,
});

const convertedMdcArmorExchange = tieredHitExchange({
  routingVersion: 2,
  kind: "armor",
  nativeDamage: { type: "sdc", value: 496 },
  convertedDamage: { type: "md", value: 4 },
  armor: {
    kind: "mdcArmor",
    itemId: "gladiator",
    name: "Gladiator Full Environmental Body Armor",
    before: 10,
    after: 6,
  },
  body: unchangedBody,
  finalBlastAbsorbed: false,
});

const nativeMdcArmorExchange = tieredHitExchange({
  routingVersion: 2,
  kind: "armor",
  nativeDamage: { type: "md", value: 6 },
  armor: {
    kind: "mdcArmor",
    itemId: "gladiator",
    name: "Gladiator Full Environmental Body Armor",
    before: 10,
    after: 4,
  },
  body: unchangedBody,
  finalBlastAbsorbed: false,
});

const finalBlastExchange = tieredHitExchange({
  routingVersion: 2,
  kind: "armor",
  nativeDamage: { type: "md", value: 21 },
  armor: {
    kind: "mdcArmor",
    itemId: "gladiator",
    name: "Gladiator Full Environmental Body Armor",
    before: 3,
    after: 0,
  },
  body: unchangedBody,
  finalBlastAbsorbed: true,
});

const depletedShellBodyExchange = tieredHitExchange({
  routingVersion: 2,
  kind: "body",
  nativeDamage: { type: "md", value: 1 },
  convertedDamage: { type: "sdc", value: 100 },
  armor: {
    kind: "mdcArmor",
    itemId: "gladiator",
    name: "Gladiator Full Environmental Body Armor",
    before: 0,
    after: 0,
  },
  body: {
    before: { sdc: 120, hitPoints: 18 },
    after: { sdc: 20, hitPoints: 18 },
  },
  lifeState: { before: "alive", after: "alive" },
});

const depletedShellStoppedExchange = tieredHitExchange({
  routingVersion: 2,
  kind: "stopped",
  reason: "depletedMdcShell",
  nativeDamage: { type: "sdc", value: 5 },
  armor: {
    kind: "mdcArmor",
    itemId: "gladiator",
    name: "Gladiator Full Environmental Body Armor",
    before: 0,
    after: 0,
  },
  body: unchangedBody,
});

const fatalExchange = tieredHitExchange({
  routingVersion: 2,
  kind: "fatal",
  nativeDamage: { type: "md", value: 1 },
  convertedDamage: { type: "sdc", value: 100 },
  body: {
    before: { sdc: 20, hitPoints: 18 },
    after: { sdc: 0, hitPoints: -14 },
  },
  lifeState: { before: "alive", after: "dead" },
});

describe("combat weapon choices", () => {
  test("shows only owned weapons and enables legal catalog M.D. attacks", () => {
    const sheet = deriveSheet({
      ...combatant,
      items: [
        { itemId: "survival-knife" },
        { itemId: "canteen" },
        { itemId: "hand-axe" },
        { itemId: "automatic-pistol" },
        { itemId: "submachine-gun" },
        { itemId: "wilks-320-laser-pistol" },
        { itemId: "wilks-447-laser-rifle" },
      ],
    });

    expect(combatWeaponChoices(sheet)).toEqual([
      {
        index: 0,
        itemId: "survival-knife",
        label: "Survival Knife — 1D6 S.D.C.",
        supported: true,
      },
      { index: 2, itemId: "hand-axe", label: "Hand Axe — 1D6 S.D.C.", supported: true },
      {
        index: 3,
        itemId: "automatic-pistol",
        label: ".45 Automatic Pistol — 4D6 S.D.C.",
        supported: true,
      },
      {
        index: 4,
        itemId: "submachine-gun",
        label: "Submachine-Gun — 4D6 S.D.C.",
        supported: true,
      },
      {
        index: 5,
        itemId: "wilks-320-laser-pistol",
        label: "Wilk's 320 Laser Pistol — 1D6 M.D.",
        supported: true,
      },
      {
        index: 6,
        itemId: "wilks-447-laser-rifle",
        label: "Wilk's 447 Laser Rifle — 3D6 M.D.",
        supported: true,
      },
    ]);
  });

  test("retains generic invalid-mode copy without the obsolete M.D. refusal", () => {
    const combatExchangeSource = source("../src/lib/combat-exchange.ts");
    expect(combatExchangeSource).toContain("This weapon mode is not supported.");
    expect(combatExchangeSource).not.toContain("Full M.D.C. combat is follow-up work.");
  });
});

describe("combat target choices", () => {
  const targetId = "target-1" as CombatTargetSummary["id"];

  test.each([
    [
      "unrolled body",
      {
        id: targetId,
        name: "Unrolled body",
        ready: false,
        lifeState: "alive",
        protection: { kind: "none" },
        disabledReason: "defenderNotReady",
      },
      "Roll this target's H.P. and S.D.C. first.",
    ],
    [
      "unrolled armor",
      {
        id: targetId,
        name: "Unrolled armor",
        ready: false,
        lifeState: "alive",
        protection: {
          kind: "mdcArmor",
          itemId: "llw-concealed-light",
          name: "Ley Line Walker Concealed Armor (Light)",
        },
        disabledReason: "armorNotReady",
      },
      "Roll this target's worn armor M.D.C. first.",
    ],
    [
      "dead combatant",
      {
        id: targetId,
        name: "Dead combatant",
        ready: true,
        lifeState: "dead",
        protection: { kind: "none" },
        disabledReason: "combatantDead",
      },
      "Life signs terminated; this target cannot enter combat.",
    ],
  ] satisfies ReadonlyArray<readonly [string, CombatTargetSummary, string]>)(
    "maps the server's $0 reason to exact disabled copy",
    (_label, target, expected) => {
      expect(combatTargetDisabledReason(target)).toBe(expected);
    },
  );

  test.each([
    ["intact", 39],
    ["depleted", 0],
  ] as const)("keeps $0 M.D.C. protection enabled", (_label, current) => {
    expect(
      combatTargetDisabledReason({
        id: targetId,
        name: "M.D.C. target",
        ready: true,
        lifeState: "alive",
        protection: {
          kind: "mdcArmor",
          itemId: "llw-concealed-light",
          name: "Ley Line Walker Concealed Armor (Light)",
          max: 39,
          current,
        },
      }),
    ).toBeUndefined();
  });
});

describe("combat exchange presentation", () => {
  test("maps every result route to its semantic Ley Terminal tone", () => {
    const tones = [
      exchangeTone(stoppedMdcExchange),
      exchangeTone(nativeMdcArmorExchange),
      exchangeTone(depletedShellBodyExchange),
      exchangeTone(fatalExchange),
      exchangeTone(cancelledExchange()),
      exchangeTone(defendedExchange()),
    ];

    expect(tones).toEqual(["warn", "warn", "bad", "bad", "dim", "good"]);
    expect(tones).not.toContain("cyan");
  });

  test("retains pending, stale, miss, and legacy body tone compatibility", () => {
    expect([
      exchangeTone(pendingExchange()),
      exchangeTone(staleExchange()),
      exchangeTone(missedExchange()),
      exchangeTone(bodyHitExchange()),
    ]).toEqual(["warn", "warn", "dim", "bad"]);
  });

  test("formats pending, stale, cancelled, and miss summaries without invented result fields", () => {
    const lead = "Vesper → Deadboy :: Survival Knife :: d20[12]+3 = 15";
    expect(formatExchangeSummary(pendingExchange())).toBe(`${lead} :: AWAITING DEFENSE`);
    expect(formatExchangeSummary(staleExchange())).toBe(`${lead} :: STALE — COMBAT STATE CHANGED`);
    expect(formatExchangeSummary(cancelledExchange())).toBe(`${lead} :: CANCELLED`);
    expect(formatExchangeSummary(missedExchange())).toBe(`${lead} :: MISS (belowMinimum)`);

    for (const exchange of [
      pendingExchange(),
      staleExchange(),
      cancelledExchange(),
      missedExchange(),
    ]) {
      const summary = formatExchangeSummary(exchange);
      expect(summary).not.toContain("CRITICAL");
      expect(summary).not.toContain("ARMOR");
      expect(summary).not.toContain("BODY S.D.C.");
    }
  });

  test("includes a server-returned defense in a defended summary", () => {
    expect(formatExchangeSummary(defendedExchange())).toBe(
      "Vesper → Deadboy :: Survival Knife :: d20[12]+3 = 15 :: PARRY d20[16]+4 = 20 :: DEFENDED",
    );
  });

  test("includes critical, detailed damage, and the routed remaining body pools", () => {
    expect(formatExchangeSummary(bodyHitExchange())).toBe(
      "Vesper → Deadboy :: Survival Knife :: d20[12]+3 = 15 :: 1D6 [5]+1 = 6 RAW :: CRITICAL ×2 :: 12 S.D.C. FINAL → BODY S.D.C. 0 / H.P. 11",
    );
  });

  test("includes a failed defense and the remaining armor pool without fabricating body damage", () => {
    const summary = formatExchangeSummary(armorHitExchange());
    expect(summary).toBe(
      "Vesper → Deadboy :: Survival Knife :: d20[12]+3 = 15 :: PARRY d20[7]+2 = 9 :: 1D6 [4]+1 = 5 RAW :: ×1 :: 5 S.D.C. FINAL → ARMOR 15",
    );
    expect(summary).not.toContain("BODY S.D.C.");
    expect(summary).not.toContain("CRITICAL");
  });

  test.each([
    [
      "stopped S.D.C. against intact M.D.C.",
      stoppedMdcExchange,
      "96 S.D.C. -> M.D.C. ARMOR IMPERVIOUS — NO EFFECT :: ARMOR 10 M.D.C. -> 10 M.D.C.",
    ],
    [
      "persisted S.D.C.-to-M.D. conversion",
      convertedMdcArmorExchange,
      "496 S.D.C. -> 4 M.D. :: ARMOR 10 M.D.C. -> 6 M.D.C.",
    ],
    ["native M.D. armor ablation", nativeMdcArmorExchange, "6 M.D. :: ARMOR 10 M.D.C. -> 4 M.D.C."],
    [
      "final armor blast",
      finalBlastExchange,
      "21 M.D. :: ARMOR 3 M.D.C. -> 0 M.D.C. :: FINAL BLAST ABSORBED",
    ],
    [
      "M.D.-to-body conversion through a depleted shell",
      depletedShellBodyExchange,
      "1 M.D. -> 100 S.D.C. :: DEPLETED M.D.C. SHELL BYPASSED :: ARMOR 0 M.D.C. -> 0 M.D.C. :: BODY S.D.C. 120 -> 20 / H.P. 18 -> 18 :: LIFE ALIVE -> ALIVE",
    ],
    [
      "depleted shell stopping S.D.C.",
      depletedShellStoppedExchange,
      "5 S.D.C. -> DEPLETED M.D.C. SHELL STOPPED STRIKE :: ARMOR 0 M.D.C. -> 0 M.D.C.",
    ],
    [
      "fatal termination",
      fatalExchange,
      "1 M.D. -> 100 S.D.C. :: UNPROTECTED BODY :: BODY S.D.C. 20 -> 0 / H.P. 18 -> -14 :: LIFE ALIVE -> DEAD :: FATAL — LIFE SIGNS TERMINATED",
    ],
  ] as const)("formats $0 from persisted route evidence", (_label, exchange, routeSummary) => {
    expect(formatExchangeSummary(exchange)).toBe(
      `Vesper → Deadboy :: Survival Knife :: d20[12]+3 = 15 :: 1D6 [5]+1 = 6 ${exchange.attack.damageType === "md" ? "M.D." : "S.D.C."} RAW :: ×1 :: ${routeSummary}`,
    );
  });

  test("labels each exchange result by persisted route or terminal exchange state", () => {
    expect([
      exchangeResultLabel(stoppedMdcExchange),
      exchangeResultLabel(nativeMdcArmorExchange),
      exchangeResultLabel(depletedShellBodyExchange),
      exchangeResultLabel(fatalExchange),
      exchangeResultLabel(defendedExchange()),
      exchangeResultLabel(cancelledExchange()),
    ]).toEqual(["STOPPED", "ARMOR", "BODY", "FATAL", "DEFENDED", "CANCELLED"]);
  });
});

describe("async result ownership", () => {
  const owner = { routeId: "alpha", routeEpoch: 3, exchangeId: "exchange-1" };

  test("rejects a result from a different route, epoch, or expected exchange", () => {
    expect(ownsAsyncResult(owner, { ...owner, routeId: "beta" })).toBe(false);
    expect(ownsAsyncResult(owner, { ...owner, routeEpoch: 4 })).toBe(false);
    expect(ownsAsyncResult(owner, { ...owner, exchangeId: "exchange-2" })).toBe(false);
  });

  test("accepts a current owner only when every field is equal", () => {
    expect(ownsAsyncResult(owner, { ...owner })).toBe(true);
    expect(
      ownsAsyncResult({ routeId: "alpha", routeEpoch: 3 }, { routeId: "alpha", routeEpoch: 3 }),
    ).toBe(true);
  });
});

describe("combat errors", () => {
  test("prefers structured Convex messages and safely falls back", () => {
    expect(combatErrorMessage(new ConvexError({ code: "badCombat", message: "Not legal." }))).toBe(
      "Not legal.",
    );
    expect(combatErrorMessage(new Error("Network unavailable."))).toBe("Network unavailable.");
    expect(combatErrorMessage("Unknown combat error.")).toBe("Unknown combat error.");
  });
});

describe("combat exchange component contract", () => {
  test("suppresses terminal declaration and response controls while retaining cancellation and history", () => {
    expect(panelSource).toContain("gameplayDisabledReason?: string;");
    expect(panelSource).toContain(
      "const gameplayEnabled = () => props.gameplayDisabledReason === undefined",
    );
    expect(panelSource).toContain("LIFE SIGNS TERMINATED");
    expect(panelSource).toContain('<Alert tone="danger">');
    expect(panelSource).toContain("<Show when={gameplayEnabled()}>");

    const panelStart = panelSource.indexOf('<Panel class="space-y-3 p-3">');
    const declarationGate = panelSource.indexOf("<Show when={gameplayEnabled()}>", panelStart);
    const incomingGate = panelSource.indexOf(
      "<Show when={gameplayEnabled()}>",
      declarationGate + 1,
    );
    const declaration = panelSource.indexOf('{busy() ? "> TRANSMITTING…" : "> DECLARE ATTACK"}');
    const incoming = panelSource.indexOf("<IncomingExchangeRow", incomingGate);
    const outgoing = panelSource.indexOf("<OutgoingExchangeRow", incomingGate);
    const cancellation = panelSource.indexOf('{busy() ? "> CANCELLING…" : "> CANCEL"}');
    const recent = panelSource.indexOf('id="combat-recent-history"');
    expect(panelStart).toBeGreaterThanOrEqual(0);
    expect(declarationGate).toBeGreaterThan(panelStart);
    expect(incomingGate).toBeGreaterThan(declarationGate);
    expect(declaration).toBeGreaterThanOrEqual(0);
    expect(incoming).toBeGreaterThanOrEqual(0);
    expect(outgoing).toBeGreaterThanOrEqual(0);
    expect(cancellation).toBeGreaterThanOrEqual(0);
    expect(recent).toBeGreaterThanOrEqual(0);
    expect(declaration).toBeGreaterThan(declarationGate);
    expect(declaration).toBeLessThan(incomingGate);
    expect(incoming).toBeGreaterThan(incomingGate);
    expect(incoming).toBeLessThan(outgoing);
    expect(outgoing).toBeLessThan(recent);
  });

  test("shares native select and toggle primitives without rounded or decorative styling", () => {
    expect(uiSource).toContain('export function SelectInput(props: ComponentProps<"select">)');
    expect(uiSource).toContain("notch-8 border border-line bg-noir");
    expect(uiSource).toContain("focus:border-amber disabled:text-dead");
    expect(uiSource).toContain("export function ToggleChip");
    expect(characterSheetSource).not.toContain("function ToggleChip(");
  });

  test("keeps declaration and response modifier inputs inside their fixed grid tracks", () => {
    expect(panelSource).toMatch(
      /aria-label="Defense modifier"\s*inputmode="numeric"\s*class="w-full"/,
    );
    expect(panelSource).toMatch(
      /aria-label="Strike modifier"\s*inputmode="numeric"\s*class="w-full"/,
    );
  });

  test("subscribes every queue reactively and keeps strike, damage, and routing server-owned", () => {
    expect(panelSource).toContain("api.combat.targets");
    expect(panelSource).toContain("api.combat.incoming");
    expect(panelSource).toContain("api.combat.outgoing");
    expect(panelSource).toContain("api.combat.recent");
    expect(panelSource).toContain("api.combat.declareAttack");
    expect(panelSource).toContain("api.combat.respondToAttack");
    expect(panelSource).toContain("api.combat.cancelAttack");
    expect(panelSource).not.toMatch(/\brollD20\b|\brollDamage\b|\bresolveCombatExchange\b/);
    const declarationStart = panelSource.indexOf("const result = await declareAttack({");
    const declarationEnd = panelSource.indexOf("\n      });", declarationStart);
    expect(declarationStart).toBeGreaterThanOrEqual(0);
    expect(declarationEnd).toBeGreaterThan(declarationStart);
    expect(panelSource.slice(declarationStart, declarationEnd)).not.toMatch(
      /strikeRoll\s*:|damageRoll\s*:|route\s*:/,
    );
  });

  test("renders stored context before only the stored server response options", () => {
    expect(panelSource).toContain("STORED CONTEXT");
    expect(panelSource).toContain("exchange().context.defenderAware");
    expect(panelSource).toContain("exchange().defenseOptions");
    expect(panelSource.indexOf("STORED CONTEXT")).toBeLessThan(
      panelSource.indexOf("exchange().defenseOptions"),
    );
    expect(panelSource).toContain('option.kind === "none" ? "> TAKE THE HIT"');
    expect(panelSource).toContain("option.actionCost} ACTION");
  });

  test("keeps take-the-hit independent from draft defense modifiers", () => {
    expect(panelSource).toContain('const usesDefense = kind !== "none";');
    expect(panelSource).toMatch(
      /if \(\s*usesDefense &&\s*\(modifier === undefined \|\| \(modifier !== 0 && defenseReason\(\)\.trim\(\) === ""\)\)\s*\)\s*return;/,
    );
    expect(panelSource).toContain(
      'disabled={busy() || (option.kind !== "none" && !responseReady())}',
    );
    expect(panelSource).toContain("...(usesDefense && modifier !== 0");
    expect(panelSource).toContain('...(usesDefense && defenseReason().trim() !== ""');
  });

  test("resets route state and gates declaration, response, and cancellation by ownership", () => {
    expect(panelSource).toContain("const resetRouteState = () => {");
    expect(panelSource).toContain("routeEpoch += 1");
    expect(panelSource).toContain(
      "createEffect(on(() => props.characterId, resetRouteState, { defer: true }))",
    );
    expect(panelSource).toContain("routeId: props.characterId");
    expect(panelSource).toContain("routeEpoch: props.routeEpoch()");
    expect(panelSource).toContain("exchangeId: props.exchangeId");
    expect(panelSource).toContain("ownsAsyncResult(owner, current)");
  });

  test("invalidates the component lifetime when cleanup runs", () => {
    const cleanupStart = panelSource.indexOf("onCleanup(() => {");
    const cleanupEnd = panelSource.indexOf("\n  });", cleanupStart);
    expect(cleanupStart).toBeGreaterThanOrEqual(0);
    expect(cleanupEnd).toBeGreaterThan(cleanupStart);
    expect(panelSource.slice(cleanupStart, cleanupEnd)).toContain("routeEpoch += 1");
  });

  test("keys queue row state by stable exchange ids instead of refreshed object identity", () => {
    expect(panelSource).toMatch(
      /const incomingIds = createMemo\(\(\) =>\s*pendingIncoming\(\)\.map\(\(exchange\) => exchange\._id\)/,
    );
    expect(panelSource).toMatch(
      /const outgoingIds = createMemo\(\(\) =>\s*pendingOutgoing\(\)\.map\(\(exchange\) => exchange\._id\)/,
    );
    expect(panelSource).toContain("<For each={incomingIds()}>");
    expect(panelSource).toContain("<For each={outgoingIds()}>");
    expect(panelSource).toContain("exchange={() => incomingById(exchangeId)}");
    expect(panelSource).toContain("exchange={() => outgoingById(exchangeId)}");
    expect(panelSource).not.toContain("<For each={pendingIncoming()}>");
    expect(panelSource).not.toContain("<For each={outgoing.data()}>");
  });

  test("uses green for an immediate miss and amber for a pending defense", () => {
    const declarationStart = panelSource.indexOf("const submitDeclaration = async () => {");
    const noticeStart = panelSource.indexOf("setNotice(\n        result.status", declarationStart);
    const noticeEnd = panelSource.indexOf("\n      );", noticeStart);
    expect(noticeStart).toBeGreaterThanOrEqual(0);
    expect(noticeEnd).toBeGreaterThan(noticeStart);
    const notice = panelSource.slice(noticeStart, noticeEnd);
    expect(notice).toMatch(/result\.status === "resolved"\s*\? \{ tone: "ok"/s);
    expect(notice).toMatch(/: \{\s*tone: "warn".*AWAITING DEFENSE/s);
  });

  test("clears a pending declaration notice after that exchange resolves", () => {
    expect(panelSource).toContain("exchangeId: result._id");
    expect(panelSource).toMatch(
      /const currentNotice = notice\(\);[\s\S]*recent\s*\.data\(\)\s*\?\.find\([\s\S]*currentNotice\.exchangeId[\s\S]*matchingExchange\.status !== "pendingDefense"[\s\S]*setNotice\(undefined\)/,
    );
  });

  test("keeps persisted combat history bounded and uses no magic signal tone", () => {
    expect(panelSource).toContain("formatExchangeSummary(exchange)");
    expect(panelSource).toContain("exchangeResultLabel(exchange)");
    expect(panelSource).toMatch(
      /<MonoLabel[^>]*>\s*\{exchangeResultLabel\(exchange\)\}\s*<\/MonoLabel>/,
    );
    expect(panelSource).toContain("exchangeTone(exchange)");
    expect(panelSource).toContain("recent.data()?.slice(0, 20)");
    expect(panelSource).toContain('dim: "border-dead text-muted"');
    expect(panelSource).toContain('warn: "border-amber text-amber"');
    expect(panelSource).toContain('bad: "border-blood text-blood-text"');
    expect(panelSource).toContain('good: "border-ok text-ok"');
    expect(panelSource).not.toMatch(/border-ley|text-ley/);
  });

  test("forces result labels to inherit the semantic row tone over MonoLabel muted text", () => {
    expect(uiSource).toContain(
      'font-mono text-[11.5px] tracking-[0.14em] text-muted uppercase ${own.class ?? ""}',
    );
    expect(panelSource).toContain(
      '<MonoLabel class="block !text-inherit">{exchangeResultLabel(exchange)}</MonoLabel>',
    );
  });

  test("associates the recent-history disclosure with its controlled list", () => {
    expect(panelSource).toContain('aria-controls="combat-recent-history"');
    expect(panelSource).toContain('<ol id="combat-recent-history"');
  });

  test("mounts combat above telemetry under one complementary rail landmark", () => {
    expect(characterSheetSource).toContain('aria-label="Dossier command rail"');
    expect(characterSheetSource).toContain("<CombatExchangePanel");
    expect(characterSheetSource.indexOf("<CombatExchangePanel")).toBeLessThan(
      characterSheetSource.indexOf("<TelemetryRail"),
    );
    expect(telemetryRailSource).toContain(
      '<section class="flex min-h-0 flex-col gap-2.5" aria-label="Field telemetry">',
    );
    expect(telemetryRailSource).not.toContain(
      '<aside class="flex min-h-0 flex-col gap-2.5" aria-label="Field telemetry">',
    );
  });
});
