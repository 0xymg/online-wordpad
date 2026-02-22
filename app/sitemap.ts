import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
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
  ];
}
