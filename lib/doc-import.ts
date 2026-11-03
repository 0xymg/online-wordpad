// Client-side file import: .txt / .md / .html / .docx → HTML for the editor.
// Loaded on demand via dynamic import (mammoth is heavy).

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
    const [mammoth, { prepareDocxFormatting }, { prepareTextBoxImport }, { prepareReferenceImport }] = await Promise.all([
      import("mammoth"),
      import("./docx-formatting"),
      import("./text-box-docx"),
      import("./reference-docx"),
    ]);
    const boxes = await prepareTextBoxImport(await file.arrayBuffer());
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
    return { html: boxes.restore(references.restore(prepared.restore(result.value || "<p></p>"))), name };
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
