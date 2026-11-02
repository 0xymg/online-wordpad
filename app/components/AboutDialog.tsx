"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowSquareOut } from "./icons";
import { useT } from "./I18nProvider";
import BrandCredit from "./BrandCredit";

export default function AboutDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="sr-only">{t.help.about}</DialogTitle>
        <span className="font-brand select-none leading-none text-start">
          <span className="text-3xl font-bold tracking-tight text-foreground">EDTR</span><span className="text-xl font-semibold tracking-wider text-muted-foreground">DOCS</span>
        </span>
        <DialogDescription className="text-start">{t.help.aboutTagline}</DialogDescription>
      </DialogHeader>
      <p className="text-sm leading-relaxed text-muted-foreground">{t.help.aboutBody}</p>
      <section className="space-y-2 border-t border-border pt-4" aria-label={t.help.aboutProjects}>
        <h3 className="text-xs font-medium text-muted-foreground">{t.help.aboutProjects}</h3>
        {[["https://edtr.md", t.landing.footerMd], ["https://edtr.plus", t.landing.footerPlus]].map(([href, label]) => <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-4 border border-border px-3 py-3 text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2">
          <span>{label}</span><ArrowSquareOut aria-hidden="true" size={16} className="shrink-0 text-muted-foreground" />
        </a>)}
        <a href="https://312.sh" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 pt-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">{t.help.aboutStudio}<ArrowSquareOut aria-hidden="true" size={13} /></a>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-sm">
        <span className="text-muted-foreground">{t.help.aboutContact}</span><a href="mailto:hello@312.sh" className="underline underline-offset-4 hover:no-underline">hello@312.sh</a>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{t.help.aboutText}</p>
      <footer className="border-t border-border pt-4"><BrandCredit /></footer>
    </DialogContent>
  </Dialog>;
}
