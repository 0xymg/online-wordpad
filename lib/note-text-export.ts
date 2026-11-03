/** Notes in text-oriented formats use one export number per canonical owner,
 * across kinds and sections. View caches and their displayed labels are never
 * used as storage: a section restart cannot alias two different note bodies. */
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { getDocumentModel } from './document-model';
import { referenceFieldText } from './document-references';
import { collectNoteIndex, unprojectEndnotes, validateNoteBody, validateNoteProjection, type NoteKind } from './document-notes';

export type TextExportNote = { noteId: string; number: number; markdownKey: string; kind: NoteKind; body: PMNode };
export function prepareTextNoteExport(doc: PMNode): { doc: PMNode; notes: TextExportNote[]; byId: Map<string, TextExportNote> } {
  getDocumentModel(doc);
  const projection = validateNoteProjection(doc);
  if (projection.length) throw new Error(projection[0].message);
  const canonical = unprojectEndnotes(EditorState.create({ doc }).tr).doc;
  const index = collectNoteIndex(canonical);
  if (index.diagnostics.length) throw new Error(index.diagnostics[0].message);
  const notes = index.notes.map((entry, index) => ({ noteId: entry.noteId, number: index + 1, markdownKey: `edtr-note-${index + 1}`, kind: entry.kind, body: doc.type.schema.nodeFromJSON(validateNoteBody(entry.record.body, doc.type.schema)) }));
  return { doc: canonical, notes, byId: new Map(notes.map(note => [note.noteId, note])) };
}

function inlineText(node: PMNode, notes: ReadonlyMap<string, TextExportNote>): string {
  let out = '';
  node.forEach(child => {
    if (child.isText) out += child.text;
    else if (child.type.name === 'citation_field') out += (child.attrs.cachedRuns || []).map((r: {text:string})=>r.text).join('') || '…';
    else if (child.type.name === 'note_reference') {
      const note = notes.get(String(child.attrs.noteId));
      if (!note) throw new Error('Cannot export a note reference without its canonical body');
      out += `[${note.number}]`;
    } else if (child.type.name === 'tab') out += '\t';
    else if (child.type.name === 'hard_break' || child.type.name === 'column_break') out += '\n';
    else if (child.type.name === 'text_box') out += String(child.attrs.text || '');
    else if (child.type.name === 'reference_field') out += referenceFieldText(child);
    // Match doc_field.toDOM: PAGE/NUMPAGES are visible placeholders in the
    // main story; OTHER owns a cached display value (or the pending ellipsis).
    else if (child.type.name === 'doc_field') out += child.attrs.kind === 'OTHER' ? String(child.attrs.cached || '…') : child.attrs.kind === 'NUMPAGES' ? '…' : '1';
    else if (child.type.name === 'image') out += String(child.attrs.alt || '[image]');
    else if (child.childCount) out += inlineText(child, notes);
  });
  return out;
}
function blockText(node: PMNode, notes: ReadonlyMap<string, TextExportNote>, indent = ''): string {
  if (node.isTextblock) return inlineText(node, notes) + '\n\n';
  if (node.type.name === 'bullet_list' || node.type.name === 'ordered_list') {
    let number = Number(node.attrs.order || 1), out = '';
    node.forEach(item => {
      const marker = node.type.name === 'ordered_list' ? `${number++}. ` : '- '; let first = true;
      item.forEach(block => {
        if (block.type.name === 'bullet_list' || block.type.name === 'ordered_list') out += blockText(block, notes, indent + '  ');
        else { const lines = blockText(block, notes).trimEnd().split('\n'); out += lines.map((line, index) => indent + (first && index === 0 ? marker : ' '.repeat(marker.length)) + line).join('\n') + '\n'; first = false; }
      });
    });
    return out + '\n';
  }
  if (node.type.name === 'table') {
    let out = ''; node.forEach(row => { const cells: string[] = []; row.forEach(cell => { const blocks: string[] = []; cell.forEach(block => blocks.push(blockText(block, notes).trimEnd())); cells.push(blocks.join(' / ')); }); out += cells.join('\t') + '\n'; }); return out + '\n';
  }
  if (node.type.name === 'horizontal_rule') return '---\n\n';
  if (node.type.name === 'page_break') return '\n';
  let out = ''; node.forEach(child => { out += blockText(child, notes, indent); }); return out;
}
/** Readable fallback: [n] owner markers and exactly one numbered appendix body.
 * These export numbers deliberately do not reuse section/kind display labels. */
export function docToText(doc: PMNode): string {
  const plan = prepareTextNoteExport(doc);
  let out = blockText(plan.doc, plan.byId).trimEnd();
  if (plan.notes.length) {
    out += '\n\nNotes\n';
    for (const note of plan.notes) out += `\n[${note.number}] (${note.kind})\n${blockText(note.body, plan.byId).trimEnd()}\n`;
  }
  return out + '\n';
}
