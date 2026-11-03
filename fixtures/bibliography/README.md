# Bibliography formatted-copy transport fixture

`formatted-copy-customxml.docx` contains synthetic Lovelace source data, one locator citation and one generated reference. It uses ordinary Word runs/paragraphs, paired `EDBC` bookmarks and related standard `customXml` graph metadata. It contains no native Word `CITATION` or `BIBLIOGRAPHY` fields.

On 3 November 2026 the original standard-customXml package opened in Word Online with editing enabled, following isolation of an earlier unsupported custom relationship/content-type combination which Word reported as corrupted. Word's visible citation/reference and a plain-text edit outside the bibliography carriers were observed. Screenshot evidence is recorded separately by the main implementation report.

The first downloaded file was byte-identical to the upload and did **not** contain the observed `WORD_EDIT` text. It therefore proves neither a Word save roundtrip nor preservation after a Word save. Direct import of that unchanged package restores the source graph and field identities. A genuinely resaved download must be inspected separately.

`provenance.json` records original and sanitized fixture SHA-256 hashes. Namespace-aware sanitization changes creator/lastModifiedBy (and Company if present) only in the listed metadata parts. Every other uncompressed package part is byte-identical to the original; no repair or document-body rewrite was applied to this fixture.

## Actual Word Online save/download

`word-online-edited.docx` is a later, genuinely resaved Word Online download, not the first unchanged download. Its body contains `BIB_START WORD_EDIT`; the download SHA-256 differs from the upload. Word preserves the graph metadata, source identity `src_5022cfcc26664c8588b09a9f8890ddb0`, citation identity `fld_0bb42f4ae44743868116f0d49d06ffa2` and bibliography identity `fld_5159eade32dd43ad983d2f82e31f2fe1`.

The app **rejects source-preserving import** of this Word-saved file with `BibliographyDocxError: Bibliography visible content changed; preserving the source graph would overwrite Word edits`. Word split the unchanged visible citation/reference into more runs and added language/direction properties. The current conservative correspondence check retains those properties in its signature and rejects the changed native representation. It does not regenerate visible Word content from stale cached metadata. This fixture documents the support limit; it is not a successful editable graph roundtrip through Word Online. Word Online display/edit/save and app→DOCX→app graph roundtrip are separately verified outcomes.

The same namespace-aware metadata sanitization and all-other-parts byte identity verification apply to the saved fixture. No Word body/style/run repair was applied. Its provenance is nested under `wordOnlineEdited` in `provenance.json`.
