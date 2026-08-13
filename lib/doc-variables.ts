/**
 * Document variables: typing `[[name]]`, `[[email]]` or `[[today]]` in the
 * editor swaps the token for its value as soon as the closing `]]` lands.
 *
 * The value is baked in as plain text — the token is a typing shortcut, not a
 * live field, so a document keeps saying what it said when it was written.
 */

/** Whatever the editor knows about the current session, for `[[name]]`/`[[email]]`. */
export type VariableContext = {
  name?: string | null;
  email?: string | null;
};

/** Used for a bare `[[today]]`; `[[today::…]]` overrides it per use. */
export const DEFAULT_DATE_FORMAT = "DD.MM.YYYY";

/** Offered in the Insert ▸ Variable menu — the first one is the default. */
export const DATE_FORMATS = [
  "DD.MM.YYYY",
  "DD/MM/YYYY",
  "YYYY-MM-DD",
  "D MMMM YYYY",
  "MMMM D, YYYY",
  "DD.MM.YYYY HH:mm",
] as const;

// Longest tokens first so DD is never matched as two Ds, MMMM never as MM+MM.
const TOKEN = /YYYY|YY|MMMM|MMM|MM|M|DDDD|DDD|DD|D|HH|mm|ss/g;

/**
 * Format `date` with a subset of the familiar moment-style tokens. Month and
 * weekday names come from `locale`, so `[[today::D MMMM YYYY]]` reads natively
 * in whichever language the UI is set to.
 */
export function formatDate(date: Date, format: string, locale?: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const name = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, options).format(date);

  return format.replace(TOKEN, (token) => {
    switch (token) {
      case "YYYY": return String(date.getFullYear());
      case "YY":   return pad(date.getFullYear() % 100);
      case "MMMM": return name({ month: "long" });
      case "MMM":  return name({ month: "short" });
      case "MM":   return pad(date.getMonth() + 1);
      case "M":    return String(date.getMonth() + 1);
      case "DDDD": return name({ weekday: "long" });
      case "DDD":  return name({ weekday: "short" });
      case "DD":   return pad(date.getDate());
      case "D":    return String(date.getDate());
      case "HH":   return pad(date.getHours());
      case "mm":   return pad(date.getMinutes());
      case "ss":   return pad(date.getSeconds());
      default:     return token;
    }
  });
}

/**
 * Resolve one `[[token]]`. Returns null when the name isn't a known variable,
 * and "" when it is known but has no value (a guest has no email). Callers
 * treat both as "leave the typed text alone", so `[[whatever]]` can still be
 * written literally and nothing is silently swallowed.
 */
export function resolveVariable(
  rawName: string,
  rawFormat: string | undefined,
  ctx: VariableContext,
  locale?: string,
  now: Date = new Date()
): string | null {
  switch (rawName.trim().toLowerCase()) {
    case "name":
      return (ctx.name || "").trim();
    case "email":
      return (ctx.email || "").trim();
    case "today":
    case "date":
      return formatDate(now, rawFormat?.trim() || DEFAULT_DATE_FORMAT, locale);
    case "time":
      return formatDate(now, rawFormat?.trim() || "HH:mm", locale);
    default:
      return null;
  }
}

/**
 * Matches a completed token at the caret: `[[name]]` or `[[today::DD.MM.YYYY]]`.
 * The format part excludes `]` so an unterminated token can't swallow the rest
 * of the line, and is length-capped so a stray `[[` mid-paragraph stays inert.
 */
export const VARIABLE_INPUT_RULE = /\[\[([a-zA-Z]{1,12})(?:::([^\]\n]{1,40}))?\]\]$/;
