"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthForm, { oauthErrorMessage, type AuthMode } from "@/app/components/AuthForm";
import { useT, useLocale } from "@/app/components/I18nProvider";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/lib/auth-client";

/**
 * Standalone sign-in / sign-up page, so the flow can be linked to directly
 * (from marketing pages, emails, or a bookmark) instead of only existing as a
 * modal inside the editor.
 */
export default function AuthPageClient({
  initialMode,
  googleEnabled = false,
  oauthError,
}: {
  initialMode: AuthMode;
  googleEnabled?: boolean;
  /** Better Auth's ?error=<code> from a Google round trip that came back failed. */
  oauthError?: string;
}) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const router = useRouter();
  const { data: session, isPending } = useSession();

  // Already signed in? There is nothing to do here.
  useEffect(() => {
    if (!isPending && session?.user) router.replace("/pad");
  }, [isPending, session, router]);

  // Keep the URL in step with the form so a refresh or a shared link lands on
  // the same screen.
  const changeMode = (next: AuthMode) => {
    setMode(next);
    const path = next === "signup" ? "/signup" : "/login";
    window.history.replaceState(null, "", path);
  };

  return (
    <div className="auth-page flex min-h-screen flex-col text-foreground">
      <header className="welcome-classic-header border-b border-border px-5">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap gap-3 py-3 items-center justify-between">
          <Link href="/" className="font-brand leading-none">
            <span className="text-lg font-bold tracking-tight">EDTR</span>
            <span className="text-sm font-semibold tracking-wider text-muted-foreground">PAD</span>
          </Link>
          <div className="flex items-center gap-2">
            <Select value={locale} onValueChange={(v) => setLocale(v as typeof locale)}>
              <SelectTrigger
                size="sm"
                aria-label={t.locale.label}
                className="h-8 border-border bg-transparent px-2 text-[13px] shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {LOCALES.map((code) => (
                  <SelectItem key={code} value={code} className="text-[13px]">
                    {LOCALE_NAMES[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Link
              href="/pad"
              className="rounded-full border border-input px-4 py-2 text-[13px] font-medium transition-colors hover:bg-accent"
            >
              {t.auth.continueWithout}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:py-16">
        <div className="w-full max-w-md border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-10">
          <AuthForm
            mode={mode}
            onModeChange={changeMode}
            onSuccess={() => router.push("/pad")}
            googleEnabled={googleEnabled}
            initialError={oauthError ? oauthErrorMessage(t, oauthError) : null}
          />
        </div>
      </main>

      <footer className="border-t border-border px-6 py-6 text-center text-xs text-muted-foreground">
        {t.landing.footerCredit
          .replace("{project}", "Project EDTR")
          .replace("{by}", "312")}
      </footer>
    </div>
  );
}
