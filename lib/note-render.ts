import type { MeasuredNoteBody } from './note-body-measure';
import type { PageNoteReservation } from './note-layout';

/** Build an unattached page layer with exactly one copy of each requested
 * note-local line. Caller owns lifecycle, stale-doc checks and page placement.
 * Changing widths require separate verified geometry and are refused rather
 * than rewrapping a continuation without remeasurement. */
export function renderPageNotes(owner: Document, page: PageNoteReservation, measured: ReadonlyMap<string, MeasuredNoteBody>): { element?: HTMLElement; diagnostic?: string } {
  const layer = owner.createElement('div'); layer.className = 'pm-footnote-layer';
  layer.setAttribute('data-footnote-page', String(page.pageIndex));
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  for (const fragment of page.fragments) {
    const body = measured.get(fragment.noteId);
    if (!body || Math.abs(body.width - fragment.rect.width) > 0.5) return { diagnostic: 'note-width-mismatch' };
    const first = body.lines.findIndex(line => line.from === fragment.from);
    const last = body.lines.findIndex((line, i) => i >= first && line.to === fragment.to);
    if (first < 0 || last < first) return { diagnostic: 'note-range-mismatch' };
    const lines = body.lines.slice(first, last + 1);
    const measuredHeight = lines.reduce((sum, line) => sum + line.height, 0);
    if (Math.abs(measuredHeight - fragment.rect.height) > 0.5) return { diagnostic: 'note-height-mismatch' };
    let top = fragment.rect.y;
    for (const line of lines) {
      const element = owner.createElement('div'); element.className = 'pm-footnote-line';
      element.dataset.noteId = fragment.noteId; element.dataset.noteFrom = String(line.from); element.dataset.noteTo = String(line.to);
      element.style.cssText = `${line.style};position:absolute;left:${fragment.rect.x + line.left}px;top:${top + line.leading}px;white-space:pre;pointer-events:auto;`;
      element.innerHTML = line.html || '<br>';
      for (const link of element.querySelectorAll<HTMLElement>('.pm-footnote-backlink')) {
        link.setAttribute('href', `#edtr-note-owner-${fragment.noteId}`);
        link.dataset.noteBacklink = fragment.noteId;
      }
      if (!fragment.continuation && line === lines[0]) {
        element.id = `edtr-note-${fragment.noteId}`;
        element.setAttribute('role', 'button'); element.tabIndex = 0;
      }
      if (line.marker) {
        const marker = owner.createElement('span'); marker.className = 'pm-footnote-list-marker';
        marker.textContent = line.marker.text;
        marker.style.cssText = `${line.marker.style};position:absolute;left:${fragment.rect.x + line.marker.left}px;top:${top + line.leading + line.marker.top}px;pointer-events:none;`;
        layer.appendChild(marker);
      }
      layer.appendChild(element); top += line.height;
    }
  }
  return { element: layer };
}
