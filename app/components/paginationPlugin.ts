// Word-like visual pagination: measures the rendered top-level blocks and
// inserts widget decorations (spacers) that push content past each A4 page
// boundary, drawing a gap band between the "pages". The document itself is
// untouched — spacers are decorations only, so save/export see the plain
// flow (print hides them via pageStyle and uses real CSS page breaks).
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";

/** Where the page number sits, or "off" for none. */
export type PageNumberPosition = "off" | "bottom" | "top";
/** "3" versus "3 / 7". */
export type PageNumberFormat = "plain" | "of";

export interface PageLayoutConfig {
  /** Full page height in CSS px (A4 portrait: 1123). */
  pageHeightPx: number;
  /** Page margin in CSS px (padding of .pm-page). */
  marginPx: number;
  pageNumbers: PageNumberPosition;
  pageNumberFormat: PageNumberFormat;
}

function numberLabel(page: number, total: number, format: PageNumberFormat): string {
  return format === "of" ? `${page} / ${total}` : String(page);
}

/** A centred number filling one page-margin band. */
function numberDom(text: string, heightPx: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "pm-page-number";
  el.textContent = text;
  el.style.height = `${heightPx}px`;
  return el;
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
  /** "<position>:<format>" — the numbering settings the decorations were built from. */
  numbering: string;
  deco: DecorationSet;
}

/** Total pages implied by a set of break points. */
export const pageCountOf = (breaks: PageBreakPoint[]) => breaks.length + 1;

/** Height of the gray band drawn between two pages. */
const PAGE_GAP_PX = 26;

export const paginationKey = new PluginKey<PaginationState>("pagination");

function spacerDom(
  fillPx: number, marginPx: number,
  numbers: { position: PageNumberPosition; closing: string; opening: string }
): HTMLElement {
  const el = document.createElement("div");
  el.className = "pm-page-spacer";
  el.contentEditable = "false";
  // Rest of the closed page (stays page-colored).
  const fill = document.createElement("div");
  fill.style.height = `${Math.max(0, fillPx)}px`;
  // …and its bottom margin, kept as its own band so a page number can sit in it.
  const bottomMargin = numbers.position === "bottom"
    ? numberDom(numbers.closing, marginPx)
    : (() => { const d = document.createElement("div"); d.style.height = `${marginPx}px`; return d; })();
  // The gap between pages. It bleeds past the page's own edges so the single
  // box-shadow around .pm-page doesn't run through the gap; the inner element
  // redraws that shadow as a bottom edge for the closing page and a top edge
  // for the opening one.
  const gap = document.createElement("div");
  gap.className = "pm-page-spacer-gap";
  gap.style.height = `${PAGE_GAP_PX}px`;
  gap.style.marginLeft = "calc(-1 * (var(--page-margin) + var(--page-bleed)))";
  gap.style.marginRight = "calc(-1 * (var(--page-margin) + var(--page-bleed)))";
  const edge = document.createElement("div");
  edge.className = "pm-page-spacer-edge";
  gap.appendChild(edge);
  // Top margin of the page being opened.
  const top = numbers.position === "top"
    ? numberDom(numbers.opening, marginPx)
    : (() => { const d = document.createElement("div"); d.style.height = `${marginPx}px`; return d; })();
  el.append(fill, bottomMargin, gap, top);
  return el;
}

const positiveModulo = (value: number, mod: number) => ((value % mod) + mod) % mod;

/**
 * Inside a textblock rendered as `blockPos`'s node, find the start of the
 * first line whose bottom crosses `boundary` (all values in natural/layout
 * px, relative to the measurement base). Returns the doc position where an
 * inline spacer should be inserted, plus that line's top. Line tops are
 * monotonic in doc positions within a textblock, so binary search works.
 */
function findLineSplit(
  view: EditorView,
  blockPos: number,
  node: PMNode,
  boundary: number,
  scale: number,
  baseTop: number
): { pos: number; lineTop: number } | null {
  const from = blockPos + 1;
  const to = blockPos + node.nodeSize - 1;
  if (to <= from) return null;
  try {
    const lineBottom = (pos: number) => view.coordsAtPos(pos).bottom / scale - baseTop;
    const lineTop = (pos: number) => view.coordsAtPos(pos).top / scale - baseTop;
    if (lineBottom(to) <= boundary + MEASURE_EPS) return null;
    // Smallest position whose line crosses the boundary…
    let lo = from, hi = to;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (lineBottom(mid) > boundary + MEASURE_EPS) hi = mid;
      else lo = mid + 1;
    }
    // …snapped back to the start of that line.
    const crossTop = lineTop(lo);
    let lo2 = from, hi2 = lo;
    while (lo2 < hi2) {
      const mid = Math.floor((lo2 + hi2) / 2);
      if (lineTop(mid) >= crossTop - MEASURE_EPS) hi2 = mid;
      else lo2 = mid + 1;
    }
    return { pos: lo2, lineTop: lineTop(lo2) };
  } catch {
    // coordsAtPos can throw on odd positions (atoms at edges) — fall back to
    // pushing the whole block.
    return null;
  }
}

/** Tolerance for subpixel/rounding noise in measurements. */
const MEASURE_EPS = 2;

/**
 * Simulate the natural (spacer-free) vertical flow of the top-level blocks
 * and decide before which blocks a page break belongs. Existing spacers are
 * hidden (display:none) for the duration of the measurement so the flow —
 * including the margin-collapse a spacer would otherwise interrupt — is
 * measured exactly as it would render without them; the class toggle happens
 * within a single frame, so nothing flickers. Rects are scaled back to layout
 * px so CSS `zoom` on the page doesn't skew the numbers. Also returns how
 * much of the last page is used, so the editor can be padded to a full page.
 */
function computeLayout(
  view: EditorView,
  cfg: PageLayoutConfig
): { breaks: PageBreakPoint[]; lastPagePadPx: number } {
  const dom = view.dom as HTMLElement;
  const pageContentH = cfg.pageHeightPx - 2 * cfg.marginPx;
  if (pageContentH <= 60 || !dom.offsetWidth) return { breaks: [], lastPagePadPx: 0 };

  // Hiding the spacers momentarily collapses the content height; the browser
  // clamps/anchors the scroll position DURING that layout even though nothing
  // paints, which read as "clicking the page jumps to the top". Save and
  // restore the scroll container's position around the measurement.
  const scroller = dom.closest(".editor-shell") as HTMLElement | null;
  const savedScrollTop = scroller?.scrollTop ?? 0;
  dom.classList.add("pm-measuring");
  try {
    const scale = dom.getBoundingClientRect().width / dom.offsetWidth;
    if (!scale || !isFinite(scale)) return { breaks: [], lastPagePadPx: 0 };

    const offsets: number[] = [];
    view.state.doc.forEach((_node, offset) => offsets.push(offset));

    const breaks: PageBreakPoint[] = [];
    let baseTop: number | null = null;
    let pageStart = 0; // natural y where the current page's content begins
    let contentBottom = 0;
    let forceBreakBeforeNext = false;
    let blockIdx = 0;

    for (const child of Array.from(dom.children) as HTMLElement[]) {
      if (child.classList.contains("pm-page-spacer")) continue;
      if (blockIdx >= offsets.length) break;
      const rect = child.getBoundingClientRect();
      if (baseTop === null) baseTop = rect.top / scale;
      const top = rect.top / scale - baseTop;
      const bottom = top + rect.height / scale;
      contentBottom = Math.max(contentBottom, bottom);
      const node = view.state.doc.child(blockIdx);

      if (forceBreakBeforeNext && top > pageStart + MEASURE_EPS) {
        let fillPx = positiveModulo(pageContentH - (top - pageStart), pageContentH);
        if (fillPx > pageContentH - MEASURE_EPS * 2) fillPx = 0;
        breaks.push({ pos: offsets[blockIdx], fillPx });
        pageStart = top;
      }
      forceBreakBeforeNext = false;

      // Paragraphs and headings break at line boundaries (like Word); other
      // blocks (tables, lists, dividers) are pushed to the next page whole.
      const lineSplittable = node.type.name === "paragraph" || node.type.name === "heading";
      let guard = 0;
      while (bottom - pageStart > pageContentH + MEASURE_EPS && guard++ < 100) {
        const boundary = pageStart + pageContentH;
        const split = lineSplittable
          ? findLineSplit(view, offsets[blockIdx], node, boundary, scale, baseTop)
          : null;
        if (split && split.lineTop > top + MEASURE_EPS && split.lineTop > pageStart + MEASURE_EPS) {
          // Break inside the block, right before the line crossing the boundary.
          breaks.push({ pos: split.pos, fillPx: Math.max(0, boundary - split.lineTop) });
          pageStart = split.lineTop;
        } else if (top > pageStart + MEASURE_EPS) {
          // Block (or its very first line) doesn't fit — push it down whole.
          let fillPx = positiveModulo(pageContentH - (top - pageStart), pageContentH);
          // A block sitting exactly on a page boundary can read as
          // "overflowing" by a subpixel — never answer with a blank page.
          if (fillPx > pageContentH - MEASURE_EPS * 2) fillPx = 0;
          breaks.push({ pos: offsets[blockIdx], fillPx });
          pageStart = top;
        } else {
          // Starts at the page top and still doesn't fit (oversized table,
          // image, …) — let it run across the boundary; realign afterwards.
          break;
        }
      }

      // A manual page break closes the page for whatever follows it.
      if (child.matches("hr.pm-page-break")) forceBreakBeforeNext = true;
      blockIdx++;
    }

    const usedOnLastPage = positiveModulo(contentBottom - pageStart, pageContentH);
    const lastPagePadPx = usedOnLastPage > MEASURE_EPS ? pageContentH - usedOnLastPage : 0;
    return { breaks, lastPagePadPx };
  } finally {
    dom.classList.remove("pm-measuring");
    if (scroller && scroller.scrollTop !== savedScrollTop) {
      scroller.scrollTop = savedScrollTop;
    }
  }
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
      // Redecorating mid-composition would abort IME input; the update after
      // compositionend re-triggers the measure.
      if (view.composing) return;
      const cfg = getConfig();
      const { breaks, lastPagePadPx } = computeLayout(view, cfg);
      (view.dom as HTMLElement).style.paddingBottom =
        lastPagePadPx > 1 ? `${lastPagePadPx}px` : "";
      const cur = paginationKey.getState(view.state);
      const numbering = `${cfg.pageNumbers}:${cfg.pageNumberFormat}`;
      if (
        cur && sameBreaks(cur.breaks, breaks) &&
        cur.marginPx === cfg.marginPx && cur.numbering === numbering
      ) return;
      view.dispatch(view.state.tr.setMeta(paginationKey, {
        breaks, marginPx: cfg.marginPx, numbering,
        pageNumbers: cfg.pageNumbers, pageNumberFormat: cfg.pageNumberFormat,
      }));
    });
  };

  return new Plugin<PaginationState>({
    key: paginationKey,
    state: {
      init: () => ({ breaks: [], marginPx: 0, numbering: "off:plain", deco: DecorationSet.empty }),
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(paginationKey) as
          | {
              breaks: PageBreakPoint[]; marginPx: number; numbering: string;
              pageNumbers: PageNumberPosition; pageNumberFormat: PageNumberFormat;
            }
          | undefined;
        if (meta) {
          const total = pageCountOf(meta.breaks);
          const deco = DecorationSet.create(
            newState.doc,
            meta.breaks.map((b, i) =>
              Decoration.widget(
                b.pos,
                () => spacerDom(b.fillPx, meta.marginPx, {
                  position: meta.pageNumbers,
                  // The spacer closes page i+1 and opens page i+2.
                  closing: numberLabel(i + 1, total, meta.pageNumberFormat),
                  opening: numberLabel(i + 2, total, meta.pageNumberFormat),
                }),
                {
                  side: -1,
                  key: `pgbrk:${b.pos}:${Math.round(b.fillPx)}:${meta.marginPx}:${meta.numbering}:${total}`,
                }
              )
            )
          );
          return {
            breaks: meta.breaks, marginPx: meta.marginPx, numbering: meta.numbering, deco,
          };
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
      // The first page's top band and the last page's bottom band are .pm-page's
      // own padding — no spacer reaches them, so those two numbers are absolutely
      // positioned against the page element instead of riding in the flow.
      const page = view.dom.parentElement;
      const edge = (place: "top" | "bottom") => {
        const el = document.createElement("div");
        el.className = `pm-page-number pm-page-number-edge pm-page-number-${place}`;
        el.setAttribute("aria-hidden", "true");
        return el;
      };
      const firstEdge = edge("top");
      const lastEdge = edge("bottom");
      page?.append(firstEdge, lastEdge);
      const syncEdges = (v: EditorView) => {
        const cfg = getConfig();
        const total = pageCountOf(paginationKey.getState(v.state)?.breaks ?? []);
        const entries: Array<[HTMLElement, boolean, string]> = [
          [firstEdge, cfg.pageNumbers === "top", numberLabel(1, total, cfg.pageNumberFormat)],
          [lastEdge, cfg.pageNumbers === "bottom", numberLabel(total, total, cfg.pageNumberFormat)],
        ];
        for (const [el, on, text] of entries) {
          el.style.display = on ? "" : "none";
          el.style.height = `${cfg.marginPx}px`;
          if (on) el.textContent = text;
        }
      };
      syncEdges(view);
      // Catches async height changes (image loads, fonts) and layout-affecting
      // config changes (orientation/margins change the editor's width).
      const observer = new ResizeObserver(() => measure(view));
      observer.observe(view.dom);
      return {
        update(v) {
          measure(v);
          syncEdges(v);
        },
        destroy() {
          observer.disconnect();
          firstEdge.remove();
          lastEdge.remove();
        },
      };
    },
  });
}
