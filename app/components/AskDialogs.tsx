"use client";

import { useCallback, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ConfirmOpts = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PromptOpts = {
  title: string;
  description?: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
};

type ConfirmState = ConfirmOpts & { resolve: (ok: boolean) => void };
type PromptState = PromptOpts & { resolve: (value: string | null) => void };

/**
 * In-app replacements for window.confirm / window.prompt. Native dialogs block
 * the main thread, can't be styled, and look like a browser error on a page
 * that otherwise has its own design language.
 *
 * Returns promises so callers read the same as the native calls they replace:
 *   if (!(await confirm({ title: "…" }))) return;
 */
export function useAskDialogs() {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [promptValue, setPromptValue] = useState("");

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })),
    []
  );

  const prompt = useCallback(
    (opts: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setPromptValue(opts.defaultValue ?? "");
        setPromptState({ ...opts, resolve });
      }),
    []
  );

  const settleConfirm = (ok: boolean) => {
    confirmState?.resolve(ok);
    setConfirmState(null);
  };

  const settlePrompt = (value: string | null) => {
    promptState?.resolve(value);
    setPromptState(null);
  };

  const dialogs = (
    <>
      <AlertDialog
        open={!!confirmState}
        onOpenChange={(open) => { if (!open) settleConfirm(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            {confirmState?.description && (
              <AlertDialogDescription>{confirmState.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settleConfirm(false)}>
              {confirmState?.cancelLabel ?? "Cancel"}
            </AlertDialogCancel>
            {/* Has to go through `variant`, not a className override: the
                action renders asChild, and Radix's Slot concatenates class
                strings without tailwind-merge — an overriding bg-destructive
                would sit alongside the variant's bg-primary and lose or win by
                stylesheet order. In dark mode that landed as white text on the
                light default button. */}
            <AlertDialogAction
              onClick={() => settleConfirm(true)}
              variant={confirmState?.destructive ? "destructive" : "default"}
            >
              {confirmState?.confirmLabel ?? "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!promptState}
        onOpenChange={(open) => { if (!open) settlePrompt(null); }}
      >
        <DialogContent className="sm:max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              settlePrompt(promptValue.trim() ? promptValue.trim() : null);
            }}
          >
            <DialogHeader>
              <DialogTitle>{promptState?.title}</DialogTitle>
              {promptState?.description && (
                <DialogDescription>{promptState.description}</DialogDescription>
              )}
            </DialogHeader>
            <div className="grid gap-2 py-4">
              <Label htmlFor="ask-prompt-input">{promptState?.label}</Label>
              <Input
                id="ask-prompt-input"
                autoFocus
                value={promptValue}
                placeholder={promptState?.placeholder}
                onChange={(e) => setPromptValue(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => settlePrompt(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!promptValue.trim()}>
                {promptState?.confirmLabel ?? "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );

  return { confirm, prompt, dialogs };
}
