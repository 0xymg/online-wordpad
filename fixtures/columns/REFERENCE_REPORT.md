# A3 Word Online reference observations

All four exact synthetic sources were opened by the root agent in Microsoft Word Online and exported with Word's native PDF command. The archived bytes, source/PDF SHA-256 and download-file mtime in UTC are recorded in `references/*.provenance.json`; detailed marker boxes, PDF text matrices and vector shapes are in `references/report.json`. Browser engine and Word build were not exposed. Sources specify Arial 11 pt; PDF font names include ArialMT, but substitution was not independently verified.

This is **Word reference evidence only**. No EDTR columns layout has been compared or passed. Native caret/selection/IME support remains the A3.0 prototype gate. The earlier LibreOffice readability render was QA only and is outside this corpus.

| Probe | Actual Word pages | Missing / duplicate expected markers |
| --- | --- | --- |
| column-widths-balance | 6 | 0 / 0 |
| continuous-column-changes | 1 | 0 / 0 |
| column-page-break-controls | 5 | 0 / 0 |
| rtl-column-order | 3 | 0 / 0 |

Every PDF page measures 612×792 pt (Letter). Coordinates below use PDF points from the top-left; multiply by 4/3 for CSS px. Text boxes are extracted character bounds; baseline values, where provided in JSON, come from upright PDF text matrices. A multi-line marker has multiple baseline values and is not assigned a fake single baseline. Vector rectangles/lines are inspected separately from text. None of these measurements is a whole-page visual similarity score.

## Defaults, long paragraph and end-region balancing

Absent native `w:cols` and explicit one-column controls occupy pages 1 and 2. Their first marker starts at x=72.025 pt and glyph top=74.590 pt; the last control marker has top=130.610 pt. This source pair shows equivalent initial horizontal/vertical anchors, not proof of every omitted column attribute default.

The **one** long two-column paragraph spans pages 3–5:

| Page | Physical left column | Physical right column |
| --- | --- | --- |
| 3 | BEGIN, WIDTH2_0000…WIDTH2_0090 | WIDTH2_0091…WIDTH2_0182 |
| 4 | WIDTH2_0183…WIDTH2_0274 | WIDTH2_0275…WIDTH2_0366 |
| 5 | WIDTH2_0367…WIDTH2_0419, END | No marker/text from this paragraph |

The left column starts at x=72.025 pt; the right starts at x=324.130 pt. On pages 3 and 4, the separator is a filled vector rectangle x=305.880…306.630 pt, top=72.025 to bottom=716.225 pt. Page 5 has no such separator shape in the extracted vector objects. Remaining paragraph content stays in the first column; it is **not balanced** across both columns in this next-page-ended section.

The short final three-column section is page 6. All `BALANCE3_000…011` rows and BEGIN/END remain in physical column 0; no separator vector is drawn. It is **not balanced** into three columns at document end in this exact source/capture. This negative evidence rules out blindly balancing every final region.

## Continuous 1→2→1→2→3 bands

All five sections remain on one physical sheet. First glyph tops (not baseline claims) and column distribution are:

| Region | First top (pt) | Last top (pt) | Distribution |
| --- | --- | --- | --- |
| CONT1_A | 74.590 | 144.610 | One full-width region |
| CONT2_B | 158.610 | 242.640 | 7 lines left (BEGIN…005), 7 right (006…END) |
| CONT1_C | 256.640 | 312.660 | One full-width region below both B columns |
| CONT2_D | 326.660 | 396.680 | 6 lines left (BEGIN…004), 6 right (005…END) |
| CONT3_E | 410.680 | 592.760 | All text in first physical column at document end |

B and D are balanced before the next continuous region. Their separators occupy their used bands (B: top 156.045…254.070 pt; D: 324.095…408.120 pt), rather than the whole remaining page. E at document end is not balanced. These two balancing cases and three non-balancing cases are the scoped evidence; they are not a global statement about every Word compatibility mode or every break combination.

Source settings were checked: compatibilityMode=15 is present; **no `doNotBalanceTextColumns` or other element/attribute value containing “balance” exists in any source Word XML part** for these probes. The sources were not rewritten after capture. Absence of an explicit flag is recorded, not treated as proof of an application-wide default.

## Hard column break, page break and trailing column break

- Single-column control: BEFORE_COLUMN is page 1; AFTER_COLUMN and BEFORE_PAGE are page 2; AFTER_PAGE and CONTROLS_END are page 3. Thus a column break advances a physical page in this one-column source.
- Two-column control: page 4 has BEFORE_COLUMN in the left column; AFTER_COLUMN and BEFORE_PAGE in the right. The explicit page break then starts page 5 in the left column, rather than its right column.
- Page 5 contains AFTER_PAGE, BEFORE_TRAILING_COLUMN and TRAILING_COLUMN_TEXT in the left column. The final run is a column break in the source. Word exports **five pages, not a sixth empty sheet**. An empty activated right column has no extractable marker; the separator is nevertheless drawn x=305.880…306.630 pt, top=72.030…114.030 pt.

Do not derive a universal separator rule from occupied text alone: this trailing-break case draws a separator with no right-column text, while the unbalanced final short three-column case draws none. An author-controlled region activation/break participates in the observed result.

The first PDF export attempt for this probe returned a transient browser HTTP error. A repeat through the ordinary Word export command succeeded; only that successful download is archived.

## Paragraph RTL versus section RTL column order

Physical column indices count **from the left** and are independent of logical source order:

| Source control | BEGIN / FIRST | SECOND | THIRD / END |
| --- | --- | --- | --- |
| Paragraph bidi only, 2 columns | Physical left | Physical right | END right |
| Section bidi=1, 2 columns | Physical right | Physical left | END left |
| Section bidi=1, 3 columns | Physical right | Physical middle | THIRD and END left |

RTL paragraph direction alone did not reverse column order in the negative control. Explicit section bidi reversed the observed logical column progression. The full `SECTION_RTL3_SECOND` marker wraps over two visual lines; it is recovered exactly once from PDF character stream order, and the JSON records both baselines. No font/ligature/IME fidelity conclusion follows from the marker count.

## Consequences for the gated implementation

Start the A3.0 geometry spike with sequential fill. Add balancing for the observed continuous closing-band cases only after the native caret/fragment gate and reference tests exist. Do not automatically balance document end or next-page-ended sections based on the earlier candidate plan. Hard column/page breaks, section bidi column order and active separator bands are distinct constraints. Keep unmeasured combinations visible in the support matrix; these references do not waive the single-editable-DOM/PM-coordinate/selection acceptance criteria.
