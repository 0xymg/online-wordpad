# A5 note acceptance

Status: A5a passed the local production-build gate on `codex/document-notes`; deployment/live verification pending. A5a endnotes and A5b real page footnotes are separate acceptance gates. This report does not mark the full A5 milestone complete.

## A5a implemented and checked locally

- Canonical v5 note registry, one stable `nte_` owner identity per record; migration from v0–v4 retains document/section/reference IDs.
- Source-preserving rejection of malformed/future graphs, unsupported native bodies and unsupported numbering. Stale generated bodies and label caches regenerate from canonical records on load.
- Native endnotes enter the canonical registry and export to real `word/endnotes.xml` with `w:endnoteReference`; generated display paragraphs do not leak into the native main story.
- Flat generated paragraph/list display at document/section end; final section boundary returns to the canonical owner block for native export.
- Live note body editor with marks/lists/tabs/links, document history, owner navigation, delete/undo, numbering and placement settings. Read-only edits disabled; changing the parent document closes the dialog. Radix delayed-mount and rapid owner-click cases corrected by actual UI checks.
- Copy/cut/paste share A4's atomic identity transaction; note body/owner undo is one history action. Missing clipboard records reject rather than lose content.
- PDF and print reuse the same physical renderer and output barrier. Owner→note and note→owner PDF GoTo links are emitted; external links remain URI links.

Local evidence:

- Core/clipboard 16 focused tests; v5 model/load/projection/history 38 checks; A4 core25/browser24, section62 and tab38 checks.
- `check-document-load-safety.cjs`: v5 save/reopen without typing; four malformed graph/cache cases keep exact original source after attempted editing/save.
- `check-notes-ui.cjs`: rich native upload → actual editor → native DOCX download → upload/reopen. Long-note PDF has two pages and all 450 `flowN` words exactly once; two internal GoTo links and one external URI.
- `check-note-sections.cjs`: portrait/landscape two-section document, numbering 1/2→1, generated ordered-list terminals, exact section/note IDs, native main-story/body separation and coexistence with A4 TOC/REF/PAGEREF.
- `check-note-editing-ui.cjs`: actual insertion, body formatting/list/tab, parent undo/redo, III numbering, delete/undo, read-only and changed-document dialog handling. IME buffering/close protection and all five locales at narrow width passed; TypeScript, scoped lint and production build passed.

## Word Online reference

Original rich native endnote opened in Word Online's real note panel with lists/link/long body. One additional empty note inserted using Word's own command, then saved and downloaded from OneDrive. Sanitized fixture and provenance are in `fixtures/notes/README.md`.

Observed limit: the Word Online editor displayed lower Roman labels despite explicit decimal document and section policy. The downloaded DOCX retained decimal in both places. This remains an explicit Word Online display discrepancy; do not claim pixel-identical note numbering. Word Online's editor page count omits its note panel and is not accepted as a printed endnote page count.

## Open acceptance items

- Closed: 28 focused boundary checks cover partial Backspace/Delete joins, ReplaceAround leakage, cache-only edits, AllSelection replacement/undo, and paragraph/list section-boundary merge/undo. Section commands now unproject/edit/reproject inside one original history transaction.
- Closed: `check-note-word-roundtrip.cjs` passes the actual Word-normalized fixture through product import/export/reimport, preserving the original note ID, both bodies and explicit decimal policy.
- Closed: `check-note-output-snapshot.cjs` delays the actual exporter chunk, switches A→B, and confirms FILE_A.docx contains only the settled A content/note while the editor stays on B.
- Final source checks and production build passed. Production deployment/live smoke tests are pending.
- A5b remains gated for public creation/import/editing/conversion. Saved v5 footnotes have a bounded runtime for single-section one/two-column plain notes and basic lists; unsupported layouts fail with a visible alert and block output. Product PDF/DOCX checks cover two same-line owners, a 600-word continuation, body-before-notes reading order and four bidirectional links. A provisional third blank sheet was caught and removed; the two-column fixture now has exactly two nonempty sheets. Mixed sections/widths, three columns, object/table owners and nested/RTL/non-default-start note lists remain unverified or rejected. Do not describe full A5b as released.
