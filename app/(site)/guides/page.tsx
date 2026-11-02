import { SOCIAL_IMAGE } from "@/lib/landing-seo";
import type { Metadata } from "next";
import Link from "next/link";
import GuideShell from "@/app/components/guides/GuideShell";
import GuideDemo from "@/app/components/guides/GuideDemo";
import GuideDirectory from "@/app/components/guides/GuideDirectory";
import styles from "@/app/components/guides/guides.module.css";
import { getAllGuides } from "@/lib/guides";

export const metadata: Metadata = {
  title: "WordPad Guides, Word Alternatives & DOCX Help",
  description:
    "Explore online WordPad guides, Word and Google Docs alternatives, and step-by-step help opening, editing and exporting DOCX files in your browser.",
  keywords: [
    "wordpad guides",
    "online word processor tips",
    "wordpad alternative guide",
    "online word editor help",
  ],
  alternates: { canonical: "https://wordpad.info/guides" },
  openGraph: {
    images: [SOCIAL_IMAGE],
    title: "WordPad Guides, Word Alternatives & DOCX Help",
    description:
      "WordPad guides, Word and Google Docs alternatives, and help opening and exporting DOCX files.",
    url: "https://wordpad.info/guides",
    type: "website",
    siteName: "EDTRDocs",
  },
  twitter: {
    images: [SOCIAL_IMAGE.url],
    card: "summary_large_image",
    title: "WordPad Guides, Word Alternatives & DOCX Help",
    description:
      "WordPad guides, Word and Google Docs alternatives, and help opening and exporting DOCX files.",
  },
};

const jsonLdBreadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://wordpad.info",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Guides",
      item: "https://wordpad.info/guides",
    },
  ],
};

export default function GuidesIndexPage() {
  const guides = getAllGuides();
  const featuredSlugs = [
    "open-docx-online",
    "online-word-alternative",
    "google-docs-alternative",
  ];
  const features = [
    { title: "Open a Word file.", label: "FILES & FORMATS", icon: ".docx" },
    {
      title: "Find your Word alternative.",
      label: "CHOOSE YOUR EDITOR",
      icon: "W ↗",
    },
    {
      title: "Write outside Google Docs.",
      label: "A DIFFERENT WORKFLOW",
      icon: "Aa",
    },
  ];
  return (
    <GuideShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdBreadcrumb) }}
      />
      <main id="guide-main" className={styles.container}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>
              THE EDTRDOCS FIELD GUIDE · BY 312
            </span>
            <h1>
              Less figuring out.
              <br />
              More writing.
            </h1>
            <p>
              From your first line to the finished file. Practical guides,
              honest comparisons and small tricks that make a difference.
            </p>
            <a href="#library" className={styles.textLink}>
              Explore the guides <span aria-hidden="true">↓</span>
            </a>
          </div>
          <GuideDemo kind="slash" />
        </section>
        <section className={styles.featured} aria-labelledby="start-title">
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>A GOOD PLACE TO START</span>
              <h2 id="start-title">What brings you here?</h2>
            </div>
            <span className={styles.eyebrow}>THREE COMMON QUESTIONS</span>
          </div>
          <div className={styles.featureGrid}>
            {featuredSlugs.map((slug, i) => {
              const guide = guides.find((g) => g.slug === slug)!;
              return (
                <Link
                  key={slug}
                  href={`/guides/${slug}`}
                  className={styles.featureCard}
                >
                  <div className={styles.featureIcon} aria-hidden="true">
                    <span>{features[i].icon}</span>
                  </div>
                  <span className={styles.eyebrow}>{features[i].label}</span>
                  <h3>{features[i].title}</h3>
                  <p>{guide.description}</p>
                  <span className={styles.readLink}>
                    Read the guide <span aria-hidden="true">↗</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
        <GuideDirectory guides={guides} />
      </main>
    </GuideShell>
  );
}
