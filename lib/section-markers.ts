import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { documentSections } from "./document-sections";
import { sectionLabels } from "./section-i18n";
import type { Locale } from "./i18n";

type MarkerOptions = { visible: boolean; locale: Locale };
export const sectionMarkersKey = new PluginKey<MarkerOptions>("sectionMarkers");
/** Zero-size editing decorations never enter saved HTML or printed output. */
export function sectionMarkersPlugin() {
  return new Plugin<MarkerOptions>({
    key: sectionMarkersKey,
    state: {
      init: () => ({ visible: true, locale: "en" }),
      apply: (tr, value) => tr.getMeta(sectionMarkersKey) || value,
    },
    props: {
      decorations(state) {
        const options = sectionMarkersKey.getState(state)!;
        if (!options.visible) return null;
        const sections = documentSections(state.doc), t = sectionLabels(options.locale);
        const decorations: Decoration[] = [];
        state.doc.forEach((node, pos) => {
          if (!node.attrs.sectionEndId || !node.isTextblock) return;
          const index = sections.findIndex(section => section.id === node.attrs.sectionEndId);
          const start = sections[index + 1]?.geometry.startType;
          const label = `${t.sectionName(index + 1)} · ${start === "continuous" ? t.continuous : start === "nextPage" ? t.nextPage : t.otherStart}`;
          decorations.push(Decoration.widget(pos + 1, () => {
            const marker = document.createElement("span");
            marker.className = "pm-section-marker";
            marker.contentEditable = "false";
            marker.setAttribute("aria-label", label);
            marker.setAttribute("role", "note");
            const text = document.createElement("span");
            text.textContent = label;
            marker.append(text);
            return marker;
          }, { side: -1, key: `${node.attrs.sectionEndId}:${label}`, ignoreSelection: true }));
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}
