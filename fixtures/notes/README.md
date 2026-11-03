# Native note fixtures

All documents here are synthetic test content, not personal templates.

- `native-endnote-supported.docx`: reproducible with `node scripts/generate-note-fixtures.cjs`; one native endnote with bold/italic, tab, hard break, external link, numbered list and 450-word continuation text. With no explicit native endnote format, Word uses lower Roman; the importer follows that Word behavior. Newly created EDTR notes default to decimal.
- `word-online-normalized-v3.docx`: exported from EDTR, explicit decimal document/section note policy, opened in Word Online on 2026-11-03; an additional empty endnote was inserted through References → Insert Endnote to exercise Word's native note editor. The original rich note and its `EDNT8f8715a6f8b04ce98ea19e086911ffeb` identity survive. The second note has native ID 20268; application identity is allocated on import.

The Word-normalized file's document/note XML and relationships are unchanged. Only creator, last-modifier and company metadata were replaced with `EDTR compatibility fixture`.

- Downloaded source SHA-256: `d5c554adad1a307fef6c0ea585b396a9a0d87dd7ff62e95a0bb171a5795aabf1`
- Sanitized fixture SHA-256: `505319a8a1d7e06884ca80882aa6b357d21c4196dacdd67b1ec96eb4b235d720`

## Word Online display observation

Word Online displayed `i`/`ii` in the editor and native note panel even with explicit decimal settings. Its saved DOCX retained `w:numFmt w:val="decimal"` in both settings and section properties. This is a measured display discrepancy, not evidence that the policy was lost. The web editor showed the rich note body, lists, external hyperlink and all continuation text. Its editor page count excluded the note panel; it is not a print-pagination reference.

[Microsoft documents Word's lowerRoman default when endnote numFmt is absent](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/a910e9f7-f95f-49ad-ad23-68ea9a7922cd). That default does not explain away the explicit-decimal display discrepancy.

## Word Online footnote fixture

`word-online-footnotes.docx` is a synthetic two-column EDTR export opened in Word Online on 2026-11-03. Both references opened in Word's native footnote panel with decimal labels 1/2. Format Footnotes was set to size 11 for the first note and Apply was clicked; the saved document was downloaded from OneDrive. However, the downloaded note XML contains no size override or FootnoteText style reference, and still inherits Normal's 12pt size. The UI action is not evidence of persisted 11pt formatting. Its two `EDNT` identities (32 `a` and 32 `b` characters), all 600 `TAIL0`–`TAIL599` words and `FOOTNOTE_SECOND` survived. This verifies native ownership and content, not matching print pagination.

Only creator, last-modifier and company metadata were sanitized. Every non-`docProps` ZIP entry is byte-identical to the downloaded source.

- Downloaded source SHA-256: `1ad37de6bac27049a7909b0bf9a3b90ba17a33c47e8d6f5b2af48eb96d9ee3bd`
- Sanitized fixture SHA-256: `d1f529629d4b3cd4e018fd52282201916c2e88e9b967fe429c5197040896f7d5`

Sanitization matches metadata element local names regardless of XML namespace prefix; Word may serialize `lastModifiedBy` with a generated prefix. Document, numbering, note and relationship parts remain unchanged.
