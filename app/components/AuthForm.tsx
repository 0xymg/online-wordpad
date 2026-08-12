"use client";

import { useState, useEffect, useRef } from "react";
import { authClient } from "@/lib/auth-client";
import {
  GoogleLogo, Eye, EyeSlash, CloudArrowUp, Files, ShieldCheck, CircleNotch,
} from "@phosphor-icons/react";

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true";

export type AuthMode = "login" | "signup" | "forgot";

export const AUTH_COPY: Record<AuthMode, { title: string; sub: string; cta: string }> = {
  login: { title: "Welcome back", sub: "Sign in to access your documents.", cta: "Log in" },
  signup: { title: "Create your free account", sub: "Keep your documents safe and use them on any device.", cta: "Create account" },
  forgot: { title: "Reset your password", sub: "Enter your email and we'll send you a reset link.", cta: "Send reset link" },
};

const SIGNUP_BENEFITS = [
  { Icon: CloudArrowUp, text: "Sync documents across all your devices" },
  { Icon: Files, text: "Unlimited documents, safely backed up" },
  { Icon: ShieldCheck, text: "Private — your content is never shared" },
];

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid email or password") || m.includes("invalid password") || m.includes("credential")) {
    return "Incorrect email or password. Please try again.";
  }
  if (m.includes("user already exists") || m.includes("already exists")) {
    return "An account with this email already exists. Try logging in instead.";
  }
  if (m.includes("fetch") || m.includes("network")) {
    return "Could not reach the server. Check your connection and try again.";
  }
  return message;
}

interface AuthFormProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  /** Called after a successful sign-in / sign-up. */
  onSuccess: () => void;
  /** Where OAuth returns to. */
  callbackURL?: string;
  /** Rendered under the form; used by the modal for "continue without an account". */
  footerSlot?: React.ReactNode;
  autoFocus?: boolean;
}

/**
 * The email/password + Google form, shared by the in-editor modal and the
 * standalone /login and /signup pages so both behave identically.
 */
export default function AuthForm({
  mode, onModeChange, onSuccess, callbackURL = "/pad", footerSlot, autoFocus = true,
}: AuthFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const busy = loading || googleLoading;

  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => emailRef.current?.focus());
  }, [autoFocus, mode]);

  const switchMode = (next: AuthMode) => {
    setError(null);
    setSuccess(null);
    setShowPassword(false);
    onModeChange(next);
  };

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
        const { error } = await authClient.signUp.email({
          email,
          password,
          name: name.trim() || email.split("@")[0],
        });
        if (error) throw new Error(error.message || "Sign up failed");
        onSuccess();
      } else {
        // rememberMe keeps the session cookie across browser restarts.
        const { error } = await authClient.signIn.email({ email, password, rememberMe: true });
        if (error) throw new Error(error.message || "Sign in failed");
        onSuccess();
      }
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setLoading(false);
    }
  };

  const googleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await authClient.signIn.social({ provider: "google", callbackURL });
    } catch {
      setGoogleLoading(false);
      setError("Google sign-in failed. Please try again.");
    }
  };

  const INPUT =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring";

  return (
    <>
      <h2 className="mb-1 text-lg font-semibold">{AUTH_COPY[mode].title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{AUTH_COPY[mode].sub}</p>

      {mode === "signup" && (
        <ul className="mb-4 space-y-1.5">
          {SIGNUP_BENEFITS.map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Icon size={15} className="shrink-0 text-foreground/70" />
              {text}
            </li>
          ))}
        </ul>
      )}

      {GOOGLE_ENABLED && mode !== "forgot" && (
        <>
          <button
            type="button"
            onClick={googleSignIn}
            disabled={busy}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
          >
            {googleLoading
              ? <CircleNotch size={18} className="animate-spin" />
              : <GoogleLogo size={18} weight="bold" />}
            Continue with Google
          </button>
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <input
            className={INPUT}
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        )}
        <input
          ref={emailRef}
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
            <div className="relative">
              <input
                className={`${INPUT} pr-9`}
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {mode === "signup" && (
              <p className="text-[11px] text-muted-foreground">At least 8 characters.</p>
            )}
            {mode === "login" && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {success && <p className="text-sm text-green-600 dark:text-green-400" role="status">{success}</p>}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {loading && <CircleNotch size={16} className="animate-spin" />}
          {loading ? "Please wait…" : AUTH_COPY[mode].cta}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        {mode === "forgot" ? (
          <>
            Remember your password?{" "}
            <button
              type="button"
              onClick={() => switchMode("login")}
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
              onClick={() => switchMode(mode === "login" ? "signup" : "login")}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </>
        )}
      </p>

      {footerSlot}
    </>
  );
}
