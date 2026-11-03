"use client";

import { useState } from 'react';
import { NodeSelection, type Command } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { collectReferenceIndex, createBookmark, insertCaption, insertCrossReference, editCrossReference, insertTableOfContents, updateTableOfContents, navigateReferenceTarget, type ReferenceDisplay } from '@/lib/document-references';
import { referenceLabels } from '@/lib/reference-i18n';
import { useLocale } from './I18nProvider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export type ReferenceDialogMode = 'bookmark' | 'caption' | 'reference' | 'toc';

export default function ReferencesDialog({ view, mode, onClose }: { view: EditorView; mode: ReferenceDialogMode; onClose: () => void }) {
  const { locale } = useLocale(), t = referenceLabels(locale);
  const [initial] = useState(() => {
    const index = collectReferenceIndex(view.state.doc), sel = view.state.selection;
    const field = sel instanceof NodeSelection && sel.node.type.name === 'reference_field'
      ? index.fields.find(field => field.pos === sel.from) : undefined;
    const paragraph = sel.$from.parent, owner = paragraph.attrs.toc?.fieldId || paragraph.attrs.tocOwnerId;
    const toc = index.tocs.find(toc => toc.fieldId === owner);
    return { index, field, toc, documentId: view.state.doc.attrs.documentModel?.id };
  });
  const targets = initial.index.targets.filter(target => initial.index.byId.get(target.id)?.length === 1);
  const [targetId, setTargetId] = useState<string>(initial.field?.node.attrs.targetId || targets[0]?.id || '');
  const [display, setDisplay] = useState<ReferenceDisplay>(initial.field?.node.attrs.display || 'text');
  const [name, setName] = useState('');
  const [captionLabel, setCaptionLabel] = useState(t.figure);
  const [captionText, setCaptionText] = useState('');
  const [title, setTitle] = useState(t.toc);
  const [levels, setLevels] = useState<number[]>(initial.toc?.levels || [1, 2, 3]);
  const [error, setError] = useState('');
  const fieldClass = 'h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm';
  const editing = mode === 'reference' ? !!initial.field : mode === 'toc' && !!initial.toc;

  function run(command: Command) {
    if (view.isDestroyed || !view.editable || view.state.doc.attrs.documentModel?.id !== initial.documentId) { setError(t.changed); return; }
    try {
      if (!command(view.state, view.dispatch, view)) { setError(t.failed); return; }
      onClose(); view.focus();
    } catch { setError(t.failed); }
  }
  function submit() {
    if (mode === 'bookmark') return run(createBookmark(name));
    if (mode === 'caption') return run(insertCaption(captionLabel, captionText));
    if (mode === 'reference') {
      if (initial.field) {
        const current = collectReferenceIndex(view.state.doc).fields.find(field => field.node.attrs.fieldId === initial.field!.node.attrs.fieldId);
        if (!current) { setError(t.changed); return; }
        return run(editCrossReference(current.pos, { targetId, display }));
      }
      return run(insertCrossReference(targetId, display));
    }
    if (!levels.length) { setError(t.selectLevel); return; }
    if (initial.toc) {
      const current = collectReferenceIndex(view.state.doc).tocs.find(toc => toc.fieldId === initial.toc!.fieldId);
      if (!current) { setError(t.changed); return; }
      return run(updateTableOfContents(current.pos, levels));
    }
    run(insertTableOfContents(levels, title));
  }
  const hint = mode === 'bookmark' ? t.bookmarkHint : mode === 'caption' ? t.captionHint : mode === 'reference' ? t.referenceHint : t.tocHint;
  const currentStatus = initial.field?.node.attrs.status;
  const statusText = currentStatus === 'missing-target' ? t.missing : currentStatus === 'ambiguous' ? t.ambiguous : currentStatus === 'unsupported' ? t.unsupported : '';

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={event => { event.preventDefault(); if (!view.isDestroyed) view.focus(); }}>
      <form onSubmit={event => { event.preventDefault(); submit(); }} onKeyDown={event => {
        if ((event.metaKey || event.ctrlKey) && ['s', 'o', 'p'].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation(); }
      }}>
        <DialogHeader><DialogTitle>{t[mode]}</DialogTitle><DialogDescription>{hint}</DialogDescription></DialogHeader>
        <fieldset className="my-5 space-y-4" disabled={!view.editable}>
          {mode === 'bookmark' && <label className="block space-y-1 text-sm"><span>{t.name}</span><input className={fieldClass} required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>}
          {mode === 'caption' && <>
            <label className="block space-y-1 text-sm"><span>{t.label}</span><input className={fieldClass} list="reference-caption-labels" required maxLength={80} value={captionLabel} onChange={event => setCaptionLabel(event.target.value)} /><datalist id="reference-caption-labels"><option value={t.figure} /><option value={t.table} /></datalist></label>
            <label className="block space-y-1 text-sm"><span>{t.text}</span><input className={fieldClass} value={captionText} onChange={event => setCaptionText(event.target.value)} /></label>
          </>}
          {mode === 'reference' && <>
            {statusText && <p role="status" className="text-sm text-destructive">{statusText}</p>}
            {!targets.length ? <p className="text-sm text-muted-foreground">{t.empty}</p> : <>
              <label className="block space-y-1 text-sm"><span>{t.target}</span><select aria-label={t.target} className={fieldClass} value={targetId} onChange={event => {
                const nextTarget = event.target.value;
                setTargetId(nextTarget);
                if (display === 'number' && !targets.find(target => target.id === nextTarget)?.number) setDisplay('text');
              }}>
                {!targets.some(target => target.id === targetId) && <option value={targetId} disabled>{t.missing}</option>}
                {targets.map(target => <option key={target.id} value={target.id}>{target.kind === 'heading' ? t.heading : t[target.kind]} — {target.name || target.text || target.number}</option>)}
              </select></label>
              <label className="block space-y-1 text-sm"><span>{t.display}</span><select aria-label={t.display} className={fieldClass} value={display} onChange={event => setDisplay(event.target.value as ReferenceDisplay)}><option value="text">{t.targetText}</option><option value="number" disabled={!targets.find(target => target.id === targetId)?.number}>{t.number}</option><option value="page">{t.page}</option></select></label>
              <Button type="button" variant="outline" onClick={() => run(navigateReferenceTarget(targetId))}>{t.go}</Button>
            </>}
          </>}
          {mode === 'toc' && <>
            {!editing && <label className="block space-y-1 text-sm"><span>{t.title}</span><input className={fieldClass} value={title} onChange={event => setTitle(event.target.value)} /></label>}
            <fieldset><legend className="mb-2 text-sm">{t.levels}</legend><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[1, 2, 3, 4, 5, 6].map(level => <label key={level} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={levels.includes(level)} onChange={event => setLevels(previous => event.target.checked ? [...previous, level].sort() : previous.filter(value => value !== level))} />{t.heading} {level}</label>)}</div></fieldset>
          </>}
        </fieldset>
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>{t.cancel}</Button><Button type="submit" disabled={!view.editable || (mode === 'reference' && !targets.some(target => target.id === targetId))}>{editing ? t.apply : t.insert}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
