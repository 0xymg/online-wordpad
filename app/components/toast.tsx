"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Info, Warning, XCircle, X } from "@phosphor-icons/react/dist/ssr";

export type ToastVariant = "info" | "success" | "error" | "warning";

export type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
  /** Optional action button (e.g. Undo). Clicking it dismisses the toast. */
  action?: { label: string; onClick: () => void };
  duration: number;
};

type Listener = (toasts: ToastItem[]) => void;

let nextId = 1;
let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  for (const l of listeners) l([...toasts]);
}

function dismiss(id: number) {
  const t = timers.get(id);
  if (t) { clearTimeout(t); timers.delete(id); }
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function toast(
  message: string,
  opts?: { variant?: ToastVariant; action?: ToastItem["action"]; duration?: number }
) {
  const id = nextId++;
  const item: ToastItem = {
    id,
    message,
    variant: opts?.variant ?? "info",
    action: opts?.action,
    duration: opts?.duration ?? (opts?.action ? 6000 : 4000),
  };
  toasts = [...toasts.slice(-3), item];
  emit();
  timers.set(id, setTimeout(() => dismiss(id), item.duration));
  return id;
}

toast.success = (message: string, opts?: { action?: ToastItem["action"]; duration?: number }) =>
  toast(message, { ...opts, variant: "success" });
toast.error = (message: string, opts?: { action?: ToastItem["action"]; duration?: number }) =>
  toast(message, { ...opts, variant: "error" });
toast.warning = (message: string, opts?: { action?: ToastItem["action"]; duration?: number }) =>
  toast(message, { ...opts, variant: "warning" });

const ICONS: Record<ToastVariant, React.ReactNode> = {
  info: <Info size={16} weight="fill" className="text-blue-500 shrink-0" />,
  success: <CheckCircle size={16} weight="fill" className="text-emerald-500 shrink-0" />,
  error: <XCircle size={16} weight="fill" className="text-red-500 shrink-0" />,
  warning: <Warning size={16} weight="fill" className="text-amber-500 shrink-0" />,
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const l: Listener = (t) => setItems(t);
    listeners.add(l);
    l([...toasts]);
    return () => { listeners.delete(l); };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      role="status"
      className="fixed bottom-14 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4 print:hidden"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex w-full items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] text-gray-800 shadow-lg animate-in fade-in slide-in-from-bottom-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          {ICONS[t.variant]}
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="shrink-0 rounded px-2 py-1 text-[12px] font-semibold text-gray-900 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gray-500 dark:text-gray-100 dark:hover:bg-gray-800"
              onClick={() => { t.action!.onClick(); dismiss(t.id); }}
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss notification"
            className="shrink-0 rounded p-1 text-gray-400 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gray-500 dark:hover:text-gray-200"
            onClick={() => dismiss(t.id)}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
