"use client";

/*
 * Landing-page hero: the real Toolbar wired to a real, typeable ProseMirror
 * page. Everything here stays inside the lazy ToolbarPreview chunk — it must
 * NOT import from Editor.tsx, which would drag the full editor module graph
 * (react-to-print, dialogs, actions, …) into the landing bundle.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { EditorState, Plugin, type Transaction } from "prosemirror-state";
import { EditorView, Decoration, DecorationSet } from "prosemirror-view";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import Toolbar from "./Toolbar";
import { mySchema } from "./editor-schema";
import { useT } from "./I18nProvider";

/* Faint placeholder on the empty doc's first paragraph; any input replaces the
   empty textblock, so the decoration (and the hint) disappears on typing. */
function placeholderPlugin(text: string) {
  return new Plugin({
    props: {
      decorations(state) {
        const { doc } = state;
        const first = doc.firstChild;
        if (doc.childCount === 1 && first && first.isTextblock && first.content.size === 0) {
          return DecorationSet.create(doc, [
            Decoration.node(0, first.nodeSize, {
              class: "hero-editor-empty",
              "data-placeholder": text,
            }),
          ]);
        }
        return null;
      },
    },
  });
}

/* The hero page borrows the editor's own .pm-page styling; the CSS variables
   shrink the A4 sheet down to a hero-sized card. */
const PAGE_VARS = {
  "--page-w": "100%",
  "--page-h": "280px",
  "--page-margin": "36px",
} as CSSProperties;

export default function ToolbarPreview() {
  const t = useT();
  const placeholder = t.landing.heroEditorPlaceholder;
  const viewRef = useRef<EditorView | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const state = EditorState.create({
      schema: mySchema,
      plugins: [
        history(),
        keymap({
          "Mod-z": undo,
          "Mod-y": redo,
          "Mod-Shift-z": redo,
          "Mod-b": toggleMark(mySchema.marks.strong),
          "Mod-i": toggleMark(mySchema.marks.em),
          "Mod-u": toggleMark(mySchema.marks.underline),
        }),
        keymap(baseKeymap),
        placeholderPlugin(placeholder),
      ],
    });
    const view: EditorView = new EditorView(mount, {
      state,
      dispatchTransaction(tr: Transaction) {
        view.updateState(view.state.apply(tr));
        // The toolbar tracks active marks/blocks through `tick`.
        setTick((n) => n + 1);
      },
    });
    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [placeholder]);

  const insertTable = (rows: number, cols: number) => {
    const v = viewRef.current;
    if (!v) return;
    const { table, table_row, table_cell } = mySchema.nodes;
    const makeRow = () =>
      table_row.create(null, Array.from({ length: cols }, () => table_cell.createAndFill()!));
    const node = table.create(null, Array.from({ length: rows }, makeRow));
    v.dispatch(v.state.tr.replaceSelectionWith(node).scrollIntoView());
    v.focus();
  };

  const insertPageBreak = () => {
    const v = viewRef.current;
    if (!v) return;
    v.dispatch(v.state.tr.replaceSelectionWith(mySchema.nodes.page_break.create()).scrollIntoView());
    v.focus();
  };

  return (
    <div>
      <Toolbar
        viewRef={viewRef}
        schema={mySchema}
        onInsertTable={insertTable}
        onPageBreakAdd={insertPageBreak}
        onLinkAdd={() => {}}
        onImageAdd={() => {}}
        tick={tick}
      />
      <div className="flex justify-center bg-gray-100 px-6 py-8">
        <div
          ref={mountRef}
          className="pm-page w-full max-w-lg cursor-text text-left"
          style={PAGE_VARS}
          onClick={() => viewRef.current?.focus()}
        />
      </div>
    </div>
  );
}
