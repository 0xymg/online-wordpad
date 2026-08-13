"use client";

/*
 * Landing-page hero: the real Toolbar wired to a real, typeable ProseMirror
 * page, plus a SELF-CONTAINED mini slash menu. Everything here stays inside the
 * lazy ToolbarPreview chunk — it must NOT import from Editor.tsx, which would
 * drag the full editor module graph (react-to-print, dialogs, actions, …) into
 * the landing bundle. The mini slash menu below is a compact reimplementation
 * of the editor's real slash menu, so the hero can promise "press /" and mean
 * it without re-coupling to the 229 KB editor chunk.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { EditorState, Plugin, type Transaction } from "prosemirror-state";
import { EditorView, Decoration, DecorationSet } from "prosemirror-view";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, toggleMark, setBlockType, wrapIn } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import Toolbar from "./Toolbar";
import { mySchema } from "./editor-schema";
import { useT } from "./I18nProvider";

/* ── Placeholder ──────────────────────────────────────────────────────────
   A widget decoration on the empty doc's first paragraph. On a fine pointer it
   teaches the slash key by rendering a real <kbd> chip; on coarse pointers the
   slash promise is dropped (mobile keyboards make "/" awkward). Any input
   removes the empty textblock, so the decoration disappears on the first key. */
type PlaceholderHint = { pre: string; post: string; mobile: string };

function placeholderPlugin(hint: PlaceholderHint) {
  return new Plugin({
    props: {
      decorations(state) {
        const { doc } = state;
        const first = doc.firstChild;
        if (doc.childCount === 1 && first && first.isTextblock && first.content.size === 0) {
          const widget = Decoration.widget(
            1,
            () => {
              const coarse =
                typeof window !== "undefined" &&
                typeof window.matchMedia === "function" &&
                window.matchMedia("(pointer: coarse)").matches;
              const span = document.createElement("span");
              span.className = "hero-editor-placeholder";
              span.setAttribute("contenteditable", "false");
              if (coarse) {
                span.textContent = hint.mobile;
              } else {
                span.appendChild(document.createTextNode(hint.pre));
                const kbd = document.createElement("kbd");
                kbd.className = "hero-kbd";
                kbd.textContent = "/";
                span.appendChild(kbd);
                span.appendChild(document.createTextNode(hint.post));
              }
              return span;
            },
            { side: 1, ignoreSelection: true, key: "hero-placeholder" }
          );
          return DecorationSet.create(doc, [widget]);
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

/* A tiny inline SVG so the "Image" command has something to insert without a
   file picker or an upload — it stays in the lazy chunk as a data URI. */
const SAMPLE_IMAGE =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#93c5fd"/><stop offset="1" stop-color="#c7d2fe"/></linearGradient></defs>` +
      `<rect width="320" height="180" fill="url(#g)"/>` +
      `<circle cx="232" cy="52" r="22" fill="#fef08a"/>` +
      `<path d="M0 180 L96 92 L156 148 L214 104 L320 180 Z" fill="#60a5fa" opacity="0.85"/>` +
      `<path d="M0 180 L128 120 L210 156 L320 118 L320 180 Z" fill="#3b82f6" opacity="0.8"/>` +
    `</svg>`
  );

/* ── Mini slash commands ──────────────────────────────────────────────────
   Loosely mirrors the real editor's SLASH_COMMANDS. `id` values match the
   custom-event contract the demo-strip chips use (see LandingClient). */
type MiniCmdId =
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "numbered"
  | "table"
  | "divider"
  | "page_break"
  | "image";

const MINI_COMMANDS: Array<{ id: MiniCmdId; title: string; hint: string; keywords: string[] }> = [
  { id: "h1", title: "Heading 1", hint: "Large section heading", keywords: ["h1", "heading", "title"] },
  { id: "h2", title: "Heading 2", hint: "Medium section heading", keywords: ["h2", "heading", "subtitle"] },
  { id: "h3", title: "Heading 3", hint: "Small section heading", keywords: ["h3", "heading"] },
  { id: "table", title: "Table", hint: "Insert 3 × 3 table", keywords: ["table", "grid"] },
  { id: "bullet", title: "Bulleted list", hint: "Start a bulleted list", keywords: ["list", "bullet", "ul"] },
  { id: "numbered", title: "Numbered list", hint: "Start a numbered list", keywords: ["list", "numbered", "ol"] },
  { id: "image", title: "Image", hint: "Insert a sample image", keywords: ["image", "picture", "photo"] },
  { id: "divider", title: "Divider", hint: "Insert a horizontal divider", keywords: ["divider", "line", "hr", "separator"] },
  { id: "page_break", title: "Page break", hint: "Insert a printable page break", keywords: ["page", "break", "new page"] },
];

/* Run a command on the current selection. Shared by the slash menu and the
   demo-strip chips, so both paths insert exactly the same thing. */
function applyCommand(view: EditorView, id: MiniCmdId) {
  const { state } = view;
  const { schema } = state;
  const dispatch = view.dispatch.bind(view);
  switch (id) {
    case "h1":
      setBlockType(schema.nodes.heading, { level: 1 })(state, dispatch);
      break;
    case "h2":
      setBlockType(schema.nodes.heading, { level: 2 })(state, dispatch);
      break;
    case "h3":
      setBlockType(schema.nodes.heading, { level: 3 })(state, dispatch);
      break;
    case "bullet":
      wrapInList(schema.nodes.bullet_list)(state, dispatch);
      break;
    case "numbered":
      wrapInList(schema.nodes.ordered_list)(state, dispatch);
      break;
    case "table": {
      const { table, table_row, table_cell } = schema.nodes;
      const makeRow = () =>
        table_row.create(null, Array.from({ length: 3 }, () => table_cell.createAndFill()!));
      const node = table.create(null, Array.from({ length: 3 }, makeRow));
      dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
      break;
    }
    case "divider": {
      const hr = schema.nodes.horizontal_rule.create();
      const paragraph = schema.nodes.paragraph.create();
      const pos = state.selection.from;
      dispatch(state.tr.insert(pos, [hr, paragraph]).scrollIntoView());
      break;
    }
    case "page_break":
      dispatch(state.tr.replaceSelectionWith(schema.nodes.page_break.create()).scrollIntoView());
      break;
    case "image": {
      const img = schema.nodes.image.create({ src: SAMPLE_IMAGE, alt: "Sample image", width: "240px" });
      dispatch(state.tr.replaceSelectionWith(img).scrollIntoView());
      break;
    }
  }
  view.focus();
}

function filterCommands(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return MINI_COMMANDS;
  return MINI_COMMANDS.filter(
    (c) => c.title.toLowerCase().includes(q) || c.keywords.some((k) => k.includes(q))
  );
}

type SlashState = { from: number; query: string; left: number; top: number; selected: number };

const SLASH_OFFSET = 6;

export default function ToolbarPreview() {
  const t = useT();
  const viewRef = useRef<EditorView | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [tick, setTick] = useState(0);
  const [slash, setSlash] = useState<SlashState | null>(null);

  // Refs so the view's (mount-time) key handler always sees current state.
  const slashRef = useRef<SlashState | null>(null);
  const itemsRef = useRef(MINI_COMMANDS);
  slashRef.current = slash;
  itemsRef.current = slash ? filterCommands(slash.query) : MINI_COMMANDS;

  const hint: PlaceholderHint = {
    pre: t.landing.heroEditorHintPre,
    post: t.landing.heroEditorHintPost,
    mobile: t.landing.heroEditorHintMobile,
  };
  // Stable string so the effect only re-runs when the copy actually changes.
  const hintKey = `${hint.pre}|${hint.post}|${hint.mobile}`;

  const coordsFor = (view: EditorView, pos: number) => {
    const c = view.coordsAtPos(pos);
    return { left: c.left, top: c.bottom + SLASH_OFFSET };
  };

  const openSlash = (view: EditorView, from: number) => {
    const { left, top } = coordsFor(view, view.state.selection.from);
    setSlash({ from, query: "", left, top, selected: 0 });
  };

  // Re-derive the query from the doc text after every transaction; close when
  // the "/" is gone or the selection moved before it.
  const refreshSlash = (view: EditorView) => {
    const prev = slashRef.current;
    if (!prev) return;
    const sel = view.state.selection;
    if (!sel.empty || sel.from < prev.from) {
      setSlash(null);
      return;
    }
    const text = view.state.doc.textBetween(prev.from, sel.from, "", "");
    if (!text.startsWith("/")) {
      setSlash(null);
      return;
    }
    const query = text.slice(1);
    const { left, top } = coordsFor(view, sel.from);
    setSlash((p) => (p ? { ...p, query, left, top, selected: 0 } : p));
  };

  const runSlash = (id: MiniCmdId) => {
    const view = viewRef.current;
    const active = slashRef.current;
    if (!view || !active) return;
    const selTo = view.state.selection.from;
    if (selTo < active.from) {
      setSlash(null);
      return;
    }
    // Remove the typed "/xxx" filter text, then insert like the real menu does.
    view.dispatch(view.state.tr.delete(active.from, selTo));
    setSlash(null);
    applyCommand(view, id);
  };
  // Keep a ref so the mount-time key handler can call the latest runSlash.
  const runSlashRef = useRef(runSlash);
  runSlashRef.current = runSlash;

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
        placeholderPlugin(hint),
      ],
    });
    const view: EditorView = new EditorView(mount, {
      state,
      handleTextInput(v, from, _to, text) {
        if (text !== "/") return false;
        if (v.state.doc.resolve(from).parent.type === mySchema.nodes.code_block) return false;
        // Open after the "/" is inserted so coords land on the caret.
        setTimeout(() => {
          if (viewRef.current) openSlash(viewRef.current, from);
        }, 0);
        return false;
      },
      handleKeyDown(_v, event) {
        const active = slashRef.current;
        if (!active) return false;
        const items = itemsRef.current;
        if (event.key === "Escape") {
          event.preventDefault();
          setSlash(null);
          return true;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (items.length) setSlash((p) => (p ? { ...p, selected: (p.selected + 1) % items.length } : p));
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (items.length)
            setSlash((p) => (p ? { ...p, selected: (p.selected - 1 + items.length) % items.length } : p));
          return true;
        }
        if (event.key === "Enter") {
          if (!items.length) return false;
          event.preventDefault();
          const picked = items[Math.max(0, Math.min(active.selected, items.length - 1))];
          if (picked) runSlashRef.current(picked.id);
          return true;
        }
        return false;
      },
      dispatchTransaction(tr: Transaction) {
        const next = view.state.apply(tr);
        view.updateState(next);
        setTick((n) => n + 1);
        refreshSlash(view);
      },
    });
    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
      setSlash(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintKey]);

  // Demo-strip chips (in LandingClient) reach the editor through a window event,
  // so the landing keeps zero import coupling to this lazy chunk.
  useEffect(() => {
    const onHero = (e: Event) => {
      const view = viewRef.current;
      if (!view) return;
      const detail = (e as CustomEvent).detail as { command?: string } | undefined;
      const command = detail?.command;
      view.focus();
      if (!command || command === "focus") return;
      applyCommand(view, command as MiniCmdId);
    };
    window.addEventListener("edtr-hero", onHero as EventListener);
    return () => window.removeEventListener("edtr-hero", onHero as EventListener);
  }, []);

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

  const items = slash ? filterCommands(slash.query) : [];

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

      {/* Mini slash menu — compact take on the real editor's popover. */}
      {slash && (
        <div
          role="listbox"
          aria-label="Slash commands"
          className="fixed z-[60] w-[248px] overflow-hidden border border-gray-200 bg-white text-gray-900 shadow-xl"
          style={{ left: slash.left, top: slash.top, colorScheme: "light" }}
        >
          {items.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">No command found</div>
          ) : (
            <div className="max-h-[220px] overflow-y-auto p-1">
              {items.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={idx === slash.selected}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setSlash((p) => (p ? { ...p, selected: idx } : p))}
                  onClick={() => runSlashRef.current(item.id)}
                  className={`block w-full px-2.5 py-1.5 text-left ${
                    idx === slash.selected ? "bg-gray-100" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="text-[13px] font-medium leading-tight">{item.title}</div>
                  <div className="text-[11px] leading-tight text-gray-400">{item.hint}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
