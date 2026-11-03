"use client";
import { nativeKerningPlugin } from "@/lib/native-kerning";

import { useEffect, useRef, useState } from 'react';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { baseKeymap, chainCommands, setBlockType, toggleMark } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { liftListItem, splitListItem, wrapInList } from 'prosemirror-schema-list';
import { undo, redo } from 'prosemirror-history';
import { collectNoteIndex, convertNote, deleteNote, navigateNoteOwner, setNotePolicy, updateNoteBody, validateNoteBody, type NoteKind, type NoteModelShape, type NoteNumbering } from '@/lib/document-notes';
import { noteLabels } from '@/lib/note-labels';
import { FOOTNOTE_EDITING_ENABLED, noteKindEditingEnabled } from '@/lib/note-features';
import { insertTabCharacter, tabCharactersPlugin } from '@/lib/tab-node';
import { createTabNodeView, tabLayoutPlugin } from '@/lib/tab-layout';
import { documentSections } from '@/lib/document-sections';
import { useLocale } from './I18nProvider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export type NoteDialogMode = 'insert' | 'edit' | 'settings';
export type NoteDialogRequest = { mode: NoteDialogMode; noteId?: string; kind?: NoteKind };

/** The body view is a selection surface; the parent document owns all history. */
export default function NotesDialog({ view, request, onClose }: { view: EditorView; request: NoteDialogRequest; onClose: () => void }) {
  const { locale } = useLocale(), t = noteLabels(locale);
  const [initial] = useState(() => {
    const model = view.state.doc.attrs.documentModel as NoteModelShape;
    const sections = documentSections(view.state.doc);
    const section = sections.find((section, index) => view.state.selection.from >= section.from && (view.state.selection.from < section.to || index === sections.length - 1));
    const kind = request.noteId && model?.notes[request.noteId]?.kind || request.kind || 'endnote';
    return { documentId: model?.id, sectionId: section?.id || model?.finalSectionId, kind, policy: model?.notePolicy[kind] };
  });
  const [noteId, setNoteId] = useState(request.noteId || collectNoteIndex(view.state.doc).notes.find(entry => entry.kind === initial.kind)?.noteId || '');
  const [, setRevision] = useState(0);
  const [error, setError] = useState(''), [link, setLink] = useState('');
  const [scope, setScope] = useState<'document' | 'section'>('document');
  const [restart, setRestart] = useState(initial.policy?.restart || 'continuous');
  const [start, setStart] = useState(String(initial.policy?.start || 1));
  const [format, setFormat] = useState<NoteNumbering['format']>(initial.policy?.format || 'decimal');
  const [placement, setPlacement] = useState<'documentEnd' | 'sectionEnd'>(initial.policy?.placement === 'sectionEnd' ? 'sectionEnd' : 'documentEnd');
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const bodyView = useRef<EditorView | null>(null);
  const committing = useRef(false), composing = useRef(false), parentChanged = useRef(false);
  const closeRef = useRef(onClose), labelsRef = useRef(t);
  useEffect(() => { closeRef.current = onClose; labelsRef.current = t; }, [onClose, t]);
  const current = view.state.doc.attrs.documentModel as NoteModelShape;
  const kind = request.mode === 'settings' ? initial.kind : current?.notes[noteId]?.kind || initial.kind;
  const entries = collectNoteIndex(view.state.doc).notes.filter(entry => entry.kind === kind);
  const editable = view.editable && current?.id === initial.documentId && noteKindEditingEnabled(kind);
  const title = kind === 'footnote' ? t.footnoteTitle : t.title;
  const settingsTitle = kind === 'footnote' ? t.footnoteSettings : t.settings;
  const field = 'h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm';

  useEffect(() => {
    if (request.mode === 'settings' || !noteId || !host) return;
    const schema = view.state.schema, model = view.state.doc.attrs.documentModel as NoteModelShape, record = model?.notes[noteId];
    if (!record) return;
    let live = true, timer: ReturnType<typeof setTimeout> | undefined;
    const validParent = () => !view.isDestroyed && view.state.doc.attrs.documentModel?.id === initial.documentId && !!view.state.doc.attrs.documentModel?.notes[noteId];
    const commit = (state: EditorState) => {
      if (!validParent() || !view.editable) { setError(labelsRef.current.changed); return false; }
      if (!noteKindEditingEnabled(view.state.doc.attrs.documentModel.notes[noteId].kind)) { setError(labelsRef.current.footnoteUnavailable); return false; }
      try {
        const body = validateNoteBody(state.doc.toJSON(), schema);
        if (schema.nodeFromJSON(view.state.doc.attrs.documentModel.notes[noteId].body).eq(state.doc)) return true;
        committing.current = true;
        const accepted = updateNoteBody(noteId, body)(view.state, view.dispatch, view);
        if (!accepted) setError(labelsRef.current.failed);
        return accepted;
      } catch { setError(labelsRef.current.unsupported); return false; }
      finally { committing.current = false; }
    };
    const sync = () => {
      if (!validParent()) { closeRef.current(); return; }
      setRevision(revision => revision + 1);
      if (committing.current) return;
      if (composing.current || editor.composing) { parentChanged.current = true; return; }
      const body = schema.nodeFromJSON(view.state.doc.attrs.documentModel.notes[noteId].body);
      if (!body.eq(editor.state.doc)) {
        const pos = Math.min(editor.state.selection.from, body.content.size);
        editor.updateState(EditorState.create({ schema, doc: body, selection: TextSelection.near(body.resolve(pos)), plugins: editor.state.plugins }));
      } else editor.updateState(editor.state);
    };
    const parentHistory = (command: Command): Command => () => {
      if (composing.current || bodyView.current?.composing) { setError(labelsRef.current.composing); return true; }
      if (!validParent() || !view.editable || !noteKindEditingEnabled(view.state.doc.attrs.documentModel.notes[noteId].kind)) return true;
      command(view.state, view.dispatch, view); sync(); return true;
    };
    const keys = { ...baseKeymap,
      'Mod-z': parentHistory(undo), 'Mod-y': parentHistory(redo), 'Mod-Shift-z': parentHistory(redo),
      'Mod-b': toggleMark(schema.marks.strong), 'Mod-i': toggleMark(schema.marks.em), 'Mod-u': toggleMark(schema.marks.underline),
      Enter: chainCommands(splitListItem(schema.nodes.list_item), baseKeymap.Enter),
      Tab: insertTabCharacter,
    };
    const editor = new EditorView(host, {
      state: EditorState.create({ schema, doc: schema.nodeFromJSON(record.body), plugins: [nativeKerningPlugin(), keymap(keys), tabCharactersPlugin(), tabLayoutPlugin()] }),
      nodeViews: { tab: createTabNodeView },
      editable: () => view.editable && validParent() && noteKindEditingEnabled(view.state.doc.attrs.documentModel.notes[noteId].kind),
      attributes: { role: 'textbox', 'aria-label': labelsRef.current.body, 'aria-multiline': 'true', dir: locale === 'ar' ? 'rtl' : 'auto' },
      handlePaste(_editor, event) {
        const html = event.clipboardData?.getData('text/html');
        if (html && new DOMParser().parseFromString(html, 'text/html').querySelector('table,img,svg,math,video,audio,iframe,canvas,hr,[data-edtr-note-reference],[data-edtr-reference],[data-edtr-toc],[data-edtr-bookmark],[data-text-box]')) {
          setError(labelsRef.current.unsupported); return true;
        }
        return false;
      },
      handleDOMEvents: {
        compositionstart() { composing.current = true; return false; },
        compositionend() {
          composing.current = false;
          timer = setTimeout(() => {
            if (!live) return;
            if (parentChanged.current) { parentChanged.current = false; setError(labelsRef.current.changed); sync(); }
            else commit(editor.state);
          }, 30);
          return false;
        },
      },
      dispatchTransaction(tr) {
        try {
          const next = editor.state.apply(tr);
          if (tr.docChanged) {
            validateNoteBody(next.doc.toJSON(), schema);
            if (!composing.current && !editor.composing && !commit(next)) return;
          }
          editor.updateState(next);
          if (tr.docChanged) setError('');
        } catch { setError(labelsRef.current.unsupported); }
      },
    });
    bodyView.current = editor;
    view.dom.addEventListener('edtr-note-update', sync);
    return () => { live = false; if (timer) clearTimeout(timer); view.dom.removeEventListener('edtr-note-update', sync); bodyView.current = null; composing.current = false; parentChanged.current = false; editor.destroy(); };
  }, [view, request.mode, noteId, initial.documentId, locale, host]);

  useEffect(() => {
    if (request.mode !== 'settings') return;
    const sync = () => { if (view.isDestroyed || view.state.doc.attrs.documentModel?.id !== initial.documentId) closeRef.current(); else setRevision(value => value + 1); };
    view.dom.addEventListener('edtr-note-update', sync); return () => view.dom.removeEventListener('edtr-note-update', sync);
  }, [view, request.mode, initial.documentId]);

  function ready() { if (composing.current || bodyView.current?.composing) { setError(t.composing); return false; } return true; }
  function close() { if (ready()) onClose(); }
  function runBody(command: Command) { const editor = bodyView.current; if (!editor || !editable || !ready()) return; command(editor.state, editor.dispatch, editor); editor.focus(); }
  function runParent(command: Command, finish = false, mutation = true) {
    if (mutation && !editable) { setError(kind === 'footnote' ? t.footnoteUnavailable : t.failed); return; }
    if (!ready() || view.isDestroyed || view.state.doc.attrs.documentModel?.id !== initial.documentId) { setError(t.changed); return; }
    try { if (!command(view.state, view.dispatch, view)) { setError(t.failed); return; } if (finish) { onClose(); view.focus(); } }
    catch { setError(t.failed); }
  }
  function settings() {
    if (!editable || !ready()) return;
    const value = Number(start);
    if (!/^\d+$/.test(start) || !Number.isSafeInteger(value) || value < 1) { setError(t.failed); return; }
    const policy = { restart, start: value, format };
    const patch = kind === 'footnote' ? { footnote: scope === 'document' ? { ...policy, placement: 'pageBottom' as const } : policy } : { endnote: scope === 'document' ? { ...policy, placement } : policy };
    runParent(setNotePolicy(patch, scope, initial.sectionId), true);
  }
  function changeScope(next: 'document' | 'section') {
    setScope(next); const policy = next === 'document' ? current.notePolicy[kind] : { ...current.notePolicy[kind], ...current.sections[initial.sectionId]?.notePolicy?.[kind] };
    setRestart(policy.restart); setStart(String(policy.start)); setFormat(policy.format);
  }
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl" dir={locale === 'ar' ? 'rtl' : undefined} onCloseAutoFocus={event => { event.preventDefault(); if (!view.isDestroyed) view.focus(); }} onEscapeKeyDown={event => { if (!ready()) event.preventDefault(); }}>
      <div onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && ['s', 'o', 'p'].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation(); } }}>
        <DialogHeader><DialogTitle>{request.mode === 'settings' ? settingsTitle : title}</DialogTitle><DialogDescription>{kind === 'footnote' && !FOOTNOTE_EDITING_ENABLED ? t.footnoteUnavailable : t.description}</DialogDescription></DialogHeader>
        {request.mode === 'settings' ? <div className="my-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span>{t.scope}</span><select className={field} value={scope} disabled={!editable} onChange={event => changeScope(event.target.value as typeof scope)}><option value="document">{t.document}</option><option value="section">{t.section}</option></select></label>
          <label className="space-y-1 text-sm"><span>{t.restart}</span><select className={field} value={restart} disabled={!editable} onChange={event => setRestart(event.target.value as typeof restart)}><option value="continuous">{t.continuous}</option><option value="eachSection">{t.eachSection}</option></select></label>
          <label className="space-y-1 text-sm"><span>{t.start}</span><input className={field} type="number" min="1" max="2147483647" value={start} disabled={!editable} onChange={event => setStart(event.target.value)} /></label>
          <label className="space-y-1 text-sm"><span>{t.format}</span><select className={field} value={format} disabled={!editable} onChange={event => setFormat(event.target.value as typeof format)}>{(['decimal','lowerRoman','upperRoman','lowerLetter','upperLetter'] as const).map((value,index) => <option key={value} value={value}>{['1, 2, 3','i, ii, iii','I, II, III','a, b, c','A, B, C'][index]}</option>)}</select></label>
          {scope === 'document' && kind === 'endnote' && <label className="space-y-1 text-sm sm:col-span-2"><span>{t.placement}</span><select className={field} value={placement} disabled={!editable} onChange={event => setPlacement(event.target.value as typeof placement)}><option value="documentEnd">{t.documentEnd}</option><option value="sectionEnd">{t.sectionEnd}</option></select></label>}
        {kind === 'footnote' && <p className="text-sm text-muted-foreground sm:col-span-2">{t.footnotePlacement}: {t.pageBottom}</p>}
        </div> : <div className="my-5 space-y-3">
          {entries.length ? <label className="block space-y-1 text-sm"><span>{t.choose}</span><select className={field} value={noteId} onChange={event => { if (ready()) setNoteId(event.target.value); }}>{entries.map(entry => <option key={entry.noteId} value={entry.noteId}>{entry.label} — {view.state.schema.nodeFromJSON(entry.record.body).textContent.slice(0, 70)}</option>)}</select></label> : <p className="text-sm text-muted-foreground">{kind === 'footnote' ? t.footnoteEmpty : t.empty}</p>}
          {noteId && <>
            <div className="edtr-note-toolbar" role="toolbar" aria-label={t.body}>
              {([[t.bold, toggleMark(view.state.schema.marks.strong)], [t.italic, toggleMark(view.state.schema.marks.em)], [t.underline, toggleMark(view.state.schema.marks.underline)], [t.bullet, wrapInList(view.state.schema.nodes.bullet_list)], [t.ordered, wrapInList(view.state.schema.nodes.ordered_list)], [t.paragraph, chainCommands(liftListItem(view.state.schema.nodes.list_item), setBlockType(view.state.schema.nodes.paragraph))], [t.tab, insertTabCharacter]] as [string, Command][]).map(([label, command]) => <Button key={label} type="button" variant="outline" size="sm" disabled={!editable} onMouseDown={event => event.preventDefault()} onClick={() => runBody(command)}>{label}</Button>)}
              <Button type="button" variant="outline" size="sm" disabled={!editable} onMouseDown={event => event.preventDefault()} onClick={() => runParent(undo)}>{t.undo}</Button><Button type="button" variant="outline" size="sm" disabled={!editable} onMouseDown={event => event.preventDefault()} onClick={() => runParent(redo)}>{t.redo}</Button>
            </div>
            <div ref={setHost} className="edtr-note-editor" />
            <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 space-y-1 text-sm"><span>{t.linkAddress}</span><input className={field} type="url" value={link} disabled={!editable} onChange={event => setLink(event.target.value)} /></label><Button type="button" variant="outline" disabled={!editable || !/^(?:https?:|mailto:|tel:)/i.test(link)} onMouseDown={event => event.preventDefault()} onClick={() => runBody(toggleMark(view.state.schema.marks.link, { href: link }))}>{t.setLink}</Button></div>
          </>}
        </div>}
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        <DialogFooter className="flex-wrap gap-2">
          {request.mode !== 'settings' && noteId && <><Button type="button" variant="outline" onClick={() => runParent(navigateNoteOwner(noteId), true, false)}>{t.go}</Button><Button type="button" variant="destructive" disabled={!editable} onClick={() => runParent(deleteNote(noteId), true)}>{t.remove}</Button></>}
          {FOOTNOTE_EDITING_ENABLED && request.mode !== 'settings' && noteId && <Button type="button" variant="outline" disabled={!editable} onClick={() => runParent(convertNote(noteId, kind === 'footnote' ? 'endnote' : 'footnote'))}>{kind === 'footnote' ? t.convertEndnote : t.convertFootnote}</Button>}
          <Button type="button" variant="outline" onClick={close}>{request.mode === 'settings' ? t.cancel : t.done}</Button>
          {request.mode === 'settings' && <Button type="button" disabled={!editable} onClick={settings}>{t.apply}</Button>}
        </DialogFooter>
      </div>
    </DialogContent>
  </Dialog>;
}
