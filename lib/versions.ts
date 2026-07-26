// Guest-side (localStorage) version history. Members use the document_version
// table via server actions instead — see app/actions/user-data.ts.

const KEY = "wordpad-versions";
const MAX_PER_DOC = 5;
// Snapshots share the guest's ~5MB quota with the documents themselves;
// skip very large docs (usually embedded images) rather than evicting them.
const MAX_HTML_CHARS = 200_000;

export type GuestVersion = { t: number; html: string };

function loadAll(): Record<string, GuestVersion[]> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persist(all: Record<string, GuestVersion[]>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Quota exceeded — drop the oldest snapshot of every doc and retry once.
    try {
      for (const id of Object.keys(all)) all[id] = all[id].slice(0, 2);
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {}
  }
}

export function saveGuestVersion(docId: string, html: string): void {
  if (!docId || html.length > MAX_HTML_CHARS) return;
  const all = loadAll();
  const list = all[docId] || [];
  list.unshift({ t: Date.now(), html });
  all[docId] = list.slice(0, MAX_PER_DOC);
  persist(all);
}

export function listGuestVersions(docId: string): GuestVersion[] {
  return loadAll()[docId] || [];
}

export function removeGuestVersions(docId: string): void {
  const all = loadAll();
  if (all[docId]) {
    delete all[docId];
    persist(all);
  }
}
