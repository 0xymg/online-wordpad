"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthForm, { type AuthMode } from "@/app/components/AuthForm";
import { useSession } from "@/lib/auth-client";

/**
 * Standalone sign-in / sign-up page, so the flow can be linked to directly
 * (from marketing pages, emails, or a bookmark) instead of only existing as a
 * modal inside the editor.
 */
export default function AuthPageClient({ initialMode }: { initialMode: AuthMode }) {
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
    <div className="pad-marketing flex min-h-screen flex-col">
      <header className="border-b border-[var(--pad-border)] px-6">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between">
          <Link href="/" className="font-brand leading-none">
            <span className="text-2xl font-bold tracking-tight">EDTR</span>
            <span className="text-lg font-semibold tracking-wider text-[var(--pad-ink-50)]">PAD</span>
          </Link>
          <Link
            href="/pad"
            className="rounded-full border border-[var(--pad-border-strong)] px-4 py-2 text-[13px] font-medium transition-colors hover:border-[var(--pad-ink)]"
          >
            Continue without an account →
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm rounded-xl border border-[var(--pad-border)] bg-[var(--pad-bg)] p-6 shadow-sm">
          <AuthForm
            mode={mode}
            onModeChange={changeMode}
            onSuccess={() => router.push("/pad")}
          />
        </div>
      </main>

      <footer className="border-t border-[var(--pad-border)] px-6 py-6 text-center text-xs text-[var(--pad-ink-50)]">
        Part of project EDTR, brought to you by{" "}
        <a
          href="https://ymg.digital"
          target="_blank"
          rel="noopener"
          className="font-medium text-[var(--pad-ink)] hover:opacity-70"
        >
          ymg.digital
        </a>
      </footer>
    </div>
  );
}
