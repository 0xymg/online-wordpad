export const GUIDE_TOPICS = [
  "Getting started",
  "Writing & formatting",
  "Files & printing",
  "Alternatives",
  "Devices",
  "Other languages",
] as const;
export type GuideTopic = (typeof GUIDE_TOPICS)[number];
export type GuideDemoKind = "slash" | "docx" | "table" | "print";
export const GUIDE_AUTHOR = {
  name: "312",
  url: "https://312.sh",
  id: "https://312.sh/#organization",
} as const;
export const guideHeadingId = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
