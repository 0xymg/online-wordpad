import type { NoteKind } from './document-notes';

/** Public notes share the measured physical-page screen/print/PDF pipeline.
 * Unsupported document layouts report a diagnostic and block incomplete output. */
export const FOOTNOTE_EDITING_ENABLED = true;
export const noteKindEditingEnabled = (kind: NoteKind): boolean => kind === 'endnote' || FOOTNOTE_EDITING_ENABLED;
