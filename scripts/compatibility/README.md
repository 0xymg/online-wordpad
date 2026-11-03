# Word compatibility baseline

The fixture DOCX files are synthetic test data. Generate them using the bundled Python runtime with `python-docx`:

```sh
python3 scripts/compatibility/generate.py
```

The generator writes eight files and `fixtures/compatibility/manifest.json`. ZIP ordering, timestamps, core properties, and content are fixed. The manifest records the source SHA-256 and semantic markers; verify the hash when capturing a reference. Regeneration must not overwrite reference or app PDF folders. Identifiers in the OOXML are source-format identifiers, not persistent editor identity.

Export each exact source through **Word Online** to `fixtures/compatibility/references/<fixture-id>.pdf`. Record the reference environment as `fixtures/compatibility/references/profile.json`, for example:

```json
{
  "reference_application": "Word Online",
  "capture_date": "YYYY-MM-DD",
  "browser_and_version": "record actual browser and version",
  "paper_settings": "record actual settings",
  "fonts": "record actual fonts or fallback",
  "sources": {
    "basic": {"source_sha256": "copy from manifest", "reference_pdf_sha256": "hash the actual Word PDF"}
  }
}
```

Use genuine Word exports only; never place another renderer's output in the reference directory. An absent or unknown detail stays explicitly unknown. Store the application exports separately at `fixtures/compatibility/app-pdfs/<fixture-id>.pdf`. Generate these in fresh isolated browser contexts using `BASE_URL=https://wordpad.info node scripts/compatibility/export-app.cjs`; set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` if needed. The exporter records each source and PDF SHA-256 in `app-pdfs/exports.json`; the report rejects a mismatched record rather than comparing a stale export.

Run:

```sh
python3 scripts/compatibility/report.py --output /tmp/edtr-compatibility-report.json
```

`--references` and `--app` accept other directories. A missing reference or application PDF is `PENDING`, never a pass. A source hash mismatch or unreadable PDF is `ERROR`. The report compares page count, media boxes within 0.75 pt, token multisets, expected marker counts, and link counts. It records missing and extra tokens. `MEASURED` means only those checks matched; it does not establish target equivalence for links, visual fidelity, editability, or Word compatibility. Visual matching remains `NOT_ASSESSED`; marker positions are measured from the extracted PDF text layer when pdfplumber is available, with deltas in CSS pixels. Text-layer coordinates are not proof of visible glyph positions. The 1 CSS px anchor check is the plan’s provisional measurement target, not a validated guarantee. Unknown or absent reference profile details do not become evidence through a successful mechanical comparison. Each Word reference needs `<fixture-id>.provenance.json` with `source_sha256`, `pdf_sha256`, capture method, reference application, capture time and font information; mismatched hashes are errors and missing provenance remains pending. A shared `profile.json` may additionally record browser, paper settings and fonts.

The fixed `tokens_once` markers avoid treating repeated headings or header content as accidental duplication. Differences in PDF text extraction, generated page numbers, and font substitutions require manual diagnosis; missing extractable text is itself reported rather than silently ignored. The harness exits nonzero for corrupt inputs or a source hash mismatch; a mismatch in a measured feature remains a normal baseline result, reported as `MISMATCH` rather than masked as a passing result.
