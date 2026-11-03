# Word Online reference fixture

`word-online-normalized-v7.docx` is a synthetic document exported by EDTRDocs, opened in Word Online, updated there (including a renamed level-3 heading and TOC refresh), and downloaded again. It exercises Word's reordered zero-width bookmark boundaries, removal of duplicate caption metadata names, native complex fields, and a noncontiguous `[1, 3]` table of contents.

The original downloaded package SHA-256 was `d59fd32eefa2e17f511a91fa3d51c49b5e4b81ad442893b1a4c65653f9f532ec`. The checked-in package SHA-256 is `5194d68927481776bf9fac1e67436d24d22ad9580415256f8acdb44c944ff024`. Only author, last-modifier, and company values in `docProps/core.xml` and `docProps/app.xml` were replaced with `Synthetic fixture`. `word/document.xml` and its relationships were retained byte-for-byte. The package contains no external relationships.

Run `scripts/check-reference-word-roundtrip.cjs` against an isolated application server to verify the Word-normalized import, export, and reimport.

`word-online-normalized-v9.docx` is the later synthetic probe downloaded after two Word Online TOC refreshes with no intervening typing. Its cached TOC updates to `WORD_PURE_LEVEL_THREE` and retains `TOC_TITLE`; both unique caption metadata bookmarks remain present. Original downloaded SHA-256: `0647654d75710de0b93c0b958268ed123a8e062d7ee300160bfa811df88c948b`. Sanitized fixture SHA-256: `0fc22773968ed6f8cd8c0284d4cab0d1bfee62322a74d1ae78927ee2086fe2b6`. Sanitization uses the same rules as v7: only creator, last-modifier and company docProps are replaced, the document and relationships stay byte-for-byte unchanged, and no external relationships are present. Run the same script with `REFERENCE_WORD_FIXTURE=v9` for this case.
