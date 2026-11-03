/** Isolated read-only natural-width view used by the A3 layout coordinator. */
import { EditorState, Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { documentSections } from './document-sections';
import { effectiveParagraph } from './paragraph-format';
import { measureNaturalColumnSections, type ColumnMeasurement } from './column-flow-measure';
import { applyImageLayout } from './image-layout';
import { createReadonlyTextBoxView } from './text-box';
import type { Node as PMNode } from 'prosemirror-model';
import { TableView } from 'prosemirror-tables';

/** Same flow metrics as the live image node, without handles or interaction. */
function readonlyImage(node: PMNode) {
  const dom = document.createElement('span'), frame = document.createElement('span'), img = document.createElement('img');
  dom.className = 'pm-image-wrapper'; frame.className = 'pm-image-frame'; frame.appendChild(img); dom.appendChild(frame);
  img.src = String(node.attrs.src || ''); img.alt = String(node.attrs.alt || '');
  img.style.height = 'auto'; img.style.aspectRatio = String(node.attrs.aspectRatio || '');
  const sx = node.attrs.flipX ? -1 : 1, sy = node.attrs.flipY ? -1 : 1;
  img.style.transform = `rotate(${Number(node.attrs.rotate || 0)}deg) scale(${sx}, ${sy})`; img.style.transformOrigin = 'center center';
  applyImageLayout(dom, img, node.attrs);
  return { dom, ignoreMutation: () => true };
}
function readonlyTable(node: PMNode) {
  const tableView = new TableView(node, 25), dom = document.createElement('div');
  dom.className = 'pm-table-wrapper'; dom.appendChild(tableView.dom);
  const table = tableView.dom.querySelector('table'), style = document.createElement('table');
  style.style.cssText = String(node.attrs.layoutStyle || '');
  if (table) { table.style.marginLeft = style.style.marginLeft; table.style.marginRight = style.style.marginRight; }
  return { dom, contentDOM: tableView.contentDOM, update: (next: PMNode) => tableView.update(next) };
}

/** The offscreen view is inert, noneditable and removed even when measurement fails. */
export async function measureColumnDocument(source: EditorView): Promise<ColumnMeasurement> {
  const doc = source.state.doc, sections = documentSections(doc), sourcePage = source.dom.parentElement;
  if (!sourcePage || source.isDestroyed || !source.dom.isConnected) throw new Error('Cannot measure a detached document');
  const unsupported = sections.find(section => section.columns.kind !== 'equal' || section.flowDirection === 'preserved');
  if (unsupported) return { sections: [], blocks: [], tables: [], complete: false, diagnostics: [{ sectionId: unsupported.id, code: 'unsupported-section-columns' }] };
  const { tabLayoutPlugin, createTabNodeView, flushTabLayout } = await import('./tab-layout');
  if (source.state.doc !== doc || source.isDestroyed) throw new Error('Document changed before column measurement');
  const owner = source.dom.ownerDocument, host = sourcePage.cloneNode(false) as HTMLElement;
  host.removeAttribute('id'); host.setAttribute('aria-hidden', 'true'); host.inert = true;
  host.classList.remove('pm-page-mixed');
  // Match the editor's CSS zoom: browser line breaking can differ by a
  // fractional pixel at reduced scales even with the same CSS widths.
  const zoom = sourcePage.style.zoom || '1';
  host.style.cssText += `;position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;transform:none;zoom:${zoom};height:auto;min-height:0;overflow:visible;`;
  owner.body.appendChild(host);
  let measurement: EditorView | undefined;
  try {
    const decorations: Decoration[] = [];
    doc.forEach((node, pos) => {
      const section = sections.find(item => pos >= item.from && pos < item.to) || sections[0];
      if (section.columns.kind !== 'equal') return;
      const g = section.geometry, cols = section.columns;
      const colWidth = (g.width - g.margins.left - g.margins.right - (cols.count - 1) * cols.space) / (15 * cols.count);
      const paragraph = effectiveParagraph(node), indent = (paragraph.left || 0) / 15 + (paragraph.right || 0) / 15;
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: `width:${Math.max(1, colWidth - indent)}px;max-width:none;box-sizing:border-box;overflow-wrap:anywhere` }));
    });
    const widthPlugin = new Plugin({ props: { decorations: state => DecorationSet.create(state.doc, decorations) } });
    measurement = new EditorView(host, { state: EditorState.create({ doc, plugins: [widthPlugin, tabLayoutPlugin()] }), editable: () => false,
      nodeViews: { tab: createTabNodeView, image: readonlyImage, text_box: createReadonlyTextBoxView, table: readonlyTable } });
    measurement.dom.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    const sourceStyle = getComputedStyle(source.dom);
    for (const property of ['font-family', 'font-size', 'line-height', 'letter-spacing', 'word-spacing', 'font-feature-settings', 'font-kerning', 'direction']) {
      measurement.dom.style.setProperty(property, sourceStyle.getPropertyValue(property));
    }
    await owner.fonts.ready;
    await Promise.all(Array.from(measurement.dom.querySelectorAll('img')).map(image => image.decode().catch(() => {})));
    await flushTabLayout(measurement);
    if (source.state.doc !== doc || source.isDestroyed || !source.dom.isConnected) throw new Error('Document changed during column measurement');
    return measureNaturalColumnSections(measurement, sections);
  } finally { measurement?.destroy(); host.remove(); }
}
