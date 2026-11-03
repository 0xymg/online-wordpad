/** Resolve navigation against the final printed artwork, after editor chrome is
 * removed. Live caret boxes may differ (notably at zero-size bookmark atoms). */
export type PdfLinkTarget = { pageIndex: number; x: number; y: number };

export function printedLinkTargets(sheets: HTMLElement[], expected: ReadonlySet<string>): Map<string, PdfLinkTarget> {
  const result = new Map<string, PdfLinkTarget>();
  sheets.forEach((sheet, pageIndex) => {
    const box = sheet.getBoundingClientRect(), owner = sheet.ownerDocument;
    const visible = (rect: DOMRect) => rect.height > .1 && rect.bottom > box.top + .1 && rect.top < box.bottom - .1 && rect.right >= box.left && rect.left < box.right;
    const point = (element: HTMLElement) => {
      const bookmark = element.hasAttribute('data-edtr-bookmark');
      const root = bookmark ? element.closest('p,h1,h2,h3,h4,h5,h6,li,td,th') || element.parentElement! : element;
      const walker = owner.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode as Text;
        if (!text.textContent?.trim() || text.parentElement?.closest('.pm-endnote-separator,style,script')) continue;
        if (bookmark && !(element.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        const style = owner.defaultView!.getComputedStyle(text.parentElement!);
        if (style.display === 'none' || style.visibility === 'hidden' || Number.parseFloat(style.fontSize) === 0) continue;
        const range = owner.createRange(); range.selectNodeContents(text);
        const rect = Array.from(range.getClientRects()).find(visible);
        if (rect) return rect;
      }
      // Empty bookmarks/targets retain their measured boundary, without using
      // an unrelated following paragraph or an off-page clone.
      return Array.from(element.getClientRects()).find(rect => rect.top >= box.top && rect.top < box.bottom && rect.left >= box.left && rect.left < box.right);
    };
    const register = (key: string, element: HTMLElement) => {
      if (!expected.has(key) || result.has(key)) return;
      const rect = point(element); if (!rect) return;
      result.set(key, { pageIndex, x: Math.max(0, rect.left - box.left), y: Math.max(0, rect.top - box.top) });
    };
    for (const element of sheet.querySelectorAll<HTMLElement>('[data-edtr-target-id]')) register(element.dataset.edtrTargetId || '', element);
    for (const element of sheet.querySelectorAll<HTMLElement>('[data-edtr-note-reference]')) register(`note-owner:${element.dataset.noteId}`, element);
    for (const element of sheet.querySelectorAll<HTMLElement>('[data-note-owner-id][data-note-block="0"]')) register(`note-body:${element.dataset.noteOwnerId}`, element);
    for (const element of sheet.querySelectorAll<HTMLElement>('.pm-footnote-line[id^="edtr-note-"]')) register(`note-body:${element.dataset.noteId}`, element);
  });
  return result;
}
