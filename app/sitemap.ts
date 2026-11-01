import type { MetadataRoute } from "next";
import { LANDING_LANGUAGES, SITE_CONTENT_UPDATED, SITE_URL } from "@/lib/landing-seo";
import { getAllGuides } from "@/lib/guides";

export default function sitemap(): MetadataRoute.Sitemap {
  const guides = getAllGuides();
  // Use actual content dates so lastModified doesn't churn on every deploy.
  const guideEntries: MetadataRoute.Sitemap = guides.map((guide) => ({
    url: `${SITE_URL}/guides/${guide.slug}`,
    lastModified: new Date(guide.updated || guide.date),
  }));
  const latestGuideDate = guides.reduce(
    (latest, guide) => (guide.updated || guide.date) > latest ? (guide.updated || guide.date) : latest,
    SITE_CONTENT_UPDATED,
  );

  return [
    {
      url: SITE_URL,
      alternates: { languages: LANDING_LANGUAGES },
      lastModified: new Date(SITE_CONTENT_UPDATED),
    },
    {
      url: `${SITE_URL}/ar`,
      lastModified: new Date(SITE_CONTENT_UPDATED),
      alternates: { languages: LANDING_LANGUAGES },
    },
    {
      url: `${SITE_URL}/pad`,
      lastModified: new Date(SITE_CONTENT_UPDATED),
    },
    {
      url: `${SITE_URL}/guides`,
      lastModified: new Date(latestGuideDate),
    },
    ...guideEntries,
  ];
}
