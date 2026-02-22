import fs from "fs";
import path from "path";
import matter from "gray-matter";

const GUIDES_DIR = path.join(process.cwd(), "content/guides");

export interface GuideMeta {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  date: string;
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
    const file = fs.readFileSync(path.join(GUIDES_DIR, `${slug}.mdx`), "utf8");
    const { data } = matter(file);
    return {
      slug,
      title: data.title as string,
      description: data.description as string,
      keywords: (data.keywords as string[]) ?? [],
      date: data.date as string,
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
    content,
  };
}
