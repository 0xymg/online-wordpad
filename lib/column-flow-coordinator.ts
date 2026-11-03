/** Bounded, stale-safe coordination for the measured column renderer. */
import type { EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { setColumnFlowPreview, setColumnFlowSnapshot, type FlowLayout } from './column-flow';

export type ColumnFlowAdapter = {
  /** Measure settled natural lines and tabs without mutating the source document. */
  measure(view: EditorView, document: PMNode): Promise<FlowLayout>;
  /** Apply transient view-only decorations for this exact document. */
  apply(view: EditorView, document: PMNode, layout: FlowLayout, assertSafe: () => void): Promise<void>;
};
export type ColumnFlowCoordinator = { invalidate(): void; flush(): Promise<void>; destroy(): void };
const instances = new WeakMap<EditorView, ColumnFlowCoordinator>();
export async function flushColumnFlow(view: EditorView): Promise<boolean> {
  const coordinator = instances.get(view); if (!coordinator) return false;
  await coordinator.flush(); return true;
}
/** At most maxPasses measure/apply cycles; repeated unequal signatures are a hard error. */
export function createColumnFlowCoordinator(view: EditorView, adapter: ColumnFlowAdapter, maxPasses = 8): ColumnFlowCoordinator {
  let destroyed = false, generation = 0, scheduled = 0, pending: Promise<void> | null = null, runningGeneration = 0;
  const compositionWaiters = new Set<() => void>();
  const win = view.dom.ownerDocument.defaultView;
  const clearSnapshot = () => { if (instances.get(view) === coordinator) { setColumnFlowPreview(view, view.state.doc, null); setColumnFlowSnapshot(view, view.state.doc, null); } };
  const current = (doc: PMNode, version: number) => instances.get(view) === coordinator && !destroyed && !view.isDestroyed && !view.composing && view.dom.isConnected && view.state.doc === doc && generation === version;
  const assertCurrent = (doc: PMNode, version: number) => { if (!current(doc, version)) throw new Error('Column layout was invalidated during measurement'); };
  const waitForComposition = () => new Promise<void>((resolve, reject) => {
    if (!view.composing) { resolve(); return; }
    const done = () => { view.dom.removeEventListener('compositionend', done); compositionWaiters.delete(done); if (destroyed) reject(new Error('Column layout view was destroyed')); else resolve(); };
    compositionWaiters.add(done);
    view.dom.addEventListener('compositionend', done, { once: true });
  });
  const run = async () => {
    await waitForComposition();
    const doc = view.state.doc, version = generation;
    await view.dom.ownerDocument.fonts?.ready; assertCurrent(doc, version);
    let previous = '', applied = false;
    const seen = new Set<string>();
    for (let pass = 0; pass < maxPasses; pass++) {
      const layout = await adapter.measure(view, doc); assertCurrent(doc, version);
      if (!layout.complete) { clearSnapshot(); throw new Error(`Column layout incomplete: ${layout.diagnostics.map(item => item.code).join(', ')}`); }
      const signature = JSON.stringify([layout.pages, layout.regions, layout.fragments]);
      if (applied && signature === previous) {
        if (!setColumnFlowSnapshot(view, doc, layout)) throw new Error('Column layout document changed before publication');
        setColumnFlowPreview(view, doc, null);
        return;
      }
      if (seen.has(signature)) { clearSnapshot(); throw new Error('Column layout oscillated before convergence'); }
      seen.add(signature); previous = signature;
      if (!setColumnFlowPreview(view, doc, layout)) throw new Error('Column layout document changed before application');
      await adapter.apply(view, doc, layout, () => assertCurrent(doc, version)); assertCurrent(doc, version); applied = true;
    }
    clearSnapshot(); throw new Error('Column layout did not converge within its pass limit');
  };
  const coordinator: ColumnFlowCoordinator = {
    invalidate() {
      if (destroyed) return;
      generation++; clearSnapshot();
      if (scheduled && win) win.cancelAnimationFrame(scheduled);
      if (win) scheduled = win.requestAnimationFrame(() => { scheduled = 0; void coordinator.flush().catch(() => {}); });
    },
    flush() {
      if (destroyed) return Promise.reject(new Error('Column layout view was destroyed'));
      if (scheduled && win) { win.cancelAnimationFrame(scheduled); scheduled = 0; }
      if (!pending) { runningGeneration = generation; pending = run().catch(error => { clearSnapshot(); throw error; }).finally(() => { pending = null; }); }
      const version = runningGeneration;
      return pending.catch(error => {
        if (!destroyed && version !== generation) return coordinator.flush();
        throw error;
      });
    },
    destroy() {
      destroyed = true; generation++; clearSnapshot();
      view.dom.removeEventListener('compositionstart', onCompositionStart);
      view.dom.removeEventListener('compositionend', onCompositionEnd);
      for (const done of compositionWaiters) done();
      if (scheduled && win) win.cancelAnimationFrame(scheduled);
      if (instances.get(view) === coordinator) instances.delete(view);
    },
  };
  const onCompositionStart = () => coordinator.invalidate();
  const onCompositionEnd = () => coordinator.invalidate();
  view.dom.addEventListener('compositionstart', onCompositionStart);
  view.dom.addEventListener('compositionend', onCompositionEnd);
  instances.set(view, coordinator);
  return coordinator;
}
