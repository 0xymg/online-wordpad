# A3 column model contract

Status: implementation contract, not a claim that column layout or editing is supported. The geometry and interaction gate remains a prerequisite for production integration. This supplements `advanced-document-contracts.md` and `columns-implementation-plan.md`.

## Version 3 data

Each identity-keyed section record owns:

```ts
type SectionColumns =
  | { kind: "equal"; count: 1 | 2 | 3; space: number; separator: boolean }
  | { kind: "preserved"; reason: "unequal" | "unsupported-count" | "invalid-native" };
type SectionFlowDirection = "ltr" | "rtl" | "preserved";
```

`space` is a finite nonnegative integer number of twips. Validate against the section's usable page width: `(width - leftMargin - rightMargin - (count - 1) * space) / count` must leave at least 720 twips per column. A supported count, even one, retains its specified gap and separator; don't silently replace explicit zero. Column geometry is derived, not stored as page fragments in the document. New multiple-column settings start at 720 twips. A native missing `w:num` means one and missing `w:equalWidth` means true; a Word Online probe with two equal columns found omitted `w:space` produced the same right anchor as explicit 720, unlike zero ([measurement](../fixtures/columns/defaults/MEASUREMENT.md)). Treat 720 as the import default for that supported case, while preserving the original raw XML and acknowledging this probe's limits.

`flowDirection` is managed section-level `w:bidi` semantics, default `ltr`; it determines logical column traversal and physical placement. It is independent of paragraph bidi/text direction, which must not reverse section column order. It is not an instruction to reverse character content. An unsupported or invalid native bidi value is `preserved`; retain its source and report the unsupported state. Only explicit conversion may replace it with a managed direction.

`rawProperties` remains the sole native `sectPr` preservation source. Native unequal widths, unsupported counts, or invalid geometry are `preserved`, not silently normalized. Untouched `w:cols` and children must round-trip from raw source; fallback display is not Word equivalence. For supported equal columns, merge managed `num`, `space`, `sep`, and `equalWidth` into the native element, retaining unknown attributes and unrelated section properties. Do not duplicate an old `w:cols` or let its stale managed attributes override edits. An explicit user conversion from preserved to equal can replace the incompatible width children; unrelated unknown attributes and section properties remain intact. Missing `w:cols` is a supported one-column section; invalid native input must not be silently treated as absent.

## Migration and failure boundaries

Write model version 3. Read valid versions 1 and 2 and derive columns and section flow direction from each record's own native `rawProperties`, using defaults only when genuinely absent; do not turn existing native multi-column records into one column. Preserve document ID, every section ID and boundary, tab data, text, source XML, running slots, relationships, and links. Migration is atomic, idempotent, and not in undo history; opening, restore, and re-open use the same path. Version 0 first follows the existing identity migration and then the same derivation. A malformed known model fails without writing a partial result. Read the envelope before parsing content and reject versions above 3 without editing or autosaving the original; old readers must similarly reject version 3. On validation failure preserve the source and expose a diagnostic.

## Column break

`column_break` is one inline atom in the canonical schema, with HTML carrier `br[data-edtr-column-break]` and native DOCX carrier `w:br w:type="column"`. Import must distinguish it from line and page breaks; export must preserve it in run order and formatting context. Plain text and Markdown use newline as a deliberately lossy fallback. A visible editing marker is a nonprinting decoration. Deleting the atom is one edit and undo restores it. A solver moves to the next logical column, or the next physical page when in the final column; a single-column break goes to the next page. Terminal break pagination depends on the remaining column: an actual Word Online one-column terminal-break probe produced a blank second page; the two-column last-column probe also produced a blank second page, while the one-column terminal page-break control produced one page. Do not generalize from a first-of-two-column terminal break. First insertion scope is body paragraphs and headings; reject table cells, text boxes, and lists until their behavior is separately established. Existing imported breaks in unsupported contexts must not be erased on save.

## Commands and ownership

A section command takes an explicit stable section ID and validated settings. An all-document command resolves the current section IDs once and applies the same settings to each in one transaction; validate every target before changing any. Reject stale IDs, invalid geometry or unsupported contexts without partial mutation. Conversion of preserved native columns is an explicit user choice; all-document operation must surface and require that choice for each affected preserved section, rather than silently destroying it. Commands preserve identities, section boundaries, other section properties and content. Each user operation, including all-section conversion, is one undo step and redo restores the same records and source behavior. Direction changes, where exposed, are separate section properties and must not mutate paragraph direction.

## Expected implementation and verification

The model, migration and projection belong in `lib/document-model.ts` and the existing schema/serialization and native DOCX import/export paths identified during integration; section command helpers belong with existing section commands. Geometry, interaction, and layout engine files are separately owned and must consume this model rather than redefine it. Do not introduce a parallel raw XML source or persist layout fragments. Exact file selection follows the repository's existing import/export paths.

Focused tests must cover: v1/v2 and v0 migrations with stable IDs and native multicolumns; idempotence and future-version rejection before parse/autosave; default and explicit zero/720 values; count 1/2/3, separator and invalid geometry; unequal widths, unsupported count, invalid native values and unknown attrs round-trip; bidi section versus paragraph direction; one/all commands, failed atomic validation, conversion, undo/redo; column break HTML/native round-trip, distinctions from page/line break, unsupported insertion context, delete and undo; and unrelated section properties, relationships and tab data surviving export. Real Word reference measurements are separate from app tests, and layout, editing, PDF and print support require their own end-to-end evidence.
