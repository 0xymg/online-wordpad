# Online WordPad — LLM Context Document

**URL:** https://wordpad.online
**Editor:** https://wordpad.online/pad
**Category:** Online Productivity / Word Processor
**License:** Open Source

---

## Summary

**Online WordPad** is a free, browser-based rich text editor (word processor) built with Next.js and ProseMirror. It requires no installation, no user account, and no backend server. All data is stored locally in the browser (localStorage). It targets users who need a quick, capable word processor accessible from any device with a modern browser.

---

## Feature Reference

### Text Formatting
| Feature | Keyboard Shortcut |
|---|---|
| Bold | Ctrl+B |
| Italic | Ctrl+I |
| Underline | Ctrl+U |
| Strikethrough | — |
| Text Color | Toolbar |
| Highlight Color | Toolbar |
| Font Family | Toolbar dropdown |
| Font Size | Toolbar dropdown |

### Paragraph & Structure
- Alignment: Left / Center / Right / Justify
- Heading levels: H1, H2, H3, H4
- Normal paragraph
- Code block
- Blockquote
- Bullet list (unordered)
- Numbered list (ordered)
- Indent / Outdent (Tab / Shift+Tab)
- Horizontal rule
- Page break (renders on screen + in print)

### Tables
- Visual grid picker (up to 8×8 on hover)
- Add column right
- Add row below
- Delete column / row / entire table
- Column resizing by drag

### Images
- Insert via toolbar (file picker) or paste from clipboard
- Resize by dragging corner handles
- Crop (react-advanced-cropper)
- Rotate 90°
- Flip horizontal / vertical
- Align: left / center / right

### Emoji
- Searchable emoji picker
- Skin tone disabled (simple mode)
- Lazy loading for performance

### Export
| Format | Menu Path |
|---|---|
| Word (.docx) | File → Export → Word (.docx) |
| HTML | File → Export → Save as HTML |
| Plain Text | File → Export → Plain text (.txt) |

### Print
- Triggered via: File → Print, View → Print Preview, or Ctrl+P
- Uses react-to-print (iframe-based isolation)
- Page margins: 0.5 / 1.0 / 1.5 / 2.0 cm (user-selectable in status bar)
- Page breaks honored in print output
- Paper size: A4

---

## Architecture

```
app/
├── page.tsx              # Landing page (/)
├── pad/
│   └── page.tsx          # Editor route (/pad)
├── components/
│   ├── Editor.tsx         # Main ProseMirror editor component
│   ├── MenuBar.tsx        # Top menu bar (File, Edit, View, Insert, Table, Format, Help)
│   ├── Toolbar.tsx        # Ribbon toolbar with formatting controls
│   ├── ColorPicker.tsx    # Reusable color picker (text/highlight)
│   └── TableContextMenu.tsx
├── globals.css            # Global styles, A4 page layout, ProseMirror styles
└── layout.tsx             # Root layout with font loading and metadata
```

### Key Technology Choices

| Concern | Solution |
|---|---|
| Editor engine | ProseMirror (prosemirror-state, prosemirror-view, prosemirror-model) |
| History | prosemirror-history |
| Tables | prosemirror-tables |
| Schema | prosemirror-schema-basic + prosemirror-schema-list + custom extensions |
| Print | react-to-print v3 |
| DOCX export | docx.js (Packer.toBlob) |
| Image editing | react-advanced-cropper |
| UI components | shadcn/ui (Radix UI primitives) |
| Icons | @phosphor-icons/react |
| Styling | Tailwind CSS v4 |
| Framework | Next.js 16 (App Router, React 19) |

---

## Data & Privacy

- **No backend:** The application has no API routes and no server-side data handling.
- **No accounts:** Users do not register or log in.
- **Local storage:** Document content is persisted in `localStorage` under the key `wordpad-content-pm` as a ProseMirror JSON document.
- **No telemetry:** No analytics, tracking pixels, or data collection of any kind.

---

## Page Routes

| Route | Description |
|---|---|
| `/` | Marketing landing page |
| `/pad` | The word processor editor |
| `/llms.txt` | Plain-text LLM context file |
| `/llms.md` | Markdown LLM context file (this file) |

---

## Target Use Cases

- Quick document drafting without opening a desktop application
- Writing on a shared/public computer without leaving traces (no server data)
- Producing formatted documents for printing (letters, reports, notes)
- Exporting content to Word format for further editing in Microsoft Word
- Teachers and students needing a lightweight in-browser editor

---

## Frequently Asked Questions

**Q: Does it work offline?**
A: Once loaded, the editor works offline. Fonts (Google Fonts) require internet on first load and are then cached by the browser.

**Q: Can I use it on mobile?**
A: The editor is optimized for desktop. Mobile may work but is not the primary target.

**Q: Where is my document stored?**
A: Exclusively in your browser's localStorage. It is not uploaded anywhere.

**Q: Is there a file size limit?**
A: No artificial limit. Browser localStorage is typically limited to ~5 MB by the browser.

**Q: Can I collaborate in real time?**
A: No. Online WordPad is a single-user editor. There is no real-time collaboration feature.
