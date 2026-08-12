"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Info, Warning, XCircle, X } from "./icons";
import { cn } from "@/lib/utils";

export type ToastVariant = "info" | "success" | "error" | "warning";
export type ToastPosition = "top" | "bottom";

export type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
  /** Optional action button (e.g. Undo). Clicking it dismisses the toast. */
  action?: { label: string; onClick: () => void };
  duration: number;
  position: ToastPosition;
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

type ToastOpts = {
  variant?: ToastVariant;
  action?: ToastItem["action"];
  duration?: number;
  /** Where the toast appears. Defaults to the bottom of the viewport. */
  position?: ToastPosition;
};

export function toast(message: string, opts?: ToastOpts) {
  const id = nextId++;
  const item: ToastItem = {
    id,
    message,
    variant: opts?.variant ?? "info",
    action: opts?.action,
    duration: opts?.duration ?? (opts?.action ? 6000 : 4000),
    position: opts?.position ?? "bottom",
  };
  toasts = [...toasts.slice(-3), item];
  emit();
  timers.set(id, setTimeout(() => dismiss(id), item.duration));
  return id;
}

type VariantOpts = Omit<ToastOpts, "variant">;
toast.success = (message: string, opts?: VariantOpts) => toast(message, { ...opts, variant: "success" });
toast.error = (message: string, opts?: VariantOpts) => toast(message, { ...opts, variant: "error" });
toast.warning = (message: string, opts?: VariantOpts) => toast(message, { ...opts, variant: "warning" });

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

  const stacks: Array<{ position: ToastPosition; list: ToastItem[] }> = [
    { position: "top", list: items.filter((t) => t.position === "top") },
    { position: "bottom", list: items.filter((t) => t.position === "bottom") },
  ];

  return (
    <>
      {stacks.map(({ position, list }) =>
        list.length === 0 ? null : (
          <div
            key={position}
            aria-live="polite"
            role="status"
            className={cn(
              "fixed left-1/2 z-[1500] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4 print:hidden",
              position === "top" ? "top-4" : "bottom-14"
            )}
          >
            {list.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "pointer-events-auto flex w-full items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] text-gray-800 shadow-lg animate-in fade-in dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100",
                  position === "top" ? "slide-in-from-top-2" : "slide-in-from-bottom-2"
                )}
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
        )
      )}
    </>
  );
}
