/** Pure per-pass footnote planner; all coordinates are unzoomed CSS pixels.
 * Note offsets are local to their own stored document, never main-doc positions. */
export type NotePageRect = { x: number; y: number; width: number; height: number };
export type MeasuredNoteUnit = { from: number; to: number; height: number };
export type NoteOwner = { noteId: string; sectionId: string; pageIndex: number; lineBottom: number; lineHeight?: number; units: readonly MeasuredNoteUnit[] };
export type PlannedNoteFragment = { noteId: string; from: number; to: number; pageIndex: number; rect: NotePageRect; continuation: boolean };
export type PageNoteReservation = { pageIndex: number; reservePx: number; fragments: PlannedNoteFragment[] };
export type NoteLayoutDiagnostic = { code: 'note-invalid-input' | 'note-unit-exceeds-page' | 'note-anchor-cannot-fit'; noteId?: string; pageIndex?: number };
export type NotePlan = { pages: PageNoteReservation[]; advance: { noteId: string; sectionId: string; fromPage: number; toPage: number }[]; continuationPages: { sectionId: string }[]; remeasure: { noteId: string; from: number; pageIndex: number; width: number }[]; diagnostics: NoteLayoutDiagnostic[]; complete: boolean };

/** Physical text-area rectangles must already reflect mixed section margins.
 * A pending continuation precedes new notes. The caller applies reservations
 * and advance constraints to the body solver and repeats until joint convergence.
 * Additional pages are requested, not faked as extra DOM height. */
export function planPageNotes(input: { pages: readonly NotePageRect[]; owners: readonly NoteOwner[]; separatorHeight: number; continuationSeparatorHeight: number; gap: number; maxContinuationContentHeight?: number; resolveContinuation?: (noteId: string, from: number, width: number) => readonly MeasuredNoteUnit[] | undefined }): NotePlan {
  const result: NotePlan = { pages: [], advance: [], continuationPages: [], remeasure: [], diagnostics: [], complete: false };
  const validNumber = (x: number) => Number.isFinite(x) && x >= 0;
  const fail = (code: NoteLayoutDiagnostic['code'], noteId?: string, pageIndex?: number) => { result.diagnostics.push({ code, ...(noteId ? { noteId } : {}), ...(pageIndex === undefined ? {} : { pageIndex }) }); return result; };
  if (![input.separatorHeight, input.continuationSeparatorHeight, input.gap].every(validNumber) || (input.maxContinuationContentHeight !== undefined && (!Number.isFinite(input.maxContinuationContentHeight) || input.maxContinuationContentHeight <= 0)) || input.pages.some(p => ![p.x, p.y, p.width, p.height].every(Number.isFinite) || p.width <= 0 || p.height <= 0 || (input.maxContinuationContentHeight !== undefined && p.height > input.maxContinuationContentHeight))) return fail('note-invalid-input');
  const seen = new Set<string>(); let previousPage = -1;
  for (const owner of input.owners) {
    const page = input.pages[owner.pageIndex];
    if (!owner.noteId || !owner.sectionId || seen.has(owner.noteId) || !Number.isInteger(owner.pageIndex) || !page || owner.pageIndex < previousPage || !Number.isFinite(owner.lineBottom) || owner.lineBottom < page.y || owner.lineBottom > page.y + page.height || (owner.lineHeight !== undefined && (!Number.isFinite(owner.lineHeight) || owner.lineHeight <= 0)) || !owner.units.length) return fail('note-invalid-input', owner.noteId, owner.pageIndex);
    let end = -1;
    for (const unit of owner.units) {
      if (!Number.isInteger(unit.from) || !Number.isInteger(unit.to) || unit.from < 0 || unit.to < unit.from || unit.from < end || !Number.isFinite(unit.height) || unit.height <= 0) return fail('note-invalid-input', owner.noteId, owner.pageIndex);
      end = unit.to;
    }
    seen.add(owner.noteId); previousPage = owner.pageIndex;
  }
  type Pending = { owner: NoteOwner; units: readonly MeasuredNoteUnit[]; next: number; started: boolean; width: number };
  const queue: Pending[] = []; let ownerIndex = 0;
  for (let pageIndex = 0; pageIndex < input.pages.length; pageIndex++) {
    const page = input.pages[pageIndex], bottom = page.y + page.height;
    while (ownerIndex < input.owners.length && input.owners[ownerIndex].pageIndex === pageIndex) { const owner = input.owners[ownerIndex++]; queue.push({ owner, units: owner.units, next: 0, started: false, width: page.width }); }
    const partial: Array<{ owner: NoteOwner; units: readonly MeasuredNoteUnit[]; start: number; end: number; offset: number; height: number; continuation: boolean }> = [];
    const deferred: Pending[] = [];
    // Reserve enough body clearance for every owner line on this page. New
    // notes sharing one body line must each get their first readable unit,
    // even if an earlier note continues on the next physical page.
    let used = 0; const limit = Math.min(page.height, ...queue.filter(item => !item.started && item.owner.pageIndex === pageIndex).map(item => bottom - item.owner.lineBottom));
    while (queue.length) {
      const item = queue[0], first = !item.started;
      if (!first && Math.abs(item.width - page.width) > 0.5) {
        const from = item.units[item.next].from, remeasured = input.resolveContinuation?.(item.owner.noteId, from, page.width);
        if (!remeasured) { result.remeasure.push({ noteId: item.owner.noteId, from, pageIndex, width: page.width }); return result; }
        if (!remeasured.length || remeasured[0].from !== from || remeasured.at(-1)!.to !== item.units.at(-1)!.to || remeasured.some((unit, i) => !Number.isInteger(unit.from) || !Number.isInteger(unit.to) || unit.to < unit.from || !Number.isFinite(unit.height) || unit.height <= 0 || (i > 0 && unit.from < remeasured[i - 1].to))) return fail('note-invalid-input', item.owner.noteId, pageIndex);
        // Structural PM boundaries can create legitimate gaps between lines,
        // but every previously measured content interval must still be covered.
        for (const old of item.units.slice(item.next)) {
          if (old.from === old.to) {
            if (!remeasured.some(line => line.from === old.from && line.to === old.to)) return fail('note-invalid-input', item.owner.noteId, pageIndex);
            continue;
          }
          let cursor = old.from;
          for (const line of remeasured) {
            if (line.to <= cursor) continue;
            if (line.from > cursor) break;
            cursor = Math.max(cursor, line.to); if (cursor >= old.to) break;
          }
          if (cursor < old.to) return fail('note-invalid-input', item.owner.noteId, pageIndex);
        }
        item.units = remeasured; item.next = 0; item.width = page.width;
      }
      const unit = item.units[item.next];
      const separator = partial.length ? input.gap : first ? input.separatorHeight : input.continuationSeparatorHeight;
      const maxHeight = input.maxContinuationContentHeight;
      if (maxHeight !== undefined && unit.height + (first ? input.separatorHeight : input.continuationSeparatorHeight) > maxHeight + 0.001) return fail('note-unit-exceeds-page', item.owner.noteId, pageIndex);
      if (first && maxHeight !== undefined && item.owner.lineHeight !== undefined && item.owner.lineHeight + input.separatorHeight + unit.height > maxHeight + 0.001) return fail('note-anchor-cannot-fit', item.owner.noteId, pageIndex);
      const firstUnitsAfter = queue.slice(1).filter(next => !next.started && next.owner.pageIndex === pageIndex)
        .reduce((sum, next) => sum + input.gap + next.units[0].height, 0);
      const budget = limit - firstUnitsAfter;
      if (used + separator + unit.height > budget + 0.001) {
        if (first) {
          result.advance.push({ noteId: item.owner.noteId, sectionId: item.owner.sectionId, fromPage: pageIndex, toPage: pageIndex + 1 });
          queue.shift();
          while (queue.length && !queue[0].started && queue[0].owner.pageIndex === pageIndex) {
            const later = queue.shift()!; result.advance.push({ noteId: later.owner.noteId, sectionId: later.owner.sectionId, fromPage: pageIndex, toPage: pageIndex + 1 });
          }
        }
        break;
      }
      used += separator;
      const start = item.next, offset = used;
      while (item.next < item.units.length && used + item.units[item.next].height <= budget + 0.001) used += item.units[item.next++].height;
      partial.push({ owner: item.owner, units: item.units, start, end: item.next, offset, height: used - offset, continuation: !first });
      item.started = true;
      queue.shift();
      if (item.next < item.units.length) deferred.push(item);
    }
    // An unfinished earlier note also displaces owners waiting behind it.
    // Never start such a note on a later page without first moving its owner.
    for (let i = 0; i < queue.length;) {
      const item = queue[i];
      if (!item.started && item.owner.pageIndex === pageIndex) {
        result.advance.push({ noteId: item.owner.noteId, sectionId: item.owner.sectionId, fromPage: pageIndex, toPage: pageIndex + 1 });
        queue.splice(i, 1);
      } else i++;
    }
    queue.unshift(...deferred);
    const fragments = partial.map(part => ({ noteId: part.owner.noteId, from: part.units[part.start].from, to: part.units[part.end - 1].to, pageIndex, rect: { x: page.x, y: bottom - used + part.offset, width: page.width, height: part.height }, continuation: part.continuation }));
    result.pages.push({ pageIndex, reservePx: used, fragments });
  }
  if (queue.length) result.continuationPages.push({ sectionId: queue[0].owner.sectionId }); // caller creates real geometry and replans
  else if (result.advance.some(item => item.toPage >= input.pages.length)) result.continuationPages.push({ sectionId: result.advance.find(item => item.toPage >= input.pages.length)!.sectionId });
  result.complete = !result.advance.length && !result.continuationPages.length && !result.remeasure.length && !result.diagnostics.length;
  return result;
}
