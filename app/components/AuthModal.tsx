"use client";

import { useState, useEffect } from "react";
import { X } from "./icons";
import AuthForm, { authCopy, type AuthMode } from "./AuthForm";
import { useT } from "./I18nProvider";

export default function AuthModal({
  open,
  onClose,
  googleEnabled = false,
}: {
  open: boolean;
  onClose: () => void;
  googleEnabled?: boolean;
}) {
  const t = useT();
  const [mode, setMode] = useState<AuthMode>("login");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={authCopy(t, mode).title}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative mb-4 flex items-center justify-center">
          <div className="font-brand leading-none">
            <span className="text-xl font-bold tracking-tight text-foreground">EDTR</span>
            <span className="text-base font-semibold tracking-wider text-muted-foreground">PAD</span>
          </div>
          <button type="button" onClick={onClose} aria-label={t.dialog.close} className="absolute right-0 rounded p-1 hover:bg-accent">
            <X size={16} />
          </button>
        </div>

        <AuthForm
          mode={mode}
          onModeChange={setMode}
          onSuccess={onClose}
          googleEnabled={googleEnabled}
          footerSlot={
            mode !== "forgot" ? (
              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {t.auth.continueWithout}
              </button>
            ) : null
          }
        />
      </div>
    </div>
  );
}
