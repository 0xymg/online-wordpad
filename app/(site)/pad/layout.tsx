// Editor Google Fonts load ON DEMAND: /pad boots with system fonts only, and
// a family's stylesheet is injected the first time it is actually needed —
// picked in the toolbar or present in an opened document. See
// lib/editor-fonts.ts (ensureEditorFont / ensureFontsInHtml). The preconnects
// below keep the first on-demand fetch fast.
export default function PadLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {children}
    </>
  );
}
