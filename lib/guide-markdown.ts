import type { Guide } from "./guides";
import { SITE_URL } from "./landing-seo";

/** Public article text only, with the same content and dates as the HTML page. */
export function guideMarkdown(guide: Guide): string {
  const title = /^#\s+/m.test(guide.content) ? "" : `# ${guide.title}\n\n`;
  const content = guide.content.trim().replace(/\]\(\/(?!\/)/g, `](${SITE_URL}/`);
  return `${title}Source: ${SITE_URL}/guides/${guide.slug}\nPublished: ${guide.date}\nUpdated: ${guide.updated || guide.date}\n\n${content}\n`;
}

export const REVIEWED_GUIDE_SLUGS = [
  "online-word-alternative",
  "open-docx-online",
  "google-docs-alternative",
  "export-to-word-docx-online",
  "wordpad-vs-google-docs",
  "wordpad-vs-microsoft-word",
] as const;
