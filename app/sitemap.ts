import type { MetadataRoute } from "next";
import { getAllGuides } from "@/lib/guides";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const guides = getAllGuides();
  // Use each guide's frontmatter date so lastModified doesn't churn on every deploy.
  const guideEntries: MetadataRoute.Sitemap = guides.map((guide) => ({
    url: `https://wordpad.info/guides/${guide.slug}`,
    lastModified: guide.date ? new Date(guide.date) : now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [
    {
      url: "https://wordpad.info",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://wordpad.info/pad",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://wordpad.info/guides",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...guideEntries,
  ];
}
