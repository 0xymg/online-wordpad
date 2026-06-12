"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { X, GoogleLogo } from "@phosphor-icons/react";

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true";

export default function AuthModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await authClient.requestPasswordReset({
          email,
          redirectTo: "/reset-password",
        });
        if (error) throw new Error(error.message || "Failed to send reset email");
        setSuccess("Check your inbox — we've sent a password reset link.");
      } else if (mode === "signup") {
        const { error } = await authClient.signUp.email({ email, password, name: name || email.split("@")[0] });
        if (error) throw new Error(error.message || "Sign up failed");
        onClose();
      } else {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) throw new Error(error.message || "Sign in failed");
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const googleSignIn = async () => {
    setError(null);
    await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/pad`,
    });
  };

  const INPUT =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="font-brand leading-none">
            <span className="text-xl font-bold tracking-tight text-foreground">EDTR</span>
            <span className="text-base font-semibold tracking-wider text-muted-foreground">PAD</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-accent">
            <X size={16} />
          </button>
        </div>

        <h2 className="mb-1 text-lg font-semibold">
          {mode === "login" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {mode === "login"
            ? "Sign in to access your documents."
            : mode === "signup"
            ? "Sign up to save and sync your documents."
            : "Enter your email and we'll send you a reset link."}
        </p>

        {GOOGLE_ENABLED && mode !== "forgot" && (
          <>
            <button
              type="button"
              onClick={googleSignIn}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              <GoogleLogo size={18} weight="bold" /> Continue with Google
            </button>
            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <input className={INPUT} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          )}
          <input
            className={INPUT}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          {mode !== "forgot" && (
            <div className="space-y-1">
              <input
                className={INPUT}
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              {mode === "login" && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => { setMode("forgot"); setError(null); setSuccess(null); }}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Please wait…" : mode === "login" ? "Log in" : mode === "signup" ? "Sign up" : "Send reset link"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "forgot" ? (
            <>
              Remember your password?{" "}
              <button
                type="button"
                onClick={() => { setMode("login"); setError(null); setSuccess(null); }}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                Log in
              </button>
            </>
          ) : (
            <>
              {mode === "login" ? "Don't have an account? " : "Already have an account? "}
              <button
                type="button"
                onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setSuccess(null); }}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                {mode === "login" ? "Sign up" : "Log in"}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
