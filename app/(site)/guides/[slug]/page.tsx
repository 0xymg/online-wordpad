import { ORGANIZATION_ID, SOCIAL_IMAGE, WEBSITE_ID } from "@/lib/landing-seo";
import GuideShell from "@/app/components/guides/GuideShell";
import GuideDemo from "@/app/components/guides/GuideDemo";
import styles from "@/app/components/guides/guides.module.css";
import { GUIDE_AUTHOR, guideHeadingId } from "@/lib/guide-topics";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { getAllGuideSlugs, getGuide } from "@/lib/guides";

export async function generateStaticParams() {
  return getAllGuideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const slugs = getAllGuideSlugs();
  if (!slugs.includes(slug)) return {};
  const guide = getGuide(slug);
  return {
    title: guide.title,
    description: guide.description,
    keywords: guide.keywords,
    authors: [{ name: GUIDE_AUTHOR.name, url: GUIDE_AUTHOR.url }],
    alternates: {
      canonical: `https://wordpad.info/guides/${slug}`,
      types: {
        "text/markdown": `https://wordpad.info/guides/${slug}/index.md`,
      },
    },
    openGraph: {
      images: [SOCIAL_IMAGE],
      title: guide.title,
      description: guide.description,
      url: `https://wordpad.info/guides/${slug}`,
      type: "article",
      authors: [GUIDE_AUTHOR.url],
      siteName: "EDTRpad",
      locale:
        guide.language === "es"
          ? "es_ES"
          : guide.language === "fr"
            ? "fr_FR"
            : "en_US",
      publishedTime: guide.date,
      modifiedTime: guide.updated || guide.date,
    },
    twitter: {
      images: [SOCIAL_IMAGE.url],
      card: "summary_large_image",
      title: guide.title,
      description: guide.description,
    },
  };
}

// Stable ids keep the table of contents usable with and without JavaScript.
const components = {
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props} id={guideHeadingId(String(children))}>
      {children}
    </h2>
  ),
  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
    <div className={styles.tableWrap}>
      <table {...props} />
    </div>
  ),
};

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const slugs = getAllGuideSlugs();
  if (!slugs.includes(slug)) notFound();

  const guide = getGuide(slug);
  const relatedGuides = guide.related
    .filter(
      (relatedSlug) => relatedSlug !== slug && slugs.includes(relatedSlug),
    )
    .map((relatedSlug) => getGuide(relatedSlug));
  const content = guide.content.replace(/^# .+\n+/m, "");
  const headings = Array.from(content.matchAll(/^## (.+)$/gm), (m) => ({
    title: m[1],
    id: guideHeadingId(m[1]),
  }));
  const displayDate = guide.updated || guide.date;

  const jsonLdArticle = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `https://wordpad.info/guides/${slug}#article`,
    headline: guide.title,
    description: guide.description,
    url: `https://wordpad.info/guides/${slug}`,
    publisher: {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: "EDTRpad",
      url: "https://wordpad.info",
      logo: { "@type": "ImageObject", url: "https://wordpad.info/logo.png" },
    },
    author: {
      "@type": "Organization",
      "@id": GUIDE_AUTHOR.id,
      name: GUIDE_AUTHOR.name,
      url: GUIDE_AUTHOR.url,
    },
    inLanguage: guide.language,
    isAccessibleForFree: true,
    isPartOf: { "@id": WEBSITE_ID },
    datePublished: guide.date,
    dateModified: displayDate,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://wordpad.info/guides/${slug}`,
    },
    image: "https://wordpad.info/opengraph-image",
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
      {
        "@type": "ListItem",
        position: 3,
        name: guide.title,
        item: `https://wordpad.info/guides/${slug}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdArticle) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdBreadcrumb) }}
      />
      <GuideShell language={guide.language}>
        <main id="guide-main" className={styles.container}>
          <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href="/guides">Guides</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{guide.title}</span>
          </nav>
          <header className={styles.articleHero}>
            <span className={styles.eyebrow}>{guide.topic}</span>
            <h1>{guide.title}</h1>
            <p className={styles.dek}>{guide.description}</p>
            <p className={styles.byline}>
              <span>
                By <a href={GUIDE_AUTHOR.url}>{GUIDE_AUTHOR.name}</a>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {guide.updated ? "Updated" : "Published"}{" "}
                <time dateTime={displayDate}>
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  }).format(new Date(displayDate))}
                </time>
              </span>
              <span aria-hidden="true">·</span>
              <span>{guide.readingMinutes} min read</span>
            </p>
          </header>
          <div className={styles.articleLayout}>
            <aside className={styles.toc}>
              <nav aria-label="On this page">
                <span className={styles.eyebrow}>ON THIS PAGE</span>
                <ol>
                  {headings.map((h) => (
                    <li key={h.id}>
                      <a href={`#${h.id}`}>{h.title}</a>
                    </li>
                  ))}
                </ol>
              </nav>
              <Link className={styles.primary} href="/pad">
                Try it in EDTRpad ↗
              </Link>
              <small>
                Write in your browser.
                <br />
                Keep a copy when you’re done.
              </small>
            </aside>
            <div className={styles.articleBody}>
              {guide.demo && <GuideDemo kind={guide.demo} />}
              <article className={styles.articleContent}>
                <div className={styles.prose}>
                  <MDXRemote
                    source={content}
                    components={components}
                    options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
                  />
                </div>
              </article>
              {relatedGuides.length > 0 && (
                <nav aria-label="Related guides" className={styles.related}>
                  <span className={styles.eyebrow}>KEEP GOING</span>
                  <h2>Your next read.</h2>
                  <div className={styles.cardGrid}>
                    {relatedGuides.map((related) => (
                      <Link
                        key={related.slug}
                        href={`/guides/${related.slug}`}
                        className={styles.card}
                        lang={related.language}
                      >
                        <div className={styles.cardMeta}>
                          <span>{related.topic}</span>
                          <span>{related.readingMinutes} min read</span>
                        </div>
                        <h3>{related.title}</h3>
                        <p>{related.description}</p>
                        <span className={styles.readLink}>
                          Read guide <span aria-hidden="true">↗</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </nav>
              )}
              <section className={styles.cta}>
                <div>
                  <h2>Make it a document.</h2>
                  <p>Put what you’ve learned into practice.</p>
                </div>
                <Link className={styles.primary} href="/pad">
                  Open editor ↗
                </Link>
              </section>
            </div>
          </div>
        </main>
      </GuideShell>
    </>
  );
}
