// Word-like visual pagination: measures the rendered top-level blocks and
// inserts widget decorations (spacers) that push content past each A4 page
// boundary, drawing a gap band between the "pages". The document itself is
// untouched — spacers are decorations only, so save/export see the plain
// flow (print hides them via pageStyle and uses real CSS page breaks).
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";

export interface PageLayoutConfig {
  /** Full page height in CSS px (A4 portrait: 1123). */
  pageHeightPx: number;
  /** Page margin in CSS px (padding of .pm-page). */
  marginPx: number;
}

interface PageBreakPoint {
  /** Doc position of the top-level block pushed to the next page. */
  pos: number;
  /** Empty space left on the page being closed, in px. */
  fillPx: number;
}

interface PaginationState {
  breaks: PageBreakPoint[];
  marginPx: number;
  deco: DecorationSet;
}

/** Height of the gray band drawn between two pages. */
const PAGE_GAP_PX = 26;

export const paginationKey = new PluginKey<PaginationState>("pagination");

function spacerDom(fillPx: number, marginPx: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "pm-page-spacer";
  el.contentEditable = "false";
  // Rest of the closed page + its bottom margin (stays page-colored).
  const fill = document.createElement("div");
  fill.style.height = `${Math.max(0, fillPx) + marginPx}px`;
  // The gap between pages, bleeding over the page padding to full width.
  const gap = document.createElement("div");
  gap.className = "pm-page-spacer-gap";
  gap.style.height = `${PAGE_GAP_PX}px`;
  gap.style.marginLeft = "calc(-1 * var(--page-margin))";
  gap.style.marginRight = "calc(-1 * var(--page-margin))";
  // Top margin of the page being opened.
  const top = document.createElement("div");
  top.style.height = `${marginPx}px`;
  el.append(fill, gap, top);
  return el;
}

const positiveModulo = (value: number, mod: number) => ((value % mod) + mod) % mod;

/**
 * Simulate the natural (spacer-free) vertical flow of the top-level blocks
 * and decide before which blocks a page break belongs. Measures via
 * getBoundingClientRect scaled back to layout px, so CSS `zoom` on the page
 * doesn't skew the numbers. Also returns how much of the last page is used,
 * so the editor can be padded to a full page.
 */
function computeLayout(
  view: EditorView,
  cfg: PageLayoutConfig
): { breaks: PageBreakPoint[]; lastPagePadPx: number } {
  const dom = view.dom as HTMLElement;
  const pageContentH = cfg.pageHeightPx - 2 * cfg.marginPx;
  if (pageContentH <= 60 || !dom.offsetWidth) return { breaks: [], lastPagePadPx: 0 };
  const scale = dom.getBoundingClientRect().width / dom.offsetWidth;
  if (!scale || !isFinite(scale)) return { breaks: [], lastPagePadPx: 0 };

  const offsets: number[] = [];
  view.state.doc.forEach((_node, offset) => offsets.push(offset));

  const breaks: PageBreakPoint[] = [];
  let spacerAccum = 0; // decoration heights seen so far, excluded from the flow
  let baseTop: number | null = null;
  let pageStart = 0; // natural y where the current page's content begins
  let contentBottom = 0;
  let forceBreakBeforeNext = false;
  let blockIdx = 0;

  for (const child of Array.from(dom.children) as HTMLElement[]) {
    const rect = child.getBoundingClientRect();
    if (child.classList.contains("pm-page-spacer")) {
      spacerAccum += rect.height / scale;
      continue;
    }
    if (blockIdx >= offsets.length) break;
    if (baseTop === null) baseTop = rect.top / scale - spacerAccum;
    const top = rect.top / scale - spacerAccum - baseTop;
    const bottom = top + rect.height / scale;
    contentBottom = Math.max(contentBottom, bottom);

    const overflows = bottom - pageStart > pageContentH && top > pageStart;
    if (forceBreakBeforeNext || overflows) {
      const fillPx = positiveModulo(pageContentH - (top - pageStart), pageContentH);
      breaks.push({ pos: offsets[blockIdx], fillPx });
      pageStart = top;
      forceBreakBeforeNext = false;
    }
    // A manual page break closes the page for whatever follows it.
    if (child.matches("hr.pm-page-break")) forceBreakBeforeNext = true;
    blockIdx++;
  }

  const usedOnLastPage = positiveModulo(contentBottom - pageStart, pageContentH);
  const lastPagePadPx = usedOnLastPage > 0 ? pageContentH - usedOnLastPage : 0;
  return { breaks, lastPagePadPx };
}

function sameBreaks(a: PageBreakPoint[], b: PageBreakPoint[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].pos !== b[i].pos || Math.round(a[i].fillPx) !== Math.round(b[i].fillPx)) return false;
  }
  return true;
}

export function paginationPlugin(getConfig: () => PageLayoutConfig): Plugin {
  let scheduled = false;

  const measure = (view: EditorView) => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      // View destroyed between the schedule and the frame.
      if (!view.dom.isConnected) return;
      const cfg = getConfig();
      const { breaks, lastPagePadPx } = computeLayout(view, cfg);
      (view.dom as HTMLElement).style.paddingBottom =
        lastPagePadPx > 1 ? `${lastPagePadPx}px` : "";
      const cur = paginationKey.getState(view.state);
      if (cur && sameBreaks(cur.breaks, breaks) && cur.marginPx === cfg.marginPx) return;
      view.dispatch(view.state.tr.setMeta(paginationKey, { breaks, marginPx: cfg.marginPx }));
    });
  };

  return new Plugin<PaginationState>({
    key: paginationKey,
    state: {
      init: () => ({ breaks: [], marginPx: 0, deco: DecorationSet.empty }),
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(paginationKey) as
          | { breaks: PageBreakPoint[]; marginPx: number }
          | undefined;
        if (meta) {
          const deco = DecorationSet.create(
            newState.doc,
            meta.breaks.map((b) =>
              Decoration.widget(b.pos, () => spacerDom(b.fillPx, meta.marginPx), {
                side: -1,
                key: `pgbrk:${b.pos}:${Math.round(b.fillPx)}:${meta.marginPx}`,
              })
            )
          );
          return { breaks: meta.breaks, marginPx: meta.marginPx, deco };
        }
        if (tr.docChanged) {
          // Keep spacers roughly in place until the post-update remeasure lands.
          return {
            ...prev,
            deco: prev.deco.map(tr.mapping, tr.doc),
            breaks: prev.breaks.map((b) => ({ ...b, pos: tr.mapping.map(b.pos) })),
          };
        }
        return prev;
      },
    },
    props: {
      decorations(state) {
        return paginationKey.getState(state)?.deco;
      },
    },
    view(view) {
      measure(view);
      // Catches async height changes (image loads, fonts) and layout-affecting
      // config changes (orientation/margins change the editor's width).
      const observer = new ResizeObserver(() => measure(view));
      observer.observe(view.dom);
      return {
        update(v) {
          measure(v);
        },
        destroy() {
          observer.disconnect();
        },
      };
    },
  });
}
