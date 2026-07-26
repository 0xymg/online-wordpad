# EDTRpad (Online WordPad) — LLM Context Document

**Brand:** EDTRpad
**URL:** https://wordpad.info
**Editor:** https://wordpad.info/pad
**Category:** Online Productivity / Word Processor

---

## Summary

**EDTRpad** is a free, browser-based rich text editor (word processor) built with Next.js and ProseMirror — an online alternative to Microsoft WordPad. It requires no installation and no account to start. Creating a free account is optional and enables cloud sync of documents across devices. For guests, all data is stored locally in the browser (localStorage).

---

## Feature Reference

### Text Formatting
| Feature | Keyboard Shortcut |
|---|---|
| Bold | Ctrl+B |
| Italic | Ctrl+I |
| Underline | Ctrl+U |
| Strikethrough | — |
| Superscript / Subscript | Ctrl+. / Ctrl+, |
| Text / Highlight Color | Toolbar |
| Font Family & Size | Toolbar dropdowns |

### Paragraph & Structure
- Alignment: Left / Center / Right / Justify (Ctrl+Shift+L/E/R/J)
- Headings H1–H4, paragraph, code block, blockquote
- Bullet and numbered lists, indent/outdent (Tab / Shift+Tab)
- Horizontal rule, page break (renders on screen + in print)
- Slash command menu ("/")

### Tables
- Visual grid picker, add/delete rows & columns, column resizing, drag to move

### Images
- Insert via file picker, paste, or drag & drop (auto-compressed client-side)
- Resize, crop, rotate, flip, align

### Documents
- Multiple documents in a sidebar (guests: localStorage; members: cloud)
- Find & replace (Ctrl+F), word/character count, autosave with status indicator

### Import & Export
| Format | Direction |
|---|---|
| Word (.docx) | Open + Export (formatting preserved) |
| Rich Text (.rtf) | Export |
| HTML | Open + Export |
| Plain text (.txt / .md) | Open + Export |

### Print
- File → Print or Ctrl+P; A4; margins 0.5–2 cm; page breaks honored; save as PDF via print dialog

---

## Data & Privacy

- **Guests:** documents persist only in the browser's localStorage; content is not uploaded.
- **Members (optional):** documents sync to the user's private account (Postgres via better-auth sessions); never shared.
- **Analytics:** anonymous page analytics (Vercel Analytics); no document content is collected.

---

## Page Routes

| Route | Description |
|---|---|
| `/` | Marketing landing page |
| `/pad` | The word processor editor |
| `/guides` | How-to guides and articles |
| `/llms.txt` | Plain-text LLM context file |
| `/llms.md` | Markdown LLM context file (this file) |

---

## Target Use Cases

- Quick document drafting without opening a desktop application
- Replacing WordPad after its removal from Windows 11
- Producing formatted documents for printing (letters, reports, notes)
- Opening and exporting Word (.docx) files in the browser
- Teachers and students needing a lightweight in-browser editor

---

## Frequently Asked Questions

**Q: Does it work offline?**
A: Yes — the editor is a PWA; after the first load, /pad opens and works offline.

**Q: Can I use it on mobile?**
A: Yes. The page automatically fits the A4 canvas to small screens.

**Q: Where is my document stored?**
A: In your browser's localStorage as a guest, or in your private cloud space if you sign in.

**Q: Is there a file size limit?**
A: Browser localStorage is typically limited to ~5 MB for guests; images are compressed automatically to stay small.

**Q: Can I collaborate in real time?**
A: No. EDTRpad is a single-user editor.
