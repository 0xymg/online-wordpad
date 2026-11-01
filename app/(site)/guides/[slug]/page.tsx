import { ORGANIZATION_ID, SOCIAL_IMAGE, WEBSITE_ID } from "@/lib/landing-seo";
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
    alternates: {
      canonical: `https://wordpad.info/guides/${slug}`,
      types: { "text/markdown": `https://wordpad.info/guides/${slug}/index.md` },
    },
    openGraph: {
    images: [SOCIAL_IMAGE],
      title: guide.title,
      description: guide.description,
      url: `https://wordpad.info/guides/${slug}`,
      type: "article",
      siteName: "EDTRpad",
      locale: "en_US",
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

// MDX component overrides — styled for the guide layout
const components = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="text-3xl font-extrabold tracking-tight mb-6 mt-0" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-xl font-bold mt-10 mb-3 text-gray-900" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-lg font-semibold mt-8 mb-2 text-gray-800" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="text-gray-600 leading-relaxed mb-4" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc pl-6 mb-4 space-y-1 text-gray-600" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal pl-6 mb-4 space-y-1 text-gray-600" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="leading-relaxed" {...props} />
  ),
  a: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <Link
      href={href ?? "#"}
      className="text-gray-900 font-medium underline underline-offset-2 hover:text-black transition-colors"
      {...(rest as Omit<React.ComponentProps<typeof Link>, "href">)}
    >
      {children}
    </Link>
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-gray-900" {...props} />
  ),
  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="overflow-x-auto mb-6">
      <table className="w-full text-sm border-collapse" {...props} />
    </div>
  ),
  thead: (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead className="bg-gray-50" {...props} />
  ),
  th: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th className="border border-gray-200 px-4 py-2 text-left font-semibold text-gray-700" {...props} />
  ),
  td: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td className="border border-gray-200 px-4 py-2 text-gray-600" {...props} />
  ),
  hr: () => <hr className="my-8 border-gray-100" />,
  blockquote: (props: React.HTMLAttributes<HTMLElement>) => (
    <blockquote className="border-l-4 border-gray-200 pl-4 italic text-gray-500 my-4" {...props} />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono" {...props} />
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
    .filter((relatedSlug) => relatedSlug !== slug && slugs.includes(relatedSlug))
    .map((relatedSlug) => getGuide(relatedSlug));
  const hasContentTitle = /^#\s+/m.test(guide.content);
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
    author: { "@type": "Organization", "@id": ORGANIZATION_ID, name: "EDTRpad", url: "https://wordpad.info" },
    inLanguage: "en",
    isAccessibleForFree: true,
    isPartOf: { "@id": WEBSITE_ID },
    datePublished: guide.date,
    dateModified: displayDate,
    mainEntityOfPage: { "@type": "WebPage", "@id": `https://wordpad.info/guides/${slug}` },
    image: "https://wordpad.info/opengraph-image",
  };

  const jsonLdBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://wordpad.info" },
      { "@type": "ListItem", position: 2, name: "Guides", item: "https://wordpad.info/guides" },
      { "@type": "ListItem", position: 3, name: guide.title, item: `https://wordpad.info/guides/${slug}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdArticle) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdBreadcrumb) }} />
      <div lang="en" className="min-h-screen bg-white text-gray-900 font-sans">
        {/* Nav */}
        <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-sm">
          <div className="mx-auto max-w-3xl px-6 flex items-center justify-between h-14">
            <Link href="/" className="font-brand leading-none hover:opacity-80 transition-opacity">
              <span className="text-xl font-bold tracking-tight text-gray-900">EDTR</span>
              <span className="text-base font-semibold tracking-wider text-gray-400">PAD</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-gray-500">
              <Link href="/guides" className="hover:text-gray-900 transition-colors">Guides</Link>
              <Link
                href="/pad"
                className="bg-gray-900 hover:bg-black text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Open Editor
              </Link>
            </nav>
          </div>
        </header>

        {/* Breadcrumb */}
        <div className="mx-auto max-w-3xl px-6 pt-6">
          <nav className="text-sm text-gray-400 flex items-center gap-1.5">
            <Link href="/" className="hover:text-gray-600 transition-colors">Home</Link>
            <span>/</span>
            <Link href="/guides" className="hover:text-gray-600 transition-colors">Guides</Link>
            <span>/</span>
            <span className="text-gray-600 truncate">{guide.title}</span>
          </nav>
        </div>

        {/* Article */}
        <main className="mx-auto max-w-3xl px-6 py-10">
          <article className="prose-none">
            {!hasContentTitle && (
              <h1 className="text-3xl font-extrabold tracking-tight mb-4">{guide.title}</h1>
            )}
            <p className="mb-8 text-sm text-gray-500">
              By EDTRpad · {guide.updated ? "Updated" : "Published"}{" "}
              <time dateTime={displayDate}>
                {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(displayDate))}
              </time>
            </p>
            <MDXRemote
              source={guide.content}
              components={components}
              options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
            />
          </article>

          {relatedGuides.length > 0 && (
            <nav aria-label="Related guides" className="mt-10 border-t border-gray-200 pt-6">
              <h2 className="mb-4 text-lg font-semibold">Related guides</h2>
              <ul className="space-y-3">
                {relatedGuides.map((related) => (
                  <li key={related.slug}>
                    <Link href={`/guides/${related.slug}`} className="font-medium underline underline-offset-4 hover:text-gray-600">
                      {related.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {/* CTA */}
          <div className="mt-12 p-8 bg-gray-50 rounded-2xl border border-gray-100 text-center">
            <h2 className="text-xl font-bold mb-2">Ready to start writing?</h2>
            <p className="text-gray-500 mb-5 text-sm">No account. No download. Opens in seconds.</p>
            <Link
              href="/pad"
              className="inline-block bg-gray-900 hover:bg-black text-white font-semibold px-8 py-3 rounded-xl transition-colors"
            >
              Open Online WordPad
            </Link>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-100 py-8 mt-8">
          <div className="mx-auto max-w-3xl px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-400">
            <Link href="/" className="hover:text-gray-600 transition-colors">
              © {new Date().getFullYear()} Online WordPad
            </Link>
            <div className="flex items-center gap-5">
              <Link href="/" className="hover:text-gray-600 transition-colors">Home</Link>
              <Link href="/guides" className="hover:text-gray-600 transition-colors">Guides</Link>
              <Link href="/pad" className="hover:text-gray-600 transition-colors">Editor</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
