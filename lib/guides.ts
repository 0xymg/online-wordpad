import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type { GuideTopic, GuideDemoKind } from "./guide-topics";

const GUIDES_DIR = path.join(process.cwd(), "content/guides");

export interface GuideMeta {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  date: string;
  updated?: string;
  related: string[];
  topic: GuideTopic;
  language: string;
  demo?: GuideDemoKind;
  readingMinutes: number;
}

export interface Guide extends GuideMeta {
  content: string;
}

export function getAllGuideSlugs(): string[] {
  return fs
    .readdirSync(GUIDES_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

export function getAllGuides(): GuideMeta[] {
  return getAllGuideSlugs().map((slug) => {
    const { content, ...meta } = getGuide(slug);
    return {
      ...meta,
      readingMinutes: Math.max(1, Math.ceil(content.split(/\s+/).length / 200)),
    };
  });
}

export function getGuide(slug: string): Guide {
  const file = fs.readFileSync(path.join(GUIDES_DIR, `${slug}.mdx`), "utf8");
  const { data, content } = matter(file);
  return {
    slug,
    title: data.title as string,
    description: data.description as string,
    keywords: (data.keywords as string[]) ?? [],
    date: data.date as string,
    updated: data.updated as string | undefined,
    related: (data.related as string[]) ?? [],
    topic: (data.topic as GuideTopic) ?? "Getting started",
    language: (data.language as string) ?? "en",
    demo: data.demo as GuideDemoKind | undefined,
    readingMinutes: Math.max(1, Math.ceil(content.split(/\s+/).length / 200)),
    content,
  };
}
