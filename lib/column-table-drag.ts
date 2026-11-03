import type { EditorView } from 'prosemirror-view';
import { CellSelection } from 'prosemirror-tables';

/** Keep a native text drag across the gap between two bands of one cell.
 * prosemirror-tables treats the gap as a different cell on mousemove. */
export function guardColumnTableTextDrag(view: EditorView, event: MouseEvent): (() => void) | undefined {
  if (!view.editable || event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target instanceof Element ? event.target : null;
  const line = target?.closest('[data-column-table-line]');
  const table = line?.closest('[data-column-table-bands]');
  const startCell = line?.closest('td,th');
  if (!table || !startCell || !view.dom.contains(startCell)) return;
  const doc = view.dom.ownerDocument, win = doc.defaultView, source = view.state.doc;
  let cellPosition: number;
  try { cellPosition = view.posAtDOM(startCell, 0); } catch { return; }
  const stop = () => {
    doc.removeEventListener('mousemove', move, true);
    doc.removeEventListener('mouseup', up, true);
    doc.removeEventListener('dragstart', stop, true);
    win?.removeEventListener('blur', stop);
  };
  const move = (next: MouseEvent) => {
    if (view.isDestroyed || view.state.doc !== source || !(next.buttons & 1)) { stop(); return; }
    // A straight drag between two bands may cross other cells on the way.
    // Defer the cell-versus-text decision until the actual release point.
    // Do not prevent the browser's native selection default.
    next.stopPropagation();
  };
  const up = (end: MouseEvent) => {
    const element = end.target instanceof Element ? end.target : null;
    const cell = element?.closest('td,th');
    const painted = element?.closest<HTMLElement>('[data-column-table-cell]');
    let endPosition: number | undefined;
    try {
      if (cell && view.dom.contains(cell)) endPosition = view.posAtDOM(cell, 0);
      else if (painted) endPosition = Number(painted.dataset.columnTableCell);
    } catch { /* An unmeasurable release leaves the native selection alone. */ }
    stop();
    if (!Number.isInteger(endPosition) || endPosition === cellPosition || view.isDestroyed || view.state.doc !== source) return;
    const anchor = cellPosition - 1, head = endPosition! - 1;
    // Run after the editor's mouseup handlers and its native selection sync.
    setTimeout(() => {
      if (view.isDestroyed || view.state.doc !== source) return;
      try { view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, anchor, head))); }
      catch { /* A release outside this table is not a cell selection. */ }
    }, 0);
  };
  doc.addEventListener('mousemove', move, true);
  doc.addEventListener('mouseup', up, true);
  doc.addEventListener('dragstart', stop, true);
  win?.addEventListener('blur', stop);
  return stop;
}
