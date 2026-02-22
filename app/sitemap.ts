import type { MetadataRoute } from "next";
import { getAllGuideSlugs } from "@/lib/guides";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const guideSlugs = getAllGuideSlugs();
  const guideEntries: MetadataRoute.Sitemap = guideSlugs.map((slug) => ({
    url: `https://wordpad.online/guides/${slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [
    {
      url: "https://wordpad.online",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://wordpad.online/pad",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://wordpad.online/guides",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...guideEntries,
  ];
}
