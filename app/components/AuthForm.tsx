"use client";

import { useState, useEffect, useRef } from "react";
import { authClient } from "@/lib/auth-client";
import { useT } from "./I18nProvider";
import type { Dictionary } from "@/lib/i18n";
import {
  GoogleLogo, Eye, EyeSlash, CloudArrowUp, Files, ShieldCheck, CircleNotch,
} from "@phosphor-icons/react";

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true";

export type AuthMode = "login" | "signup" | "forgot";

export function authCopy(t: Dictionary, mode: AuthMode): { title: string; sub: string; cta: string } {
  if (mode === "signup") return { title: t.auth.signupTitle, sub: t.auth.signupSub, cta: t.auth.signupCta };
  if (mode === "forgot") return { title: t.auth.forgotTitle, sub: t.auth.forgotSub, cta: t.auth.forgotCta };
  return { title: t.auth.loginTitle, sub: t.auth.loginSub, cta: t.auth.loginCta };
}

function signupBenefits(t: Dictionary) {
  return [
    { Icon: CloudArrowUp, text: t.auth.benefitSync },
    { Icon: Files, text: t.auth.benefitUnlimited },
    { Icon: ShieldCheck, text: t.auth.benefitPrivate },
  ];
}

// Server messages are English; map the ones we recognise onto localized copy
// and fall back to a generic line rather than showing raw backend text.
function friendlyError(t: Dictionary, message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid email or password") || m.includes("invalid password") || m.includes("credential")) {
    return t.auth.errWrongCredentials;
  }
  if (m.includes("user already exists") || m.includes("already exists")) {
    return t.auth.errExists;
  }
  if (m.includes("fetch") || m.includes("network")) {
    return t.auth.errNetwork;
  }
  return message || t.auth.errGeneric;
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
  const t = useT();
  const copy = authCopy(t, mode);
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
        setSuccess(t.auth.resetSent);
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
      setError(friendlyError(t, err instanceof Error ? err.message : ""));
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
      setError(t.auth.errGoogle);
    }
  };

  const INPUT =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring";

  return (
    <>
      <h2 className="mb-1 text-lg font-semibold">{copy.title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{copy.sub}</p>

      {mode === "signup" && (
        <ul className="mb-4 space-y-1.5">
          {signupBenefits(t).map(({ Icon, text }) => (
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
            {t.auth.google}
          </button>
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> {t.auth.or} <div className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <input
            className={INPUT}
            placeholder={t.auth.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        )}
        <input
          ref={emailRef}
          className={INPUT}
          type="email"
          placeholder={t.auth.emailPlaceholder}
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
                placeholder={t.auth.passwordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
                tabIndex={-1}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {mode === "signup" && (
              <p className="text-[11px] text-muted-foreground">{t.auth.passwordHint}</p>
            )}
            {mode === "login" && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  {t.auth.forgotLink}
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
          {loading ? t.auth.pleaseWait : copy.cta}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        {mode === "forgot" ? (
          <>
            {t.auth.rememberPassword}{" "}
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              {t.auth.logInLink}
            </button>
          </>
        ) : (
          <>
            {mode === "login" ? `${t.auth.noAccount} ` : `${t.auth.haveAccount} `}
            <button
              type="button"
              onClick={() => switchMode(mode === "login" ? "signup" : "login")}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              {mode === "login" ? t.auth.signUpLink : t.auth.logInLink}
            </button>
          </>
        )}
      </p>

      {footerSlot}
    </>
  );
}
