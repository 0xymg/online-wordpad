"use client";

import { useEffect, useState } from "react";
import { X, CircleNotch, Warning } from "@phosphor-icons/react/dist/ssr";
import { authClient } from "@/lib/auth-client";
import { useT } from "./I18nProvider";
import { toast } from "./toast";

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
  user: { name: string; email: string; initials: string; emailVerified: boolean } | null;
  /** True when the account was created with a password (Google-only users have none). */
  hasPassword: boolean;
  onDeleted: () => void;
}

const INPUT =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring";
const SECTION = "border-t border-border pt-5";

/**
 * Account settings: profile fields, password, and account deletion.
 * Each section submits on its own so a failure in one does not discard the others.
 */
export default function ProfileDialog({ open, onClose, user, hasPassword, onDeleted }: ProfileDialogProps) {
  const t = useT();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<"profile" | "password" | "delete" | null>(null);

  // Reopening should show what is stored, not whatever was half-typed last time.
  useEffect(() => {
    if (!open) return;
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setCurrentPassword("");
    setNewPassword("");
    setDeletePassword("");
    setConfirmDelete(false);
  }, [open, user?.name, user?.email]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !user) return null;

  const errText = (e: unknown, fallback: string) =>
    (e instanceof Error && e.message) || fallback;

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("profile");
    try {
      const cleanName = name.trim();
      if (cleanName && cleanName !== user.name) {
        const { error } = await authClient.updateUser({ name: cleanName });
        if (error) throw new Error(error.message);
      }
      const cleanEmail = email.trim().toLowerCase();
      if (cleanEmail && cleanEmail !== user.email) {
        const { error } = await authClient.changeEmail({ newEmail: cleanEmail, callbackURL: "/pad" });
        if (error) throw new Error(error.message);
        // A verified address only changes once the link in the new inbox is used.
        toast.success(user.emailVerified ? t.profile.emailPending : t.profile.saved);
      } else {
        toast.success(t.profile.saved);
      }
    } catch (err) {
      toast.error(errText(err, t.profile.saveFailed));
    } finally {
      setBusy(null);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("password");
    try {
      if (hasPassword) {
        const { error } = await authClient.changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        });
        if (error) throw new Error(error.message);
      } else {
        // Google-only account: there is no current password to check, so this
        // sets the first one and email/password sign-in becomes available too.
        const { error } = await authClient.requestPasswordReset({ email: user.email, redirectTo: "/reset-password" });
        if (error) throw new Error(error.message);
        toast.success(t.profile.passwordEmailSent);
        setBusy(null);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      toast.success(t.profile.passwordChanged);
    } catch (err) {
      toast.error(errText(err, t.profile.passwordFailed));
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    setBusy("delete");
    try {
      const { error } = await authClient.deleteUser(
        hasPassword ? { password: deletePassword } : {}
      );
      if (error) throw new Error(error.message);
      toast.success(t.profile.accountDeleted);
      onDeleted();
      onClose();
    } catch (err) {
      toast.error(errText(err, t.profile.deleteFailed));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1400] flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.profile.title}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {user.initials}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{t.profile.title}</h2>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t.dialog.close} className="rounded p-1 hover:bg-accent">
            <X size={16} />
          </button>
        </div>

        {/* Profile */}
        <form onSubmit={saveProfile} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="profile-name" className="text-xs font-medium text-muted-foreground">{t.profile.name}</label>
            <input id="profile-name" className={INPUT} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div className="space-y-1">
            <label htmlFor="profile-email" className="text-xs font-medium text-muted-foreground">{t.profile.email}</label>
            <input id="profile-email" className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            {!user.emailVerified && <p className="text-[11px] text-muted-foreground">{t.profile.emailUnverified}</p>}
          </div>
          <button
            type="submit"
            disabled={busy !== null}
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy === "profile" && <CircleNotch size={15} className="animate-spin" />}
            {t.dialog.save}
          </button>
        </form>

        {/* Password */}
        <form onSubmit={savePassword} className={`mt-6 space-y-3 ${SECTION}`}>
          <h3 className="text-sm font-medium">{t.profile.passwordTitle}</h3>
          {hasPassword ? (
            <>
              <input
                className={INPUT}
                type="password"
                placeholder={t.profile.currentPassword}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <input
                className={INPUT}
                type="password"
                placeholder={t.profile.newPassword}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{t.profile.noPasswordYet}</p>
          )}
          <button
            type="submit"
            disabled={busy !== null}
            className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
          >
            {busy === "password" && <CircleNotch size={15} className="animate-spin" />}
            {hasPassword ? t.profile.changePassword : t.profile.setPassword}
          </button>
        </form>

        {/* Danger zone */}
        <div className={`mt-6 ${SECTION}`}>
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <Warning size={15} weight="fill" /> {t.profile.dangerZone}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{t.profile.deleteWarning}</p>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="mt-3 rounded-md border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              {t.profile.deleteAccount}
            </button>
          ) : (
            <div className="mt-3 space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-xs font-medium">{t.profile.deleteConfirm}</p>
              {hasPassword && (
                <input
                  className={INPUT}
                  type="password"
                  placeholder={t.profile.currentPassword}
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  autoComplete="current-password"
                />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={deleteAccount}
                  disabled={busy !== null || (hasPassword && !deletePassword)}
                  className="flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  {busy === "delete" && <CircleNotch size={15} className="animate-spin" />}
                  {t.profile.deletePermanently}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
                >
                  {t.dialog.cancel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
