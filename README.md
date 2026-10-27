<div align="center">
  <img src="public/logo.svg" alt="EDTRpad" width="72" />
  <h1>EDTRpad</h1>
  <p><strong>The online word processor that's already open.</strong></p>
  <p>A free Word and WordPad alternative in your browser. Write, format, print, and export — no download or account required.</p>
  <p><a href="https://wordpad.info/pad"><strong>Start writing →</strong></a> · <a href="https://wordpad.info">Explore the features</a></p>
</div>

---

## Press `/` and keep writing

Headings, tables, images, lists, page breaks, and formatting are a few keystrokes away. Type `/` anywhere in the document, search for an action, and press Enter. Prefer buttons? The toolbar and familiar keyboard shortcuts are there too.

Type a variable instead of repeating yourself:

| Type | Insert |
| --- | --- |
| `[[today]]` | Today's date |
| `[[today::DD.MM.YYYY]]` | A date in your chosen format |
| `[[name]]` | The name on your account |
| `[[email]]` | The email on your account |

Variables insert ordinary text. A date in an old letter stays the date you wrote, even when you reopen it later.

## Everyday documents, properly formatted

- **Rich text:** headings, font families and sizes, bold, italic, underline, text colors, highlights, lists, and line spacing.
- **Tables and images:** insert tables, merge cells, and add, resize, crop, rotate, flip, and align images.
- **Files you can use elsewhere:** open `.docx`, `.txt`, `.md`, and `.html`; export Word, PDF, RTF, HTML, Markdown, or plain text.
- **Paper-sized pages:** page orientation, margins, page breaks, and printing.
- **Less interruption:** autosave, version history, find and replace, dark mode, and focus mode.
- **A place to start:** letters, résumés, meeting notes, invoices, reports, project plans, and task lists.

## Write in your language

The interface supports **English, Arabic, Chinese, Turkish, and French**. Browser language detection gets you started; the language picker remembers your choice.

Right-to-left layouts, automatic paragraph direction, and Word and PDF export support keep mixed-language documents readable. Explicit paragraph alignment is preserved.

## Start without an account

Guest documents stay in the browser's local storage on that device. There is no document upload to our servers in guest mode. Clearing browser data removes those local copies, so export important work.

An optional account keeps multiple documents and syncs them across devices. Account documents are stored on the server. Both modes are free.

## Run locally

Built with **Next.js 16, React 19, TypeScript, Tailwind CSS, ProseMirror, and Radix UI**. Optional accounts use Better Auth and PostgreSQL. Word and PDF exporters load on demand.

```bash
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The guest editor works without account configuration.

### Optional account configuration

Configure these environment variables in `.env.local` or your deployment environment:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection for accounts and documents |
| `BETTER_AUTH_SECRET` | Stable authentication secret; required for production accounts |
| `BETTER_AUTH_URL` | Base URL for authentication, such as `http://localhost:3000` locally |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Enable Google sign-in when both are set |
| `RESEND_API_KEY` | Send verification and password-reset emails |
| `EMAIL_FROM` | Sender address for outgoing email |

Provision the Better Auth tables before enabling accounts. [`scripts/extra-schema.mjs`](scripts/extra-schema.mjs) adds the document table and user metadata after the auth schema exists; it reads `DATABASE_URL` from its process environment. Without a mail provider, development email links are logged to the server console.

### Commands

```bash
npm run dev     # Development server
npm run build   # Production build and TypeScript validation
npm run start   # Serve the production build
npm run lint    # ESLint
```

### Project map

| Path | Contents |
| --- | --- |
| `app/(site)/` | Existing public routes: landing, editor, guides, and account pages |
| `app/ar/` | Localized landing page and document layout |
| `app/LandingClient.tsx` | Shared interactive landing page |
| `app/components/` | Editor, toolbar, dialogs, and locale providers |
| `lib/i18n/` | Typed dictionaries and language preference store |
| `lib/landing-seo.ts` | Search copy and shared language alternatives |
| `lib/doc-export.ts`, `lib/pdf-export.tsx` | Word/RTF and PDF export |
| `content/guides/` | Guides published from MDX |
| `public/pdf-fonts/` | Embedded PDF fonts and applicable font licenses |

## Deployment

The repository deploys through its Vercel Git integration. Production uses `main`; configure the account environment variables in Vercel when enabling account features. Run a production build and verify the affected pages before pushing.

---

Part of [Project EDTR](https://ymg.digital). EDTRpad is an independent project and is not affiliated with Microsoft, Google, or Notion. Microsoft Word and WordPad are trademarks of Microsoft Corporation.
