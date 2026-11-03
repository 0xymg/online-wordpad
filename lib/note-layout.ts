/** Pure per-pass footnote planner; all coordinates are unzoomed CSS pixels.
 * Note offsets are local to their own stored document, never main-doc positions. */
export type NotePageRect = { x: number; y: number; width: number; height: number };
export type MeasuredNoteUnit = { from: number; to: number; height: number };
export type NoteOwner = { noteId: string; sectionId: string; pageIndex: number; lineBottom: number; lineHeight?: number; units: readonly MeasuredNoteUnit[] };
export type PlannedNoteFragment = { noteId: string; from: number; to: number; pageIndex: number; rect: NotePageRect; continuation: boolean };
export type PageNoteReservation = { pageIndex: number; reservePx: number; fragments: PlannedNoteFragment[] };
export type NoteLayoutDiagnostic = { code: 'note-invalid-input' | 'note-unit-exceeds-page' | 'note-anchor-cannot-fit'; noteId?: string; pageIndex?: number };
export type NotePlan = { pages: PageNoteReservation[]; advance: { noteId: string; sectionId: string; fromPage: number; toPage: number }[]; continuationPages: { sectionId: string }[]; diagnostics: NoteLayoutDiagnostic[]; complete: boolean };

/** Physical text-area rectangles must already reflect mixed section margins.
 * A pending continuation precedes new notes. The caller applies reservations
 * and advance constraints to the body solver and repeats until joint convergence.
 * Additional pages are requested, not faked as extra DOM height. */
export function planPageNotes(input: { pages: readonly NotePageRect[]; owners: readonly NoteOwner[]; separatorHeight: number; continuationSeparatorHeight: number; gap: number; maxContinuationContentHeight?: number }): NotePlan {
  const result: NotePlan = { pages: [], advance: [], continuationPages: [], diagnostics: [], complete: false };
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
  type Pending = { owner: NoteOwner; next: number };
  const queue: Pending[] = []; let ownerIndex = 0;
  for (let pageIndex = 0; pageIndex < input.pages.length; pageIndex++) {
    const page = input.pages[pageIndex], bottom = page.y + page.height;
    while (ownerIndex < input.owners.length && input.owners[ownerIndex].pageIndex === pageIndex) queue.push({ owner: input.owners[ownerIndex++], next: 0 });
    const partial: Array<{ owner: NoteOwner; start: number; end: number; offset: number; height: number; continuation: boolean }> = [];
    const deferred: Pending[] = [];
    // Reserve enough body clearance for every owner line on this page. New
    // notes sharing one body line must each get their first readable unit,
    // even if an earlier note continues on the next physical page.
    let used = 0; const limit = Math.min(page.height, ...queue.filter(item => item.next === 0 && item.owner.pageIndex === pageIndex).map(item => bottom - item.owner.lineBottom));
    while (queue.length) {
      const item = queue[0], first = item.next === 0, unit = item.owner.units[item.next];
      const separator = partial.length ? input.gap : first ? input.separatorHeight : input.continuationSeparatorHeight;
      const maxHeight = input.maxContinuationContentHeight;
      if (maxHeight !== undefined && unit.height + (first ? input.separatorHeight : input.continuationSeparatorHeight) > maxHeight + 0.001) return fail('note-unit-exceeds-page', item.owner.noteId, pageIndex);
      if (first && maxHeight !== undefined && item.owner.lineHeight !== undefined && item.owner.lineHeight + input.separatorHeight + unit.height > maxHeight + 0.001) return fail('note-anchor-cannot-fit', item.owner.noteId, pageIndex);
      const firstUnitsAfter = queue.slice(1).filter(next => next.next === 0 && next.owner.pageIndex === pageIndex)
        .reduce((sum, next) => sum + input.gap + next.owner.units[0].height, 0);
      const budget = limit - firstUnitsAfter;
      if (used + separator + unit.height > budget + 0.001) {
        if (first) {
          result.advance.push({ noteId: item.owner.noteId, sectionId: item.owner.sectionId, fromPage: pageIndex, toPage: pageIndex + 1 });
          queue.shift();
          while (queue.length && queue[0].next === 0 && queue[0].owner.pageIndex === pageIndex) {
            const later = queue.shift()!; result.advance.push({ noteId: later.owner.noteId, sectionId: later.owner.sectionId, fromPage: pageIndex, toPage: pageIndex + 1 });
          }
        }
        break;
      }
      used += separator;
      const start = item.next, offset = used;
      while (item.next < item.owner.units.length && used + item.owner.units[item.next].height <= budget + 0.001) used += item.owner.units[item.next++].height;
      partial.push({ owner: item.owner, start, end: item.next, offset, height: used - offset, continuation: !first });
      queue.shift();
      if (item.next < item.owner.units.length) deferred.push(item);
    }
    // An unfinished earlier note also displaces owners waiting behind it.
    // Never start such a note on a later page without first moving its owner.
    for (let i = 0; i < queue.length;) {
      const item = queue[i];
      if (item.next === 0 && item.owner.pageIndex === pageIndex) {
        result.advance.push({ noteId: item.owner.noteId, sectionId: item.owner.sectionId, fromPage: pageIndex, toPage: pageIndex + 1 });
        queue.splice(i, 1);
      } else i++;
    }
    queue.unshift(...deferred);
    const fragments = partial.map(part => ({ noteId: part.owner.noteId, from: part.owner.units[part.start].from, to: part.owner.units[part.end - 1].to, pageIndex, rect: { x: page.x, y: bottom - used + part.offset, width: page.width, height: part.height }, continuation: part.continuation }));
    result.pages.push({ pageIndex, reservePx: used, fragments });
  }
  if (queue.length) result.continuationPages.push({ sectionId: queue[0].owner.sectionId }); // caller creates real geometry and replans
  else if (result.advance.some(item => item.toPage >= input.pages.length)) result.continuationPages.push({ sectionId: result.advance.find(item => item.toPage >= input.pages.length)!.sectionId });
  result.complete = !result.advance.length && !result.continuationPages.length && !result.diagnostics.length;
  return result;
}
