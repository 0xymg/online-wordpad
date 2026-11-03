# Native note fixtures

All documents here are synthetic test content, not personal templates.

- `native-endnote-supported.docx`: reproducible with `node scripts/generate-note-fixtures.cjs`; one native endnote with bold/italic, tab, hard break, external link, numbered list and 450-word continuation text. With no explicit native endnote format, Word uses lower Roman; the importer follows that Word behavior. Newly created EDTR notes default to decimal.
- `word-online-normalized-v3.docx`: exported from EDTR, explicit decimal document/section note policy, opened in Word Online on 2026-11-03; an additional empty endnote was inserted through References → Insert Endnote to exercise Word's native note editor. The original rich note and its `EDNT8f8715a6f8b04ce98ea19e086911ffeb` identity survive. The second note has native ID 20268; application identity is allocated on import.

The Word-normalized file's document/note XML and relationships are unchanged. Only creator, last-modifier and company metadata were replaced with `EDTR compatibility fixture`.

- Downloaded source SHA-256: `d5c554adad1a307fef6c0ea585b396a9a0d87dd7ff62e95a0bb171a5795aabf1`
- Sanitized fixture SHA-256: `520db414ea1efbb544780703022d12046edbade8d86a04c8e8870a67e396d5c3`

## Word Online display observation

Word Online displayed `i`/`ii` in the editor and native note panel even with explicit decimal settings. Its saved DOCX retained `w:numFmt w:val="decimal"` in both settings and section properties. This is a measured display discrepancy, not evidence that the policy was lost. The web editor showed the rich note body, lists, external hyperlink and all continuation text. Its editor page count excluded the note panel; it is not a print-pagination reference.

[Microsoft documents Word's lowerRoman default when endnote numFmt is absent](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/a910e9f7-f95f-49ad-ad23-68ea9a7922cd). That default does not explain away the explicit-decimal display discrepancy.
