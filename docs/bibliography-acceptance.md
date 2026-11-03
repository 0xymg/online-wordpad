# A6 bibliography acceptance

Status: initial APA 7 / IEEE implementation released in `52293af` on 2026-11-03; Vercel and live UI/export/layout acceptance passed. Native Word Source Manager fields are a separate, closed profile. This report does not claim full Word visual fidelity.

## Implemented scope

- v6 canonical source registry; v0–v5 migration preserves section, target, field and note identities. Unknown/future or invalid source graphs reject without replacing the open document.
- Book, journal article and webpage sources; ordered personal/organization authors and editors, sparse dates, publisher/journal details, DOI/URL, locator/prefix/suffix and author suppression. No network metadata lookup.
- Lazy-loaded exact `citeproc@2.4.63`, pinned official APA 7 / IEEE CSL styles and five locales. Complete citation-cluster processing updates earlier citations, disambiguation/year letters and IEEE first-use numbering. Uncited inclusion is explicit.
- Safe rich citation runs and normal generated bibliography paragraphs. APA hanging indentation; IEEE structured labels/body, real tabs and measured label stops; CSL line/entry spacing. Generated entries do not become canonical sources.
- Source management and citation editing in EN/TR/FR/ZH/AR; mobile RTL, IME, parent undo/redo, read-only controls, stale-dialog closure and version restore.
- Shared source clipboard planning, trusted cut/move and ordinary copy identities; external shared-source cloning and atomic undo. Full-document cloning includes unused sources and clears native aliases.
- Shared active/inactive formatter and output barrier, generation revocation on view reconfiguration, immutable snapshot guards, SHA-256 revision fingerprints. Errors are visible and block incomplete output.
- DOCX formatted-copy profile uses paired native bookmarks plus standard customXml metadata. Direct application roundtrip preserves source/cluster IDs and configuration; malformed, dropped or edited carriers reject. HTML, PDF, TXT, Markdown and RTF carry visible formatted text.

## Evidence

- 14 formatter/scheduler checks, selected upstream exact-output cases, and an isolated Chromium offline bundle proof with zero formatter requests. Asset/source hashes, license notices and reproducible evidence are in `bibliography-runtime-proof.json`, `bibliography-upstream-proof.json`, `public/third-party/csl/manifest.json` and `public/third-party/`.
- Focused bibliography/clipboard/history/cache and note regressions, 41 model/migration/load checks, 62 section checks and real browser load-safety checks passed.
- Actual editing UI verifies APA year-letter changes, IEEE renumbering, source edits updating prior clusters, source-delete protection, multi-resource citations, author suppression, IME, undo/redo, five locales, populated 390px RTL, read-only controls and version restore.
- Actual File Export → DOCX → Open preserves IDs/config/source data. HTML checks identities; PDF/TXT/MD/RTF contain formatted text. Modified citation text and the actual Word-resaved fixture reject while keeping the open document unchanged.
- Product layout fixture: 30 mixed sources in two columns alongside TOC, PAGEREF, footnote and endnote. APA PDF has three nonempty pages; IEEE has two. Each entry and both notes occur once; page fields match the actual PDF heading page. Focusable citation atoms have finite nonzero geometry and Enter activation.
- TypeScript, owned-file lint, diff checks and production build pass. Production UI export/reopen and combined bibliography/note layout checks pass. Final production build also verifies ordinary Pad loading fetches no processor or CSL chunks; inserting a citation loads them on demand (`bibliography-lazy-proof.json`). Existing Editor/MenuBar lint warnings and local Better Auth/Edge build warnings predate this change.

## Word Online reference

The first custom metadata relationship produced Word's **Document corrupted** view-only warning despite a rendered preview. Isolating metadata proved ordinary native content/bookmarks were valid. Export now uses the standard customXml relationship and ordinary XML content type; Word Online opens the file normally and accepts prose editing.

Root edited `BIB_START` to `BIB_START WORD_EDIT` in Word Online, saved, refreshed OneDrive and downloaded the actual changed version. The saved package contains the edit and retains source/field metadata IDs. Word split runs and added direction/language properties; strict application restoration rejects that changed representation. This is an observed compatibility boundary, not a successful Word→app source-editing roundtrip. Sanitized files, hashes and exact observations are in `fixtures/bibliography/README.md`.

## Explicit limits

- Native `CITATION` / `BIBLIOGRAPHY` source-manager field editing/import is gated; the public export is the formatted-copy profile.
- Word-resaved formatting normalization can reject structural source restoration. The original file and currently open document remain available.
- Citation sources inside note bodies, additional source types, multiple bibliography markers or per-section styles are outside the initial scope.
- A partial selection intersecting a generated entry is rejected. Whole generated blocks inside canonical deletion ranges are supported; arbitrary partial-range remapping is not complete.
- Page layout retains A5's documented unsupported object/table/continuous-paper-size limits.

## Live release

- Code commit `52293af4e398b8966be0483ce0a3ef5e17637501`, no coauthor trailer.
- [Successful Vercel deployment](https://vercel.com/312sh/online-wordpad/DwkRzhctcmEgEupHf8DM5Leb94Ma).
- Live `check-bibliography-ui.cjs` passed source creation, live citation/reference, DOCX graph/ID reopen, HTML/PDF/TXT/MD/RTF exports and safe edited-DOCX refusal.
- Live `check-bibliography-product-layout.cjs` passed 30 mixed sources, two columns, three APA PDF pages, matching TOC/PAGEREF and exactly-once footnote/endnote content. IEEE two-page layout also passed locally.
- Existing real Word footnote DOCX UI/import/export/PDF regression passed in the final production build after updating the asserted model version to v6.
