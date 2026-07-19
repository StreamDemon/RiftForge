/// <reference types="node" />

import { deriveSheet, type CharacterInput } from "@riftforge/rules";
import { ConvexError } from "convex/values";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";
import {
  combatErrorMessage,
  combatTargetDisabledReason,
  combatWeaponChoices,
  exchangeTone,
  formatExchangeSummary,
  ownsAsyncResult,
  type CombatTargetSummary,
  type ExchangeSummary,
} from "../src/lib/combat-exchange.ts";

function source(relative: string): string {
  const url = new URL(relative, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

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

describe("combat weapon choices", () => {
  test("shows only owned weapons and keeps the full M.D.C. boundary visible", () => {
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
        supported: false,
        disabledReason: "Full M.D.C. combat is follow-up work.",
      },
      {
        index: 6,
        itemId: "wilks-447-laser-rifle",
        label: "Wilk's 447 Laser Rifle — 3D6 M.D.",
        supported: false,
        disabledReason: "Full M.D.C. combat is follow-up work.",
      },
    ]);
  });
});

describe("combat target choices", () => {
  const targetId = "target-1" as CombatTargetSummary["id"];

  test("explains unready and M.D.C.-protected targets precisely", () => {
    expect(
      combatTargetDisabledReason({
        id: targetId,
        name: "Unready",
        ready: false,
        protection: "none",
        disabledReason: "defenderNotReady",
      }),
    ).toBe("Roll this target's H.P. and S.D.C. first.");
    expect(
      combatTargetDisabledReason({
        id: targetId,
        name: "M.D.C. Target",
        ready: true,
        protection: "mdcArmor",
        disabledReason: "unsupportedMdcProtection",
      }),
    ).toBe("Full M.D.C. combat is follow-up work.");
    expect(
      combatTargetDisabledReason({
        id: targetId,
        name: "Ready",
        ready: true,
        protection: "sdcArmor",
      }),
    ).toBeUndefined();
  });
});

describe("combat exchange presentation", () => {
  test("maps combat state to Ley Terminal tones without a cyan state", () => {
    const tones = [
      exchangeTone(pendingExchange()),
      exchangeTone(staleExchange()),
      exchangeTone(cancelledExchange()),
      exchangeTone(missedExchange()),
      exchangeTone(defendedExchange()),
      exchangeTone(bodyHitExchange()),
    ];

    expect(tones).toEqual(["warn", "warn", "dim", "dim", "good", "bad"]);
    expect(tones).not.toContain("cyan");
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
  test("shares native select and toggle primitives without rounded or decorative styling", () => {
    expect(uiSource).toContain('export function SelectInput(props: ComponentProps<"select">)');
    expect(uiSource).toContain("notch-8 border border-line bg-noir");
    expect(uiSource).toContain("focus:border-amber disabled:text-dead");
    expect(uiSource).toContain("export function ToggleChip");
    expect(characterSheetSource).not.toContain("function ToggleChip(");
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
    expect(notice).toMatch(/: \{ tone: "warn".*AWAITING DEFENSE/s);
  });

  test("keeps persisted combat history bounded and uses no magic signal tone", () => {
    expect(panelSource).toContain("formatExchangeSummary(exchange)");
    expect(panelSource).toContain("exchangeTone(exchange)");
    expect(panelSource).toContain("recent.data()?.slice(0, 20)");
    expect(panelSource).toContain('dim: "border-dead text-muted"');
    expect(panelSource).toContain('warn: "border-amber text-amber"');
    expect(panelSource).toContain('bad: "border-blood text-blood-text"');
    expect(panelSource).toContain('good: "border-ok text-ok"');
    expect(panelSource).not.toMatch(/border-ley|text-ley/);
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
