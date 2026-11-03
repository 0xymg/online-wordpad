import type { NoteKind } from './document-notes';

/** Enable only after physical-page footnote screen/print/PDF acceptance. Model
 * validation and native export remain available independently of this UI gate. */
export const FOOTNOTE_EDITING_ENABLED = false;
export const noteKindEditingEnabled = (kind: NoteKind): boolean => kind === 'endnote' || FOOTNOTE_EDITING_ENABLED;
