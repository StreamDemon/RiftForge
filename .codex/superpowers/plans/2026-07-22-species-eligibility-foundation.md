# Species Identity and O.C.C. Eligibility Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver issue #60 by adding source-stamped Human/Psi-Stalker identity, structured O.C.C. species eligibility, shared species-and-attribute validation, explicit new-character persistence, and locked-Human builder/sheet presentation without implementing playable Psi-Stalkers or psionics.

**Architecture:** Add a small validated species catalog beside the existing rules catalogs, replace O.C.C. racial prose with an `any | oneOf` eligibility union, and centralize species plus attribute checks in one pure validator. `deriveSheet` becomes the semantic authority used by Convex writes, while SolidJS consumes the same structured result for gating and explanation. Storage keeps `speciesId` optional only for old documents; the rules parser derives missing legacy identity as Human, while the public create mutation requires an explicit species.

**Tech Stack:** TypeScript, Zod 4, page-stamped JSON rules content, Convex 1.x, SolidJS 1.9, Tailwind CSS 4, Vite+ (`vp`), Vite+ Test, pnpm.

## Global Constraints

- Work in the main checkout at `D:\Projects\riftforge`; do not create a worktree.
- Before Task 1, create `feat/species-eligibility` from the current approved-design commit so the spec and this plan remain in the implementation PR:

  ```powershell
  git switch -c feat/species-eligibility
  ```

- Treat `.codex/superpowers/specs/2026-07-22-occ-breadth-foundation-design.md` and issue #60 as the approved contract.
- Treat the rendered RUE p.233 page as the authority for the Human/Psi-Stalker Grunt eligibility fixture. The page wins over memory or this plan.
- Keep production Coalition Grunt content in #57. Issue #60 proves the restricted rule with a focused test fixture only.
- Human is the only playable species. Psi-Stalker is known but unavailable; do not add R.C.C., I.S.P., psychic powers, or psionics behavior.
- Existing documents without `speciesId` derive as Human without a bulk rewrite. New `characters.create` calls require explicit `speciesId`.
- O.C.C. eligibility is structured as `any | oneOf`; never parse free text.
- Use one pure combined validator for species availability, O.C.C. species rules, and attribute requirements. Builder and `deriveSheet` consume the same result; Convex relies on `deriveSheet` for semantic rejection.
- Rules functions stay pure and deterministic. Content contradictions fail at import; write contradictions fail before persistence.
- Use Vite+. In `packages/backend`, run `pnpm exec`, never `npx`.
- Work red -> green -> refactor. Run the affected package gates after every task and checkpoint-commit every task.
- Preserve the Ley Terminal design in `DESIGN.md`; Human is a locked identity field, not a new empty wizard step.
- No AI attribution. Never commit to `main`, merge a PR, remove #57's `needs:species` label, close #60, or activate #61 before the human merge is synchronized and verified.
- User-visible work requires live-browser acceptance, including parameter-route navigation ownership and a clean console.

---

## File Map

### Species content and rules

- Create `packages/rules/src/schema/species.ts`: source-stamped species and catalog schemas.
- Create `packages/rules/src/content/species/species.json`: Human playable; Psi-Stalker known and unavailable, both sourced to p.233 for this boundary.
- Create `packages/rules/src/engine/species.ts`: catalog parsing, duplicate detection, ID lookup, and required Human invariant.
- Create `packages/rules/src/engine/eligibility.ts`: combined species/playability/O.C.C./attribute validation and stable failure formatting.
- Modify `packages/rules/src/schema/occ.ts`: required `speciesEligibility` union and explicit rejection of legacy `racialRequirement` prose.
- Modify `packages/rules/src/content/occ/ley-line-walker.json`: replace racial prose with structured `any` eligibility.
- Modify `packages/rules/src/engine/occ.ts`: fail-fast O.C.C.-to-species reference validation.
- Modify `packages/rules/src/engine/builder.ts`: remove the duplicate attribute-only validator.
- Modify `packages/rules/src/index.ts`: export the new schema and engines.
- Create `packages/rules/tests/species.test.ts` and `packages/rules/tests/eligibility.test.ts`.
- Modify `packages/rules/tests/occ.test.ts` and `packages/rules/tests/builder.test.ts`.

### Character derivation and backend

- Modify `packages/rules/src/schema/character.ts`: default missing legacy `speciesId` to `human`.
- Modify `packages/rules/src/engine/character.ts`: enforce eligibility and return resolved species on `CharacterSheet`.
- Modify `packages/rules/tests/character.test.ts`: explicit/legacy identity, attributes, unknown/unavailable failures, and sheet projection.
- Modify `packages/backend/convex/schema.ts`: optional stored field for legacy compatibility.
- Modify `packages/backend/convex/characters.ts`: require explicit species only on new-character creation.
- Modify `packages/backend/tests/characters.test.ts`, `healing-cast.test.ts`, and `combat.test.ts`: explicit new-write fixtures plus backend/legacy coverage.

### Web and delivery

- Modify `apps/web/src/builder/store.ts`: locked Human draft identity, shared eligibility memo, and explicit create input.
- Modify `apps/web/src/builder/steps/identity.tsx`: display Human as a locked source-owned field.
- Modify `apps/web/src/builder/steps/occ.tsx`: use shared eligibility and explain species plus attribute failures.
- Modify `apps/web/src/components/sheet-view.tsx`: display resolved species in the dossier header.
- Create `apps/web/tests/builder.test.ts`: reactive store and source-contract coverage.
- Modify `apps/web/tests/character-sheet.test.ts`: dossier species contract.
- Modify `README.md`: record the current Human-only species identity boundary.

---

### Task 1: Render the Source and Add the Species Catalog

**Files:** Create `packages/rules/src/schema/species.ts`, `packages/rules/src/content/species/species.json`, `packages/rules/src/engine/species.ts`, and `packages/rules/tests/species.test.ts`; modify `packages/rules/src/index.ts`.

**Interfaces:**

- Produces `Species`, `SpeciesCatalog`, `speciesCatalog`, `buildSpeciesIndex(...)`, `getSpecies(id)`, and `humanSpecies`.
- `Species.playable` means the identity is legal for a new persisted character; known unavailable identities still resolve through `getSpecies`.
- Every entry carries its own `SourceRef` because availability facts may come from different printed pages as the catalog grows.

- [ ] **Step 1: Render and inspect printed p.233**

  Create an explicit temporary directory and render PDF index 235 (`233 + 2`) at 2.2x:

  ```powershell
  New-Item -ItemType Directory -Force -LiteralPath 'C:\Users\Reven\AppData\Local\Temp\riftforge-species60-20260722' | Out-Null
  python -c "import fitz; d=fitz.open('docs/rules/Rifts-Ultimate-Edition-Main-Book.pdf'); d[235].get_pixmap(matrix=fitz.Matrix(2.2,2.2)).save(r'C:\Users\Reven\AppData\Local\Temp\riftforge-species60-20260722\p235.png')"
  ```

  Visually inspect `p235.png`. Confirm only the boundary used here: the Coalition Grunt racial requirement admits Humans and Psi-Stalkers. Do not transcribe Psi-Stalker mechanics from this mention.

- [ ] **Step 2: Write the failing catalog tests**

  Create `packages/rules/tests/species.test.ts`:

  ```ts
  import { describe, expect, test } from "vite-plus/test";
  import {
    buildSpeciesIndex,
    getSpecies,
    humanSpecies,
    speciesCatalog,
    type Species,
  } from "../src/index.ts";

  describe("species catalog — first O.C.C. breadth boundary", () => {
    test("pins the complete two-entry catalog and p.233 source", () => {
      expect(speciesCatalog.species).toHaveLength(2);
      expect(speciesCatalog.species.map((species) => species.id)).toEqual(["human", "psi-stalker"]);
      expect(humanSpecies).toMatchObject({ id: "human", name: "Human", playable: true });
      expect(getSpecies("psi-stalker")).toMatchObject({
        name: "Psi-Stalker",
        playable: false,
        source: { book: "Rifts Ultimate Edition", page: 233 },
      });
      expect(getSpecies("unknown")).toBeUndefined();
    });

    test("rejects duplicate ids instead of shadowing entries", () => {
      const duplicate: Species[] = [humanSpecies, { ...humanSpecies, name: "Duplicate" }];
      expect(() => buildSpeciesIndex(duplicate)).toThrow('Duplicate species id "human"');
    });
  });
  ```

- [ ] **Step 3: Run the test and observe the missing exports**

  Run:

  ```powershell
  vp test packages/rules/tests/species.test.ts
  ```

  Expected: FAIL because the species schema, catalog, and engine exports do not exist.

- [ ] **Step 4: Implement the schema and content**

  Create `packages/rules/src/schema/species.ts`:

  ```ts
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
  ```

  Create `packages/rules/src/content/species/species.json` with the visually verified page stamp:

  ```json
  {
    "book": "Rifts Ultimate Edition",
    "species": [
      {
        "source": {
          "book": "Rifts Ultimate Edition",
          "page": 233,
          "table": "Coalition Grunt O.C.C. Racial Requirements"
        },
        "id": "human",
        "name": "Human",
        "playable": true
      },
      {
        "source": {
          "book": "Rifts Ultimate Edition",
          "page": 233,
          "table": "Coalition Grunt O.C.C. Racial Requirements"
        },
        "id": "psi-stalker",
        "name": "Psi-Stalker",
        "playable": false,
        "availabilityNote": "Known eligibility identity only; playable Psi-Stalker and psionics rules are deferred."
      }
    ]
  }
  ```

- [ ] **Step 5: Implement lookup and load-time invariants**

  Create `packages/rules/src/engine/species.ts`:

  ```ts
  import speciesRaw from "../content/species/species.json" with { type: "json" };
  import { speciesCatalogSchema, type Species } from "../schema/species.ts";

  export const speciesCatalog = speciesCatalogSchema.parse(speciesRaw);

  export function buildSpeciesIndex(species: readonly Species[]): Map<string, Species> {
    const byId = new Map<string, Species>();
    for (const entry of species) {
      if (byId.has(entry.id)) throw new Error(`Duplicate species id "${entry.id}".`);
      byId.set(entry.id, entry);
    }
    return byId;
  }

  const speciesById = buildSpeciesIndex(speciesCatalog.species);

  export function getSpecies(id: string): Species | undefined {
    return speciesById.get(id);
  }

  const human = getSpecies("human");
  if (human === undefined || human.playable !== true) {
    throw new Error('Species catalog must contain playable species "human".');
  }
  export const humanSpecies: Species = human;
  ```

  Export both new modules from `packages/rules/src/index.ts`:

  ```ts
  export * from "./schema/species.ts";
  export * from "./engine/species.ts";
  ```

- [ ] **Step 6: Run the focused and package gates**

  Run:

  ```powershell
  vp test packages/rules/tests/species.test.ts
  vp run @riftforge/rules#check
  vp run @riftforge/rules#test
  ```

  Expected: all commands PASS; the focused test reports both catalog tests passing.

- [ ] **Step 7: Commit the catalog**

  ```powershell
  git add -- packages/rules/src/schema/species.ts packages/rules/src/content/species/species.json packages/rules/src/engine/species.ts packages/rules/src/index.ts packages/rules/tests/species.test.ts
  git commit -m "feat(rules): add species catalog"
  ```

---

### Task 2: Replace Racial Prose with Structured O.C.C. Eligibility

**Files:** Modify `packages/rules/src/schema/occ.ts`, `packages/rules/src/content/occ/ley-line-walker.json`, `packages/rules/src/engine/occ.ts`, `packages/rules/tests/occ.test.ts`, and `packages/rules/tests/builder.test.ts`.

**Interfaces:**

- Produces `SpeciesEligibility = { kind: "any" } | { kind: "oneOf"; speciesIds: string[] }`.
- Produces `validateOccSpeciesReferences(occ): void` for import-time cross-catalog validation.
- `racialRequirement` is explicitly illegal even though `occSchema` retains `.catchall(...)` for other rich O.C.C. content.

- [ ] **Step 1: Add failing schema and source-reference tests**

  Extend `packages/rules/tests/occ.test.ts` with:

  ```ts
  import {
    basePpeRange,
    getOcc,
    leyLineWalker,
    occSchema,
    rollBasePpe,
    validateOccSpeciesReferences,
  } from "../src/index.ts";

  const gruntEligibilityFixture = occSchema.parse({
    source: { book: "Rifts Ultimate Edition", page: 233 },
    id: "coalition-grunt-eligibility-fixture",
    name: "Coalition Grunt eligibility fixture",
    category: "Men at Arms",
    alignment: "Any",
    attributeRequirements: [],
    speciesEligibility: { kind: "oneOf", speciesIds: ["human", "psi-stalker"] },
  });

  test("Ley Line Walker accepts any playable species through structured content", () => {
    expect(leyLineWalker.speciesEligibility).toEqual({ kind: "any" });
    expect("racialRequirement" in leyLineWalker).toBe(false);
  });

  test("the p.233 Grunt fixture references Human and Psi-Stalker", () => {
    expect(gruntEligibilityFixture.speciesEligibility).toEqual({
      kind: "oneOf",
      speciesIds: ["human", "psi-stalker"],
    });
    expect(() => validateOccSpeciesReferences(gruntEligibilityFixture)).not.toThrow();
  });

  test("rejects legacy prose, empty/duplicate lists, and unknown species references", () => {
    const base = {
      source: { book: "Rifts Ultimate Edition", page: 233 },
      id: "invalid",
      name: "Invalid",
      category: "Test",
      alignment: "Any",
      attributeRequirements: [],
    };
    expect(() => occSchema.parse({ ...base, racialRequirement: "Humans only" })).toThrow();
    expect(() =>
      occSchema.parse({ ...base, speciesEligibility: { kind: "oneOf", speciesIds: [] } }),
    ).toThrow();
    expect(() =>
      occSchema.parse({
        ...base,
        speciesEligibility: { kind: "oneOf", speciesIds: ["human", "human"] },
      }),
    ).toThrow();
    const unknown = occSchema.parse({
      ...base,
      speciesEligibility: { kind: "oneOf", speciesIds: ["human", "kryptonian"] },
    });
    expect(() => validateOccSpeciesReferences(unknown)).toThrow(
      'O.C.C. "invalid" references unknown species "kryptonian".',
    );
  });
  ```

- [ ] **Step 2: Run the O.C.C. tests and observe the missing structure**

  Run:

  ```powershell
  vp test packages/rules/tests/occ.test.ts
  ```

  Expected: FAIL because `speciesEligibility` and `validateOccSpeciesReferences` do not exist and Ley Line Walker still carries racial prose.

- [ ] **Step 3: Add the discriminated schema**

  Add to `packages/rules/src/schema/occ.ts` before `occSchema`:

  ```ts
  export const speciesEligibilitySchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("any") }),
    z.object({
      kind: z.literal("oneOf"),
      speciesIds: z
        .array(z.string().min(1))
        .min(1)
        .refine((ids) => new Set(ids).size === ids.length, {
          message: "O.C.C. species eligibility cannot contain duplicate ids.",
        }),
    }),
  ]);
  export type SpeciesEligibility = z.infer<typeof speciesEligibilitySchema>;
  ```

  Replace the old field inside `occSchema` with:

  ```ts
  speciesEligibility: speciesEligibilitySchema,
  racialRequirement: z.never().optional(),
  ```

  In `packages/rules/src/content/occ/ley-line-walker.json`, replace:

  ```json
  "racialRequirement": "None. At least 30% are D-Bees."
  ```

  with:

  ```json
  "speciesEligibility": { "kind": "any" }
  ```

- [ ] **Step 4: Add fail-fast cross-catalog validation**

  In `packages/rules/src/engine/occ.ts`, import `getSpecies` and add:

  ```ts
  export function validateOccSpeciesReferences(occ: Occ): void {
    if (occ.speciesEligibility.kind === "any") return;
    for (const speciesId of occ.speciesEligibility.speciesIds) {
      if (getSpecies(speciesId) === undefined) {
        throw new Error(`O.C.C. "${occ.id}" references unknown species "${speciesId}".`);
      }
    }
  }

  validateOccSpeciesReferences(leyLineWalker);
  ```

  Run validation before placing the O.C.C. in `occRegistry`.

- [ ] **Step 5: Update every synthetic O.C.C. fixture**

  In `packages/rules/tests/builder.test.ts`, add this exact required field to the synthetic objects currently parsed at the five `occSchema.parse(...)` call sites:

  ```ts
  speciesEligibility: { kind: "any" },
  ```

  Do not weaken the production schema with a default merely to preserve test fixtures.

- [ ] **Step 6: Run focused and package validation**

  ```powershell
  vp test packages/rules/tests/occ.test.ts packages/rules/tests/builder.test.ts
  vp run @riftforge/rules#check
  vp run @riftforge/rules#test
  ```

  Expected: PASS; the Grunt fixture remains test-only and `occRegistry` still contains only Ley Line Walker.

- [ ] **Step 7: Commit structured O.C.C. eligibility**

  ```powershell
  git add -- packages/rules/src/schema/occ.ts packages/rules/src/content/occ/ley-line-walker.json packages/rules/src/engine/occ.ts packages/rules/tests/occ.test.ts packages/rules/tests/builder.test.ts
  git commit -m "feat(rules): structure OCC species eligibility"
  ```

---

### Task 3: Centralize Species and Attribute Eligibility

**Files:** Create `packages/rules/src/engine/eligibility.ts` and `packages/rules/tests/eligibility.test.ts`; modify `packages/rules/src/engine/builder.ts`, `packages/rules/src/index.ts`, and `packages/rules/tests/builder.test.ts`.

**Interfaces:**

```ts
export type OccEligibilityFailure =
  | { kind: "unknownSpecies"; speciesId: string }
  | { kind: "unavailableSpecies"; speciesId: string; name: string }
  | { kind: "speciesNotAllowed"; speciesId: string; allowedSpeciesIds: string[] }
  | { kind: "attribute"; code: AttributeCode; min: number; actual: number };

export interface OccEligibilityResult {
  ok: boolean;
  species?: Species;
  failures: OccEligibilityFailure[];
}

export function validateOccEligibility(
  occ: Occ,
  speciesId: string,
  attributes: Partial<Record<AttributeCode, number>>,
): OccEligibilityResult;

export function describeOccEligibilityFailure(failure: OccEligibilityFailure): string;
```

- [ ] **Step 1: Write the failing combined-validator tests**

  Create `packages/rules/tests/eligibility.test.ts`:

  ```ts
  import { describe, expect, test } from "vite-plus/test";
  import {
    describeOccEligibilityFailure,
    leyLineWalker,
    occSchema,
    validateOccEligibility,
  } from "../src/index.ts";

  const gruntFixture = occSchema.parse({
    source: { book: "Rifts Ultimate Edition", page: 233 },
    id: "coalition-grunt-eligibility-fixture",
    name: "Coalition Grunt eligibility fixture",
    category: "Men at Arms",
    alignment: "Any",
    attributeRequirements: [],
    speciesEligibility: { kind: "oneOf", speciesIds: ["human", "psi-stalker"] },
  });

  describe("validateOccEligibility", () => {
    test("accepts playable Human for the p.233 Grunt fixture", () => {
      expect(validateOccEligibility(gruntFixture, "human", {})).toMatchObject({
        ok: true,
        species: { id: "human", playable: true },
        failures: [],
      });
    });

    test("distinguishes unknown, unavailable, and disallowed species", () => {
      expect(validateOccEligibility(gruntFixture, "kryptonian", {}).failures).toEqual([
        { kind: "unknownSpecies", speciesId: "kryptonian" },
      ]);
      expect(validateOccEligibility(gruntFixture, "psi-stalker", {}).failures).toEqual([
        { kind: "unavailableSpecies", speciesId: "psi-stalker", name: "Psi-Stalker" },
      ]);
      const psiOnly = occSchema.parse({
        ...gruntFixture,
        id: "psi-only-fixture",
        speciesEligibility: { kind: "oneOf", speciesIds: ["psi-stalker"] },
      });
      expect(validateOccEligibility(psiOnly, "human", {}).failures).toEqual([
        {
          kind: "speciesNotAllowed",
          speciesId: "human",
          allowedSpeciesIds: ["psi-stalker"],
        },
      ]);
    });

    test("reports every failed printed attribute requirement", () => {
      const result = validateOccEligibility(leyLineWalker, "human", { IQ: 9, PE: 11 });
      expect(result.failures).toEqual([
        { kind: "attribute", code: "IQ", min: 10, actual: 9 },
        { kind: "attribute", code: "PE", min: 12, actual: 11 },
      ]);
      expect(result.failures.map(describeOccEligibilityFailure)).toEqual([
        "I.Q. 9; requires 10+.",
        "P.E. 11; requires 12+.",
      ]);
    });
  });
  ```

- [ ] **Step 2: Run the test and observe the missing validator**

  ```powershell
  vp test packages/rules/tests/eligibility.test.ts
  ```

  Expected: FAIL because the validator and formatter are not exported.

- [ ] **Step 3: Implement the pure combined validator**

  Create `packages/rules/src/engine/eligibility.ts`:

  ```ts
  import type { AttributeCode } from "../schema/attributes.ts";
  import type { Occ } from "../schema/occ.ts";
  import type { Species } from "../schema/species.ts";
  import { getSpecies } from "./species.ts";

  export type OccEligibilityFailure =
    | { kind: "unknownSpecies"; speciesId: string }
    | { kind: "unavailableSpecies"; speciesId: string; name: string }
    | { kind: "speciesNotAllowed"; speciesId: string; allowedSpeciesIds: string[] }
    | { kind: "attribute"; code: AttributeCode; min: number; actual: number };

  export interface OccEligibilityResult {
    ok: boolean;
    species?: Species;
    failures: OccEligibilityFailure[];
  }

  export function validateOccEligibility(
    occ: Occ,
    speciesId: string,
    attributes: Partial<Record<AttributeCode, number>>,
  ): OccEligibilityResult {
    const failures: OccEligibilityFailure[] = [];
    const species = getSpecies(speciesId);

    if (species === undefined) {
      failures.push({ kind: "unknownSpecies", speciesId });
    } else {
      if (!species.playable) {
        failures.push({ kind: "unavailableSpecies", speciesId, name: species.name });
      }
      if (
        occ.speciesEligibility.kind === "oneOf" &&
        !occ.speciesEligibility.speciesIds.includes(speciesId)
      ) {
        failures.push({
          kind: "speciesNotAllowed",
          speciesId,
          allowedSpeciesIds: [...occ.speciesEligibility.speciesIds],
        });
      }
    }

    for (const requirement of occ.attributeRequirements) {
      const actual = attributes[requirement.code] ?? 0;
      if (actual < requirement.min) {
        failures.push({
          kind: "attribute",
          code: requirement.code,
          min: requirement.min,
          actual,
        });
      }
    }

    return {
      ok: failures.length === 0,
      ...(species === undefined ? {} : { species }),
      failures,
    };
  }

  const attributeLabel: Record<AttributeCode, string> = {
    IQ: "I.Q.",
    ME: "M.E.",
    MA: "M.A.",
    PS: "P.S.",
    PP: "P.P.",
    PE: "P.E.",
    PB: "P.B.",
    Spd: "Spd",
  };

  export function describeOccEligibilityFailure(failure: OccEligibilityFailure): string {
    switch (failure.kind) {
      case "unknownSpecies":
        return `Unknown species "${failure.speciesId}".`;
      case "unavailableSpecies":
        return `${failure.name} is known but not playable.`;
      case "speciesNotAllowed":
        return `Species "${failure.speciesId}" is not allowed; expected ${failure.allowedSpeciesIds.join(
          ", ",
        )}.`;
      case "attribute":
        return `${attributeLabel[failure.code]} ${failure.actual}; requires ${failure.min}+.`;
    }
  }
  ```

  Export `engine/eligibility.ts` from `packages/rules/src/index.ts`.

- [ ] **Step 4: Remove the duplicate attribute-only validator**

  Delete `RequirementFailure`, `RequirementCheck`, and `meetsAttributeRequirements(...)` from `packages/rules/src/engine/builder.ts`, including its now-unused `AttributeCode` import.

  In `packages/rules/tests/builder.test.ts`, remove `meetsAttributeRequirements` from the import and delete the three-test `meetsAttributeRequirements` describe block. The new combined tests are the sole validator contract.

- [ ] **Step 5: Run focused and package validation**

  ```powershell
  vp test packages/rules/tests/eligibility.test.ts packages/rules/tests/builder.test.ts
  vp run @riftforge/rules#check
  vp run @riftforge/rules#test
  ```

  Expected: PASS with no remaining reference to `meetsAttributeRequirements`.

- [ ] **Step 6: Commit the shared validator**

  ```powershell
  git add -- packages/rules/src/engine/eligibility.ts packages/rules/src/engine/builder.ts packages/rules/src/index.ts packages/rules/tests/eligibility.test.ts packages/rules/tests/builder.test.ts
  git commit -m "feat(rules): validate OCC eligibility"
  ```

---

### Task 4: Enforce Eligibility in Character Derivation

**Files:** Modify `packages/rules/src/schema/character.ts`, `packages/rules/src/engine/character.ts`, and `packages/rules/tests/character.test.ts`.

**Interfaces:**

```ts
characterSchema.shape.speciesId // z.string().min(1).default("human")

CharacterSheet.species: {
  id: string;
  name: string;
}
```

`Character` always has a resolved `speciesId`; `CharacterInput` may omit it only so legacy documents can still enter `deriveSheet`.

- [ ] **Step 1: Add failing character tests**

  Add `speciesId: "human"` to the primary `leyLineWalker` fixture in `packages/rules/tests/character.test.ts`, then add:

  ```ts
  describe("deriveSheet — species and O.C.C. eligibility", () => {
    test("projects explicit Human identity onto the sheet", () => {
      expect(deriveSheet(leyLineWalker).species).toEqual({ id: "human", name: "Human" });
    });

    test("defaults a legacy document without speciesId to Human without mutating input", () => {
      const { speciesId: _speciesId, ...legacy } = leyLineWalker;
      expect(deriveSheet(legacy).species).toEqual({ id: "human", name: "Human" });
      expect("speciesId" in legacy).toBe(false);
    });

    test("rejects unknown and unavailable species", () => {
      expect(() => deriveSheet({ ...leyLineWalker, speciesId: "kryptonian" })).toThrow(
        'Unknown species "kryptonian".',
      );
      expect(() => deriveSheet({ ...leyLineWalker, speciesId: "psi-stalker" })).toThrow(
        "Psi-Stalker is known but not playable.",
      );
    });

    test("enforces printed O.C.C. attribute requirements in derivation", () => {
      expect(() =>
        deriveSheet({
          ...leyLineWalker,
          attributes: { ...leyLineWalker.attributes, IQ: 9, PE: 11 },
        }),
      ).toThrow("I.Q. 9; requires 10+. P.E. 11; requires 12+.");
    });
  });
  ```

- [ ] **Step 2: Run the character test and observe missing enforcement**

  ```powershell
  vp test packages/rules/tests/character.test.ts
  ```

  Expected: FAIL because the sheet has no species and derivation currently ignores O.C.C. requirements.

- [ ] **Step 3: Add legacy-defaulted character identity**

  In `packages/rules/src/schema/character.ts`, add immediately after `occId`:

  ```ts
  /** Explicit for new characters; missing legacy documents derive as Human. */
  speciesId: z.string().min(1).default("human"),
  ```

- [ ] **Step 4: Validate once and project the resolved species**

  In `packages/rules/src/engine/character.ts`, import `describeOccEligibilityFailure` and `validateOccEligibility`. Add to `CharacterSheet`:

  ```ts
  species: {
    id: string;
    name: string;
  }
  ```

  Immediately after resolving the O.C.C. and before deriving any stats, add:

  ```ts
  const eligibility = validateOccEligibility(occ, character.speciesId, character.attributes);
  if (!eligibility.ok || eligibility.species === undefined) {
    throw new Error(
      eligibility.failures.map(describeOccEligibilityFailure).join(" ") ||
        "O.C.C. eligibility could not be resolved.",
    );
  }
  const species = eligibility.species;
  ```

  Add the resolved projection beside `occ` in the returned sheet:

  ```ts
  species: { id: species.id, name: species.name },
  ```

- [ ] **Step 5: Run rules tests and checks**

  ```powershell
  vp test packages/rules/tests/character.test.ts packages/rules/tests/eligibility.test.ts packages/rules/tests/combat-exchange.test.ts
  vp run @riftforge/rules#check
  vp run @riftforge/rules#test
  ```

  Expected: PASS. Combat tokens remain unchanged because species currently has no combat effect; derived `CharacterSheet` fixtures obtain species through `deriveSheet`.

- [ ] **Step 6: Commit character enforcement**

  ```powershell
  git add -- packages/rules/src/schema/character.ts packages/rules/src/engine/character.ts packages/rules/tests/character.test.ts
  git commit -m "feat(rules): derive character species eligibility"
  ```

---

### Task 5: Persist Explicit New-Character Species in Convex

**Files:** Modify `packages/backend/convex/schema.ts`, `packages/backend/convex/characters.ts`, `packages/backend/tests/characters.test.ts`, `packages/backend/tests/healing-cast.test.ts`, and `packages/backend/tests/combat.test.ts`.

**Interfaces:**

- Stored `speciesId` remains optional so old documents satisfy the Convex table validator.
- `characters.create` requires `speciesId: string` and stores the parsed explicit value.
- `characters.update` retains the compatibility input shape; replacing a legacy document naturally writes the rules parser's Human default.
- All semantic validation continues through `validateCharacter -> deriveSheet`.

- [ ] **Step 1: Add explicit Human to new-write fixtures**

  Add this field beside `occId` in the `vesper` fixtures in `characters.test.ts` and `healing-cast.test.ts`, and in the typed `character` fixture in `combat.test.ts`:

  ```ts
  speciesId: "human",
  ```

- [ ] **Step 2: Add failing backend authority and compatibility tests**

  In `packages/backend/tests/characters.test.ts`, extend the first describe block:

  ```ts
  test("create requires and stores explicit Human identity", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.characters.create, vesper);
    expect(await t.query(api.characters.get, { id })).toMatchObject({ speciesId: "human" });
    expect(await t.query(api.characters.sheet, { id })).toMatchObject({
      species: { id: "human", name: "Human" },
    });

    const { speciesId: _speciesId, ...missing } = vesper;
    await expect(t.mutation(api.characters.create, missing as typeof vesper)).rejects.toThrow();
  });

  test("backend rejects unknown, unavailable, and attribute-ineligible writes", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.characters.create, { ...vesper, speciesId: "kryptonian" }),
    ).rejects.toThrow('Unknown species "kryptonian".');
    await expect(
      t.mutation(api.characters.create, { ...vesper, speciesId: "psi-stalker" }),
    ).rejects.toThrow("Psi-Stalker is known but not playable.");
    await expect(
      t.mutation(api.characters.create, {
        ...vesper,
        attributes: { ...vesper.attributes, PE: 11 },
      }),
    ).rejects.toThrow("P.E. 11; requires 12+.");

    const id = await t.mutation(api.characters.create, vesper);
    await expect(
      t.mutation(api.characters.update, {
        id,
        character: { ...vesper, speciesId: "psi-stalker" },
      }),
    ).rejects.toThrow("Psi-Stalker is known but not playable.");
    expect(await t.query(api.characters.get, { id })).toMatchObject({ speciesId: "human" });
  });

  test("legacy storage without speciesId derives Human without a read-time rewrite", async () => {
    const t = convexTest(schema, modules);
    const { speciesId: _speciesId, ...legacy } = vesper;
    const id = await t.run((ctx) => ctx.db.insert("characters", legacy));

    expect(await t.query(api.characters.sheet, { id })).toMatchObject({
      species: { id: "human", name: "Human" },
    });
    expect(await t.query(api.characters.get, { id })).not.toHaveProperty("speciesId");
  });
  ```

- [ ] **Step 3: Run backend tests and observe missing validators**

  ```powershell
  vp test packages/backend/tests/characters.test.ts packages/backend/tests/healing-cast.test.ts packages/backend/tests/combat.test.ts
  ```

  Expected: FAIL because Convex does not store or require `speciesId` yet.

- [ ] **Step 4: Add the legacy-compatible table field**

  In `packages/backend/convex/schema.ts`, add beside `occId`:

  ```ts
  /** Optional only for documents created before species identity existed. */
  speciesId: v.optional(v.string()),
  ```

- [ ] **Step 5: Require the field only on create**

  In `packages/backend/convex/characters.ts`, retain the existing compatibility shape and add a create-specific override:

  ```ts
  const characterInputFields = {
    ...characterFields,
    psychicClass: v.optional(characterFields.psychicClass),
    skills: v.optional(characterFields.skills),
    spellIds: v.optional(characterFields.spellIds),
  };

  const newCharacterInputFields = {
    ...characterInputFields,
    speciesId: v.string(),
  };
  ```

  Change only `characters.create` to:

  ```ts
  export const create = mutation({
    args: newCharacterInputFields,
    returns: v.id("characters"),
    handler: async (ctx, args) => {
      return await ctx.db.insert("characters", validateCharacter(args));
    },
  });
  ```

  Leave `characters.update` on `characterInputFields` so a legacy document can still be submitted and normalized through `characterSchema`.

- [ ] **Step 6: Run backend package validation**

  ```powershell
  vp test packages/backend/tests/characters.test.ts packages/backend/tests/healing-cast.test.ts packages/backend/tests/combat.test.ts
  vp run @riftforge/backend#check
  vp run @riftforge/backend#test
  ```

  Expected: PASS. Do not run Convex code generation merely for the schema field: `_generated/dataModel.d.ts` derives directly from `convex/schema.ts`.

- [ ] **Step 7: Commit backend persistence**

  ```powershell
  git add -- packages/backend/convex/schema.ts packages/backend/convex/characters.ts packages/backend/tests/characters.test.ts packages/backend/tests/healing-cast.test.ts packages/backend/tests/combat.test.ts
  git commit -m "feat(backend): persist character species"
  ```

---

### Task 6: Show Locked Human Identity and Shared Eligibility in SolidJS

**Files:** Modify `apps/web/src/builder/store.ts`, `apps/web/src/builder/steps/identity.tsx`, `apps/web/src/builder/steps/occ.tsx`, `apps/web/src/components/sheet-view.tsx`, `apps/web/tests/character-sheet.test.ts`, and `README.md`; create `apps/web/tests/builder.test.ts`.

**Interfaces:**

- `Draft.speciesId` is initialized to `human` and has no user editing control in this slice.
- `BuilderStore.species` resolves the draft ID through the rules catalog.
- `characterInput()` always includes `speciesId`.
- The O.C.C. step uses `validateOccEligibility(...)`; it does not reproduce species or attribute logic.

- [ ] **Step 1: Write failing store and source-contract tests**

  Create `apps/web/tests/builder.test.ts`:

  ```ts
  /// <reference types="node" />

  import { existsSync, readFileSync } from "node:fs";
  import { createRoot } from "solid-js";
  import { describe, expect, test } from "vite-plus/test";
  import { createBuilderStore } from "../src/builder/store.ts";

  function source(relative: string): string {
    const url = new URL(relative, import.meta.url);
    if (!existsSync(url)) throw new Error(`Missing source under test: ${relative}`);
    return readFileSync(url, "utf8");
  }

  const storeSource = source("../src/builder/store.ts");
  const identitySource = source("../src/builder/steps/identity.tsx");
  const occSource = source("../src/builder/steps/occ.tsx");

  describe("builder species identity", () => {
    test("starts with the sole playable Human identity", () => {
      createRoot((dispose) => {
        const store = createBuilderStore();
        expect(store.draft.speciesId).toBe("human");
        expect(store.species()).toMatchObject({ id: "human", name: "Human", playable: true });
        dispose();
      });
    });

    test("persists species and delegates O.C.C. legality to the shared engine", () => {
      expect(storeSource).toContain("speciesId: draft.speciesId");
      expect(storeSource).toContain("validateOccEligibility(");
      expect(occSource).toContain("validateOccEligibility(");
      expect(occSource).toContain("describeOccEligibilityFailure");
    });

    test("renders Human as locked identity rather than an editable species step", () => {
      expect(identitySource).toContain("SPECIES");
      expect(identitySource).toContain("HUMAN // LOCKED");
      expect(identitySource).not.toContain('name="species"');
    });
  });
  ```

  In `apps/web/tests/character-sheet.test.ts`, add:

  ```ts
  test("shows resolved species in the dossier identity line", () => {
    expect(sheetViewSource).toContain("s().species.name.toUpperCase()");
  });
  ```

- [ ] **Step 2: Run web tests and observe missing species UI**

  ```powershell
  vp test apps/web/tests/builder.test.ts apps/web/tests/character-sheet.test.ts
  ```

  Expected: FAIL because the builder store, identity step, and sheet do not expose species.

- [ ] **Step 3: Add Human identity to the builder store**

  In `apps/web/src/builder/store.ts`:

  - import `getSpecies` and `validateOccEligibility`;
  - add `speciesId: string` to `Draft`;
  - add `species: Accessor<ReturnType<typeof getSpecies>>` to `BuilderStore`;
  - initialize `speciesId: "human"`;
  - add `const species = createMemo(() => getSpecies(draft.speciesId));`;
  - include `speciesId: draft.speciesId` in `characterInput()`;
  - return `species` from `createBuilderStore()`.

  Replace the attribute-only `requirements` memo in `stepValidity` with:

  ```ts
  const eligibility = createMemo(() => {
    const chosen = store.occ();
    const attrs = store.attributeTotals();
    return chosen && attrs
      ? validateOccEligibility(chosen, store.draft.speciesId, attrs)
      : undefined;
  });
  ```

  Return these gates:

  ```ts
  eligibility,
  identity: createMemo(
    () => store.draft.name.trim().length > 0 && store.species()?.playable === true,
  ),
  occ: createMemo(() => store.occ() !== undefined && eligibility()?.ok === true),
  ```

- [ ] **Step 4: Render the locked identity field**

  In `apps/web/src/builder/steps/identity.tsx`, add after the name field:

  ```tsx
  <div class="max-w-sm space-y-1">
    <MonoLabel>SPECIES</MonoLabel>
    <div
      class="border border-line bg-inset px-3 py-2 font-mono text-[13px] tracking-[0.08em] text-amber"
      aria-label="Species: Human, locked"
    >
      HUMAN // LOCKED
    </div>
    <p class="font-mono text-[11px] text-dead">
      // sole playable species in the current rules catalog
    </p>
  </div>
  ```

- [ ] **Step 5: Replace O.C.C.-step legality with the shared validator**

  In `apps/web/src/builder/steps/occ.tsx`, import `describeOccEligibilityFailure`, `getSpecies`, and `validateOccEligibility`. Replace `check` with:

  ```ts
  const check = (occ: (typeof occs)[number]) => {
    const attrs = props.store.attributeTotals();
    return attrs ? validateOccEligibility(occ, props.store.draft.speciesId, attrs) : undefined;
  };

  const eligibleSpecies = (occ: (typeof occs)[number]) => {
    if (occ.speciesEligibility.kind === "any") return "ANY PLAYABLE SPECIES";
    return occ.speciesEligibility.speciesIds
      .map((id) => {
        const species = getSpecies(id);
        return species ? `${species.name}${species.playable ? "" : " [DEFERRED]"}` : id;
      })
      .join(", ");
  };
  ```

  Add this line below the attribute requirement line:

  ```tsx
  <p class="font-mono text-[12px] text-muted">SPECIES: {eligibleSpecies(occ).toUpperCase()}</p>
  ```

  Replace the old failure mapping with:

  ```tsx
  {
    result().failures.map(describeOccEligibilityFailure).join(" ").toUpperCase();
  }
  ```

  Set the radio's disabled state from the same result:

  ```tsx
  disabled={check(occ)?.ok !== true}
  ```

- [ ] **Step 6: Display resolved species on every sheet**

  In `apps/web/src/components/sheet-view.tsx`, change the dossier header label to:

  ```tsx
  <MonoLabel>
    LEVEL {s().level} // {s().species.name.toUpperCase()} // {s().occ.name.toUpperCase()} //{" "}
    {s().occ.category.toUpperCase()}
  </MonoLabel>
  ```

- [ ] **Step 7: Align the README**

  After the paragraph beginning “The first vertical slice” in `README.md`, add:

  ```md
  Character identity is source-validated: Human is currently the sole playable
  species, while known but unimplemented identities remain unavailable rather than
  silently accepted.
  ```

- [ ] **Step 8: Run web and dependent package gates**

  ```powershell
  vp test apps/web/tests/builder.test.ts apps/web/tests/character-sheet.test.ts apps/web/tests/combat-exchange.test.ts
  vp run @riftforge/web#check
  vp run @riftforge/web#test
  ```

  Expected: PASS. Confirm the source-contract helper throws for missing files and no test can pass vacuously.

- [ ] **Step 9: Commit the builder and sheet integration**

  ```powershell
  git add -- apps/web/src/builder/store.ts apps/web/src/builder/steps/identity.tsx apps/web/src/builder/steps/occ.tsx apps/web/src/components/sheet-view.tsx apps/web/tests/builder.test.ts apps/web/tests/character-sheet.test.ts README.md
  git commit -m "feat(web): surface character species identity"
  ```

---

### Task 7: Full Validation, Live Acceptance, and Review Publication

**Files:** No planned production-code changes. Correct any defect in the owning task's files and rerun that task's RED/GREEN cycle before proceeding.

**Interfaces:** This task produces fresh validation evidence, a clean published branch, a draft PR closing #60, and an issue update. It does not merge, close #60 manually, remove downstream dependency labels, or activate #61.

- [ ] **Step 1: Prove the intended scope and clean diff**

  ```powershell
  git status --short --branch
  git diff main...HEAD --stat
  git diff --check main...HEAD
  rg -n "racialRequirement|meetsAttributeRequirements" packages apps
  ```

  Expected: only the approved design/plan and #60 implementation files differ; `git diff --check` has no output; the final `rg` returns no production reference to either removed legacy mechanism.

- [ ] **Step 2: Run focused tests**

  ```powershell
  vp test packages/rules/tests/species.test.ts packages/rules/tests/eligibility.test.ts packages/rules/tests/occ.test.ts packages/rules/tests/character.test.ts packages/rules/tests/builder.test.ts packages/backend/tests/characters.test.ts packages/backend/tests/healing-cast.test.ts packages/backend/tests/combat.test.ts apps/web/tests/builder.test.ts apps/web/tests/character-sheet.test.ts apps/web/tests/combat-exchange.test.ts
  ```

  Expected: PASS with no skipped or pending tests.

- [ ] **Step 3: Run every affected package gate**

  ```powershell
  vp run @riftforge/rules#check
  vp run @riftforge/rules#test
  vp run @riftforge/backend#check
  vp run @riftforge/backend#test
  vp run @riftforge/web#check
  vp run @riftforge/web#test
  ```

  Expected: all six commands PASS.

- [ ] **Step 4: Run root gates on the final revision**

  ```powershell
  vp check
  vp test
  git diff --check main...HEAD
  git status --short --branch
  ```

  Expected: root check and tests PASS, diff check is silent, and the worktree is clean.

- [ ] **Step 5: Start clean local services**

  Verify ports before starting:

  ```powershell
  Get-NetTCPConnection -LocalPort 3210,5173 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort,OwningProcess
  ```

  Stop only positively identified stale RiftForge `convex-local-backend`, Convex CLI, or web processes. Then start:

  ```powershell
  # packages/backend
  pnpm exec convex dev

  # apps/web, in a separate hidden/background process managed by the executor
  vp dev
  ```

  Wait for local Convex on port 3210 and the web app on `http://localhost:5173`.

- [ ] **Step 6: Complete live browser acceptance**

  In the real browser:

  1. Open `/characters/new` and confirm `HUMAN // LOCKED` is visible with no species picker.
  2. Roll legal Ley Line Walker attributes and confirm O.C.C. eligibility reports success through the shared gate.
  3. Complete the existing alignment, psionics, skill, and spell choices; review the character and confirm `HUMAN` appears in the dossier identity line.
  4. Forge the character and confirm the persisted sheet still shows Human after navigation and reload.
  5. Roll vitals and perform one existing legal spell cast to prove the magic vertical remains intact.
  6. Navigate directly between this dossier and another character without a document remount; confirm the correct identity and no stale command result follows the route.
  7. At 390x844 and desktop width, confirm the locked identity, O.C.C. cards, and sheet header do not overflow.
  8. Use keyboard navigation through the builder controls and confirm the disabled O.C.C. state has explanatory text, not color alone.
  9. Confirm zero browser console errors and warnings.

- [ ] **Step 7: Stop local services and remove the render temporary directory**

  Stop the exact RiftForge processes started in Step 5, including an orphaned `convex-local-backend` if it remains on port 3210. Verify both ports are closed.

  Resolve and remove only the explicit render directory:

  ```powershell
  $target = Resolve-Path -LiteralPath 'C:\Users\Reven\AppData\Local\Temp\riftforge-species60-20260722'
  if ($target.Path -ne 'C:\Users\Reven\AppData\Local\Temp\riftforge-species60-20260722') { throw "Unexpected cleanup target: $($target.Path)" }
  Remove-Item -LiteralPath $target.Path -Recurse -Force
  ```

- [ ] **Step 8: Re-run final lightweight integrity checks after cleanup**

  ```powershell
  git diff --check main...HEAD
  git status --short --branch
  Get-NetTCPConnection -LocalPort 3210,5173 -State Listen -ErrorAction SilentlyContinue
  ```

  Expected: clean diff, clean worktree, and no listeners on either port.

- [ ] **Step 9: Publish a draft PR without changing tracker activation**

  ```powershell
  git push -u origin feat/species-eligibility
  gh pr create --draft --base main --head feat/species-eligibility --title "feat: add species eligibility foundation" --body "Closes #60.

  Adds source-stamped Human and deferred Psi-Stalker identity, structured O.C.C. species eligibility, shared species/attribute enforcement, explicit new-character persistence, legacy Human compatibility, and locked-Human builder/sheet presentation.

  Validation and live-browser evidence are recorded on issue #60. The human maintainer retains merge authority."
  ```

  Add a comment to #60 quoting the final commit SHA, actual observed command results, live-browser evidence, and the draft PR URL. Do not add generated-with text or attribution trailers.

- [ ] **Step 10: Request the active automated review and stop at human merge**

  Move the PR out of draft only when the user asks and the branch evidence is complete. Let the configured active reviewer inspect new commits automatically; do not spend quota on a manual retrigger. Address every finding by reproduction and root-cause correction, rerun affected gates, and push the fix.

  Stop when the PR is green and approved. The human maintainer merges. Keep #60 as the sole `next-up` issue and keep `needs:species` on #57/#58 until the merged result is synchronized and verified on local `main`.

---

## Post-Merge Handoff

After the human merge, use the repository's post-merge procedure:

```powershell
git switch main
git pull --ff-only origin main
vp install
vp check
vp test
git branch -d feat/species-eligibility
git branch -d docs/occ-breadth-foundation-design
git fetch --prune origin
```

Only after those commands pass:

- confirm #60 closed automatically through the merged PR;
- remove `needs:species` from #57 and any other issue whose complete dependency is genuinely satisfied;
- remove `next-up` from #60 and add it to #61 so exactly one open issue carries it;
- preserve #58's other missing-subsystem labels; and
- write #61's implementation plan against the synchronized post-#60 codebase.
