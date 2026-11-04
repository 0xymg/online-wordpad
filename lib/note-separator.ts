/** Derived, textless native endnote separator. It is never part of the saved story. */
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { noteSeparators, type NoteRecord } from './document-notes';
import { documentStyles, resolveStyle } from './document-styles';
import { wordAutomaticLineHeight } from './word-font-metrics';
import { effectiveParagraph } from './paragraph-format';

type NormalStyle = ReturnType<typeof resolveStyle>;
export function nativeArialSeparatorProfile(style: NormalStyle): boolean {
  const text = style.text, family = text.family.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
  return family === 'arial' && !text.bold && !text.italic && text.size >= 11 && text.size <= 20;
}
export function createNativeNoteSeparator(owner: Document, normalStyle: NormalStyle, left = 0, right = 0): HTMLElement {
  const normal = normalStyle.text;
  const color = normal.color && !['#000', '#000000', 'black'].includes(normal.color.toLowerCase()) ? normal.color : 'var(--note-separator-ink, currentColor)';
  const block = owner.createElement('span'), line = owner.createElement('span');
  block.className = 'pm-endnote-separator'; block.setAttribute('aria-hidden', 'true');
  block.style.cssText = `display:block!important;height:${normal.size * wordAutomaticLineHeight(1, normal.family)}pt!important;margin-left:${-left}px;width:calc(100% + ${left + right}px);font-family:${normal.family};font-size:${normal.size}pt;font-weight:${normal.bold ? 'bold' : 'normal'};font-style:${normal.italic ? 'italic' : 'normal'};line-height:${wordAutomaticLineHeight(1, normal.family)};text-align:${normalStyle.paragraph.alignment || 'left'};text-indent:0;letter-spacing:normal;word-spacing:normal;text-transform:none;direction:ltr;color:${color};white-space:nowrap;pointer-events:none;`;
  // Use Arial's strikeout metrics for this bounded native profile.
  // Its rendered approximation is measured against Word at 11, 12,
  // 16 and 20 pt; other font/size profiles keep their prior behavior.
  // A half-point downward paint calibration compensates for the difference
  // between the browser midline and Word’s native separator placement. It is
  // shared by every size and flow in this profile; see A7.5 measurements.
  const arialProfile = nativeArialSeparatorProfile(normalStyle);
  const thickness = Math.round(normal.size * 102 / 2048 * 4) / 4;
  line.className = 'pm-endnote-separator-rule';
  line.style.cssText = arialProfile
    ? `display:inline-block;vertical-align:middle;transform:translateY(calc(100% + 0.5pt));width:min(2in,100%);height:${thickness}pt;background:currentColor;`
    : 'display:inline-block;vertical-align:baseline;width:min(2in,100%);height:0;border-top:0.5pt solid currentColor;';
  block.appendChild(line); return block;
}

export function flushNoteSeparatorAlignment(view: EditorView): void {
  if (view.isDestroyed || !view.dom.isConnected) return;
  const root = view.dom.getBoundingClientRect(), scale = root.width / (Number.parseFloat(getComputedStyle(view.dom).width) || root.width);
  if (!Number.isFinite(scale) || scale <= 0) return;
  for (const separator of view.dom.querySelectorAll<HTMLElement>('.pm-endnote-separator')) {
    const paragraph = separator.parentElement, scope = separator.closest<HTMLElement>('[data-note-owner-id]');
    if (!paragraph || !scope) continue;
    const p = paragraph.getBoundingClientRect(), outer = scope.getBoundingClientRect(), style = getComputedStyle(scope);
    const left = (p.left - root.left) / scale;
    const width = (outer.right - root.left) / scale + (Number.parseFloat(style.marginRight) || 0);
    if (!Number.isFinite(left) || !Number.isFinite(width) || width <= 0) continue;
    if (Math.abs((Number.parseFloat(separator.style.marginLeft) || 0) + left) > .01) separator.style.marginLeft = `${-left}px`;
    if (Math.abs((Number.parseFloat(separator.style.width) || 0) - width) > .01) separator.style.width = `${width}px`;
  }
}

export function noteSeparatorPlugin(): Plugin {
  return new Plugin({
    view(view) {
      let scheduled = 0;
      const reconcile = () => { scheduled = 0; flushNoteSeparatorAlignment(view); };
      const queue = () => { if (!scheduled) scheduled = requestAnimationFrame(reconcile); };
      reconcile();
      let width = view.dom.getBoundingClientRect().width;
      return { update(updated, previous) { const next = updated.dom.getBoundingClientRect().width; if (updated.state.doc !== previous.doc || Math.abs(next - width) > .01) queue(); width = next; }, destroy() { if (scheduled) cancelAnimationFrame(scheduled); } };
    },
    props: { decorations(state) {
      const doc = state.doc, records = doc.attrs.documentModel?.notes as Record<string, NoteRecord> | undefined;
    if (!records || !Object.values(records).some(record => record.kind === 'endnote' && record.presentation)) return DecorationSet.empty;
    if (noteSeparators(records, 'endnote').separator !== 'default') return DecorationSet.empty;
    const normalStyle = resolveStyle(documentStyles(doc.attrs.layout), 'Normal'), normal = normalStyle.text;
    const decorations: Decoration[] = []; let previousScope: string | null = null;
    doc.forEach((node, pos) => {
      const scope = node.attrs.noteOwnerId ? `${node.attrs.noteScope}:${node.attrs.noteSectionId}` : null;
      if (scope && scope !== previousScope) {
        let first = node.isTextblock ? pos + 1 : -1;
        if (first < 0) node.descendants((child, offset) => { if (first < 0 && child.isTextblock) first = pos + offset + 2; });
        if (first >= 0) {
          const paragraph = doc.resolve(first).parent, format = effectiveParagraph(paragraph);
          const left = (format.left || 0) / 15, right = (format.right || 0) / 15;
          decorations.push(Decoration.widget(first, () => {
          return createNativeNoteSeparator(document, normalStyle, left, right);
        }, { side: -1, key: `endnote-separator:${scope}:${JSON.stringify([normal, normalStyle.paragraph.alignment, left, right])}` }));
        }
      }
      previousScope = scope;
    });
    return DecorationSet.create(doc, decorations);
  } } });
}
