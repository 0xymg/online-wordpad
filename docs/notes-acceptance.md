# A5 note acceptance

Status: A5a released in `7258ccf` and A5b released in `d97ea95` on 2026-11-03. Both Vercel deployments and live editing/import/export/PDF acceptance passed at https://wordpad.info. The initial A5 scope is accepted with the explicit layout limits below; this is not a general Word pixel-fidelity claim.

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
- Final source checks and production build passed. Live `check-notes-ui.cjs` and `check-note-editing-ui.cjs` passed, covering native DOCX reopen, two-page searchable/linkable PDF, body editing/list/tab/formatting, history, numbering/placement, deletion/undo, read-only and document switching.
- A5b creation/import/editing/conversion is live. Unsupported layouts fail with a visible alert and block output.

## Live release evidence

- Commit: `7258ccf2be283b938efe6423f19058bb8560904f`; commit body contains no coauthor trailer.
- [Vercel successful deployment](https://vercel.com/312sh/online-wordpad/E3ZUM7yt4cYbW2UiYBny7D3hSAVt).
- Local production tests additionally passed the Word Online-normalized fixture and the gated two-column footnote PDF/DOCX fixture (two nonempty pages).
- Known baseline local build warnings: missing local Better Auth configuration and Edge runtime deprecation; production build exits successfully. No account settings changed.

## Text export follow-up

`978e2f2` fixes missing canonical note owners/bodies in TXT, Markdown and RTF. Export-only numbers distinguish notes even when native kind/section labels restart. Generated endnote display copies are removed before writing exactly one appendix body; Markdown uses unique footnote keys. Canonical document state is unchanged. Rich RTF marks, tabs, lists and external links remain readable.

The focused graph/GFM tests cover four notes with identical original labels, both kinds, two sections, nested list/table owners, an empty note and a 600-word body. Ordinary TXT field/status and text-box output matches schema-visible text. Vercel deployment succeeded; `check-note-text-ui.cjs` passed on live https://wordpad.info, downloading all three formats and checking all 450 fixture words exactly once and matching owner/body keys.

## A5b production acceptance

- Actual product PDF/DOCX: two same-line owners, 600-word continuation, one/two/three-column flow, no empty physical pages, body-before-notes extraction and four bidirectional links.
- Mixed portrait/landscape sections and unequal text widths remeasure only the canonical remaining note range. A 1,600-word five-page fixture retains every word once. Continuous one→two-column sections use one shared note band; actual region margins constrain its width and bottom boundary.
- Native Word Online fixture: original identities, both bodies and all 600 words survive import → full physical output barrier → native export → reimport. The actual product PDF has two nonempty pages and four links. See `fixtures/notes/README.md` for original-file hashes and the observed Word font-size UI/package discrepancy.
- Flow-image checks compare painted image rectangles and note bands. Actual single-column inline/wrapLeft and two-column inline/wrapLeft/wrapRight/topBottom PDF fixtures pass. An unresolvable single-column wrapRight pressure case fails visibly with no leftover note layer.
- Simple table-cell owners pass one/two-column PDF/DOCX, including owners near a page boundary. The two-column boundary fixture verifies the second cell's split text in the correct physical cell lanes across sheets; owner and first note line remain together.
- `check-note-numbering-layout.cjs`: actual labels 9→10 and 99→100; physical line geometry stays within 1 CSS px at 75%, 125% and 100% user-selected zoom.
- `FOOTNOTE_REFERENCES=1 check-footnotes-output.cjs`: long footnotes move a heading beyond page one; both PAGEREF and generated TOC match the heading's final PDF page, with all 600 words once. This exercises the shared reference/footnote output loop.
- `check-note-font-barrier.cjs`: stylesheet discovery remains pending until CSS loads; failure/retry, bounded timeout, late recovery and SSR tested. FontFaceSet readiness alone cannot race ahead of stylesheet discovery.
- `check-note-rich-render.cjs`: eight full/suffix DOM variants compare original glyph geometry (maximum 0.594 CSS px difference), RTL/LTR, nested/custom-start lists, empty paragraphs, hard breaks and literal paragraph spacing. Entirely marked bold/color/font/link lines retain their enclosing marks across continuations. Dark-theme inherited ink becomes black on paper while explicit red/green remains. Real tab widths and vector dot/dash leaders survive native print PDF; search text is not duplicated.
- `check-footnote-rich-output.cjs`: actual product two-page PDF/DOCX retains a 600-word bold/red note across both pages alongside RTL, external links, tab leaders and a nested list starting at 7. Text counts, visible color pixels and internal/external links pass.
- Enabled development UI: `NOTE_KIND=footnote check-note-editing-ui.cjs` and the default endnote run pass insertion, IME, rich editing, numbering, physical-layer navigation, conversion in both directions with identity/history, deletion/undo, read-only and changed-document handling. `check-note-word-footnotes-ui.cjs` directly imports the Word fixture through the public file chooser, edits/exports/reopens native DOCX and verifies a two-page, 600-word PDF with four GoTo links.
- Delayed source images: one-column completed snapshots invalidate synchronously on the real load event, then regenerate owner targets without changing the document. Two-column layout waits while the asset is pending and completes after release. Both actual PDF/DOCX paths pass with image pixels, exact-once text and correct backlinks.
- First-use note fonts: an actual inactive-document export initially reproduced `note-layout-stale`. The coordinator now warms all note bodies, then retries at most three times only for a changed geometry epoch with the same connected canonical document. The four-distinct-font first export passes once without errors; the ordinary active-document path remains unchanged.
- Native ordered-list starts now survive actual export and common import for main text, footnotes and endnotes: root 7, nested 3, ordinary 1, interrupted/resumed 8 and explicit override 9→10. Separate note/main stories do not leak counters. The regression checks actual native start metadata and imported list attributes, not just visible text tokens.

The full shared DOCX import regression passes, including historical no-note packages without root relationships. That fallback returns the original buffer unchanged and rejects any native note graph missing its root relationships. Final TypeScript/scoped lint and production build pass. In the production build, footnote UI/history/conversion and actual native Word import → DOCX download/reopen → two-page PDF pass.

Current explicit backend limits include continuous changes of paper size, page-positioned images, text boxes, nested/merged-cell tables, owner rows too tall to fit, unresolved object overlaps and bounded convergence failures. These are not silently flattened or clipped.

## A5b live release evidence

- Commit `d97ea95eb027e087519b16e449c137d83f6cf396`; no coauthor trailer.
- [Successful Vercel deployment](https://vercel.com/312sh/online-wordpad/ASMGbZLe9JHEXVm89oPEVUDow5Ps).
- Live `NOTE_KIND=footnote check-note-editing-ui.cjs` passed rich editing/IME, settings, owner/layer navigation, conversion identities/history, deletion/undo, read-only and document switching.
- Live `check-note-word-footnotes-ui.cjs` passed actual Word file import, enabled note editing, native DOCX download/reopen and searchable two-page PDF with all 600 words and the second note once, plus four GoTo links.
- Local final production build additionally passed the first inactive export with four previously unloaded note-only fonts. Shared DOCX regression and native list start/override/resume/story tests passed before release.
