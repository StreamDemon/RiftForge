# Transcribing the rulebook — the vision-extraction pipeline

The source (`docs/rules/Rifts-Ultimate-Edition-Main-Book.pdf`, gitignored and
local-only) is 382 **scanned pages with no text layer**. `pdftotext` yields ~1
garbage character per page — do not attempt text extraction. The proven
pipeline is render-and-read:

## The pipeline

1. **Locate the section** in [PAGE_MAP.md](./PAGE_MAP.md).
   Offset (verified): `PDF page index (0-based) = printed page number + 2`.
2. **Render the page range** to PNG at 2.2x — crisp enough for dense stat
   blocks and numeric tables:

   ```bash
   python -c "
   import fitz
   d = fitz.open('docs/rules/Rifts-Ultimate-Edition-Main-Book.pdf')
   for i in range(START_IDX, END_IDX):
       d[i].get_pixmap(matrix=fitz.Matrix(2.2, 2.2)).save(f'OUT_DIR/p{i}.png')
   "
   ```

   (PyMuPDF is installed; `pdftoppm`/poppler is not.)

3. **Read each PNG visually** and transcribe into content JSON:
   - keep printed wording for ranges, durations, and notes;
   - stamp `page` with the **printed** page number (not the PDF index);
   - structured fields (dice, costs) get the structured value, and variable
     or conditional printed rules keep the full sentence in a `*Note` field
     (`ppeNote`, `savingThrowNote`) beside the number.
4. **Batch per book section** (e.g. one spell level at a time). Merge into
   the content file sorted consistently; schemas validate at import via
   `.parse`, so a bad transcription fails the whole test suite immediately.
5. **Pin totals in tests** (e.g. per-level spell counts in
   `packages/rules/tests/spells.test.ts`) so silent drift or accidental
   deletion is caught forever after.
6. **Checkpoint-commit** every few sections; transcription sessions are long
   and partial progress should survive anything.

## Rules of the pipeline

- Transcribe only what the render shows. Model memory of Palladium rules is
  unreliable on specifics (costs, dice, levels, page numbers) — e.g. Heal
  Wounds is printed at level 5, not the commonly-remembered 6. **The page
  always wins.**
- Completeness is checked against the book, not the existing catalog: the
  spell catalog claimed "levels 1-4" for weeks while holding 5 of 13 level-2
  spells. When touching a section, verify the whole section's roster from
  the pages.
- When a printed mechanic doesn't fit the current schema, extend the schema
  with refinements that reject contradictory shapes at content-load time
  (see `spellHealingSchema`'s exclusive/othersOnly/full) rather than
  flattening the rule into description prose.
