// Client-side file import: .txt / .md / .html / .docx → HTML for the editor.
// Loaded on demand via dynamic import (mammoth is heavy).
import { FOOTNOTE_EDITING_ENABLED } from "./note-features";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function textToHtml(text: string): string {
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  if (!paragraphs.length) return "<p></p>";
  return paragraphs.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

export async function fileToHtml(
  file: File,
): Promise<{ html: string; name: string }> {
  const name = file.name.replace(/\.[^.]+$/, "") || "Imported document";
  const ext = (file.name.split(".").pop() || "").toLowerCase();

  if (ext === "docx") {
    const [mammoth, { prepareDocxFormatting }, { prepareTextBoxImport }, { prepareReferenceImport }, { prepareNoteImport }, { prepareBibliographyImport }, { mySchema }] = await Promise.all([
      import("mammoth"),
      import("./docx-formatting"),
      import("./text-box-docx"),
      import("./reference-docx"),
      import("./note-docx"),
      import("./bibliography-docx"),
      import("@/app/components/editor-schema"),
    ]);
    const bibliography = await prepareBibliographyImport(await file.arrayBuffer());
    const notes = await prepareNoteImport(bibliography.arrayBuffer, { allowFootnotes: FOOTNOTE_EDITING_ENABLED });
    const boxes = await prepareTextBoxImport(notes.arrayBuffer);
    const references = await prepareReferenceImport(boxes.arrayBuffer);
    const prepared = await prepareDocxFormatting(references.arrayBuffer);
    const result = await mammoth.convertToHtml(
      { arrayBuffer: prepared.arrayBuffer },
      {
        styleMap: prepared.styleMap,
        includeEmbeddedStyleMap: false,
        ignoreEmptyParagraphs: false,
      },
    );
    const restored = notes.restore(boxes.restore(references.restore(prepared.restore(result.value || "<p></p>"))), mySchema);
    if (!Object.keys(restored.notes).length && !restored.hasSettings) return { html: bibliography.restore(restored.html), name };
    const carrier = document.createElement("div");
    carrier.setAttribute("data-edtr-notes-import", JSON.stringify({ notes: restored.notes, notePolicy: restored.notePolicy, sectionNotePolicies: restored.sectionNotePolicies }));
    carrier.innerHTML = restored.html;
    return { html: bibliography.restore(carrier.outerHTML), name };
  }

  if (ext === "html" || ext === "htm") {
    const raw = await file.text();
    // Extract body content; ProseMirror's schema-based parser drops scripts/styles.
    const doc = new DOMParser().parseFromString(raw, "text/html");
    doc
      .querySelectorAll("script, style, link, meta")
      .forEach((el) => el.remove());
    return { html: doc.body.innerHTML || "<p></p>", name };
  }

  // .txt, .md and anything else: plain text
  const text = await file.text();
  return { html: textToHtml(text), name };
}

export const OPEN_ACCEPT = ".txt,.md,.html,.htm,.docx";
