import type { Dictionary } from "./en";

/** Source phrases used by command definitions and other shared UI metadata. */
export function uiText(t: Dictionary, source: string): string {
  return Object.hasOwn(t.ui, source) ? t.ui[source as keyof Dictionary["ui"]] : source;
}
