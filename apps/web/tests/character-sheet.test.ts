/// <reference types="node" />

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";

const TERMINAL_REASON = "Life signs terminated; gameplay actions are unavailable.";

function source(relative: string): string {
  const url = new URL(relative, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const characterSheetSource = source("../src/pages/character-sheet.tsx");
const sheetViewSource = source("../src/components/sheet-view.tsx");
const appLayoutSource = source("../src/layouts/app.tsx");
const indexHtmlSource = source("../index.html");

describe("application shell", () => {
  test("declares a favicon without an extra network request", () => {
    expect(indexHtmlSource).toContain('<link rel="icon" href="data:," />');
  });

  test("stacks dossier hero metadata on narrow viewports", () => {
    expect(appLayoutSource).toContain('class="flex flex-1 flex-col sm:flex-row"');
    expect(appLayoutSource).toContain(
      'class="w-full shrink-0 border-b border-line bg-surface py-4 sm:w-44 sm:border-r sm:border-b-0"',
    );
    expect(sheetViewSource).toContain('<header class="flex flex-col gap-5 sm:flex-row">');
    expect(sheetViewSource).toContain(
      'class="flex shrink-0 flex-col items-start gap-3 sm:items-end"',
    );
    expect(sheetViewSource).toContain(
      'class="text-left font-mono text-[11.5px] leading-[1.9] text-muted sm:text-right"',
    );
  });
});

describe("terminal sheet dossier", () => {
  test("retains the dossier while disabling every gameplay roll with the terminal reason", () => {
    expect(characterSheetSource).toContain(TERMINAL_REASON);
    expect(sheetViewSource).toContain("gameplayDisabledReason?: string;");
    expect(sheetViewSource).toContain("LIFE SIGNS TERMINATED");
    expect(sheetViewSource).toContain("{reason()}");
    expect(sheetViewSource).toContain("<h1");
    expect(sheetViewSource).toContain("<SectionTitle>VITALS</SectionTitle>");
    expect(sheetViewSource).toContain("<SectionTitle>EQUIPMENT — MANIFEST");
    expect(sheetViewSource).toContain("<SectionTitle>PERSONNEL FILE — NARRATIVE</SectionTitle>");

    expect(
      sheetViewSource.match(/disabled=\{props\.gameplayDisabledReason !== undefined\}/g),
    ).toHaveLength(5);
    expect(
      sheetViewSource.match(/title=\{props\.gameplayDisabledReason \?\? "Roll"\}/g),
    ).toHaveLength(5);
    expect(sheetViewSource).toContain('title={props.gameplayDisabledReason ?? "Roll damage"}');
    expect(sheetViewSource).toContain(
      "aria-disabled={props.gameplayDisabledReason !== undefined || undefined}",
    );
    const spellGate = sheetViewSource.indexOf("const blocked = () =>");
    const terminalPrecedence = sheetViewSource.indexOf(
      "props.gameplayDisabledReason ??",
      spellGate,
    );
    const affordability = sheetViewSource.indexOf('"Insufficient P.P.E."', spellGate);
    expect(spellGate).toBeGreaterThanOrEqual(0);
    expect(terminalPrecedence).toBeGreaterThan(spellGate);
    expect(terminalPrecedence).toBeLessThan(affordability);
  });

  test("keeps inventory controls usable for a terminal dossier", () => {
    expect(sheetViewSource).toContain("props.actions!.equipArmor(");
    expect(sheetViewSource).toContain("props.actions!.discardItem(");
    expect(sheetViewSource).toContain("<AcquireControl");
    expect(sheetViewSource).toContain("actions={props.actions}");
    expect(sheetViewSource).toContain("gameplayDisabledReason={props.gameplayDisabledReason}");
  });

  test("leaves all existing gameplay and inventory controls wired for a living dossier", () => {
    expect(sheetViewSource).toContain("props.actions!.rollCombat");
    expect(sheetViewSource).toContain("props.actions!.rollSave");
    expect(sheetViewSource).toContain("props.actions!.rollSkill");
    expect(sheetViewSource).toContain("props.actions!.castSpell");
    expect(sheetViewSource).toContain("props.actions!.rollWeapon");
    expect(sheetViewSource).not.toContain("actions={undefined}");
  });
});

describe("terminal command rail and parameter navigation", () => {
  test("keeps narrative and telemetry but replaces terminal gameplay controls with the danger alert", () => {
    expect(characterSheetSource).toContain("const TERMINAL_GAMEPLAY_REASON =");
    expect(characterSheetSource).toContain('sheet()?.vitals.lifeState === "dead"');
    expect(characterSheetSource).toContain(
      "<SheetView\n                sheet={sheet()!}\n                actions={actions}\n                gameplayDisabledReason={gameplayDisabledReason()}",
    );
    expect(characterSheetSource).toContain(
      "<CombatExchangePanel\n                characterId={id()}\n                sheet={sheet()!}\n                gameplayDisabledReason={gameplayDisabledReason()}",
    );
    expect(characterSheetSource).toContain("<NarrativeEditor");
    expect(characterSheetSource).toContain("<TelemetryRail");
    expect(characterSheetSource).toContain("LIFE SIGNS TERMINATED");
    expect(characterSheetSource).toContain('<Alert tone="danger">');
    expect(characterSheetSource).toContain('{"> Roll Vitals"}');
    expect(characterSheetSource).toContain('{"> Damage"}');
    expect(characterSheetSource).toContain('{"> Full Restore"}');
    expect(characterSheetSource).toContain('{"> Rest"}');
    expect(characterSheetSource).toContain('{"> Meditate"}');
    expect(characterSheetSource).toContain('{"> Ley Draw"}');
    expect(characterSheetSource).toContain('{"> Treatment Day"}');

    const rail = characterSheetSource.indexOf("<TelemetryRail");
    const terminalGate = characterSheetSource.indexOf("when={gameplayDisabledReason()}", rail);
    const fallback = characterSheetSource.indexOf("fallback={", terminalGate);
    const roll = characterSheetSource.indexOf('{"> Roll Vitals"}', fallback);
    const terminalAlert = characterSheetSource.indexOf("LIFE SIGNS TERMINATED", roll);
    expect(rail).toBeGreaterThanOrEqual(0);
    expect(terminalGate).toBeGreaterThan(rail);
    expect(fallback).toBeGreaterThan(terminalGate);
    expect(roll).toBeGreaterThan(fallback);
    expect(terminalAlert).toBeGreaterThan(roll);
  });

  test("resets every command draft and invalidates in-flight results on route changes", () => {
    expect(characterSheetSource).toContain("let routeEpoch = 0");
    const resetStart = characterSheetSource.indexOf("createEffect(\n    on(\n      id,");
    const resetEnd = characterSheetSource.indexOf("\n  );", resetStart);
    expect(resetStart).toBeGreaterThanOrEqual(0);
    expect(resetEnd).toBeGreaterThan(resetStart);
    const reset = characterSheetSource.slice(resetStart, resetEnd);
    expect(reset).toContain("routeEpoch += 1");
    expect(reset).toContain('setDamageInput("")');
    expect(reset).toContain("setToArmor(false)");
    expect(reset).toContain('setRestHours("")');
    expect(reset).toContain("setAtNexus(false)");
    expect(reset).toContain("setProfessional(false)");
    expect(reset).toContain('setDayInput("")');
    expect(characterSheetSource.match(/const owner = routeOwner\(\)/g)).toHaveLength(10);
    expect(characterSheetSource.match(/if \(!ownsRoute\(owner\)\) return/g)).toHaveLength(22);
    expect(characterSheetSource).not.toContain("<Keyed");
  });
});
