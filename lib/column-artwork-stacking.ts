/** Keep page artwork above table text/paint without changing persisted layer IDs. */
import type { EditorView } from 'prosemirror-view';
import { imageLayer, imagePosition, imageTextPlane } from './image-layout';

export function setColumnArtworkStacking(view: EditorView, active: boolean): void {
  view.state.doc.descendants((node, pos) => {
    if ((node.type.name !== 'image' && node.type.name !== 'text_box') || imagePosition(node.attrs.position) !== 'page' || imageTextPlane(node.attrs.textPlane) !== 'front') return;
    const wrapper = view.nodeDOM(pos); if (!(wrapper instanceof HTMLElement)) return;
    const frame = wrapper.querySelector<HTMLElement>('.pm-image-frame,.pm-textbox-frame');
    if (frame) frame.style.zIndex = String(imageLayer(node.attrs.layer) + (active ? 3 : 1));
  });
}
