# Section editor reference evidence

Synthetic documents only. Word references were captured in Microsoft Word Online on 2026-11-03 UTC (2026-11-02 Toronto), using the Codex in-app browser. The browser engine and Word build versions were not exposed through the supported UI. Each provenance file records source/output hashes; these results describe this capture, not universal Word compatibility.

| Sample | Actual Word observation |
| --- | --- |
| continuous-page-size | A continuous section changing Letter portrait to A4 landscape begins a new physical sheet. |
| continuous-margins | Same-size continuous sections with different horizontal margins share a sheet; the new section uses its own horizontal text origin. |
| continuous-vertical-margins | Same-size continuous sections share the current sheet's vertical bands; the changed top/bottom margins take effect on the next physical sheet. |
| identity-probe | Both reserved zero-length section bookmarks survived a real Word edit and DOCX download. Repository fixture anonymizes only the account name in core metadata; document XML is unchanged. |
| ui-smoke | EDTRDocs-generated A4 portrait then Legal landscape DOCX opened in Word as two pages with the expected text on each. App/Word PDF page dimensions differ by less than 0.1 pt. |

Reserved `_edtrsec` transport is accepted only as a complete, unique, correctly positioned set. Malformed/partial/duplicate sets produce fresh section identities instead of ambiguous links. A document ending in a non-paragraph block does not receive partial bookmark transport. General user bookmark/cross-reference fidelity is tracked separately in A4.

These probes establish section semantics, identity transport, and narrow page-geometry equivalence. They do not establish full typographic or pixel-level fidelity; the A0 mismatch report remains applicable.
