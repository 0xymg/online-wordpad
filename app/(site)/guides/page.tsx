import { SOCIAL_IMAGE } from "@/lib/landing-seo";
import type { Metadata } from "next";
import Link from "next/link";
import { getAllGuides } from "@/lib/guides";

export const metadata: Metadata = {
  title: "WordPad Guides, Word Alternatives & DOCX Help",
  description:
    "Explore online WordPad guides, Word and Google Docs alternatives, and step-by-step help opening, editing and exporting DOCX files in your browser.",
  keywords: ["wordpad guides", "online word processor tips", "wordpad alternative guide", "online word editor help"],
  alternates: { canonical: "https://wordpad.info/guides" },
  openGraph: {
    images: [SOCIAL_IMAGE],
    title: "WordPad Guides, Word Alternatives & DOCX Help",
    description: "WordPad guides, Word and Google Docs alternatives, and help opening and exporting DOCX files.",
    url: "https://wordpad.info/guides",
    type: "website",
    siteName: "EDTRpad",
  },
  twitter: {
    images: [SOCIAL_IMAGE.url],
    card: "summary_large_image",
    title: "WordPad Guides, Word Alternatives & DOCX Help",
    description: "WordPad guides, Word and Google Docs alternatives, and help opening and exporting DOCX files.",
  },
};

const jsonLdBreadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://wordpad.info" },
    { "@type": "ListItem", position: 2, name: "Guides", item: "https://wordpad.info/guides" },
  ],
};

export default function GuidesIndexPage() {
  const guides = getAllGuides();
  const featuredSlugs = ["online-word-alternative", "open-docx-online", "google-docs-alternative"];
  const featuredGuides = featuredSlugs.flatMap((slug) => guides.filter((guide) => guide.slug === slug));
  const otherGuides = guides.filter((guide) => !featuredSlugs.includes(guide.slug));

  return (
    <div lang="en" className="min-h-screen bg-white text-gray-900 font-sans">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdBreadcrumb) }} />
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-6 flex items-center justify-between h-14">
          <Link href="/" className="font-brand leading-none hover:opacity-80 transition-opacity">
            <span className="text-xl font-bold tracking-tight text-gray-900">EDTR</span>
            <span className="text-base font-semibold tracking-wider text-gray-400">PAD</span>
          </Link>
          <Link
            href="/pad"
            className="bg-gray-900 hover:bg-black text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Open Editor
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-400 flex items-center gap-1.5 mb-10">
          <Link href="/" className="hover:text-gray-600 transition-colors">Home</Link>
          <span>/</span>
          <span className="text-gray-600">Guides</span>
        </nav>

        <h1 className="text-3xl font-extrabold tracking-tight mb-3">Guides</h1>
        <p className="text-gray-500 mb-10">
          Practical help with online WordPad, browser-based Word alternatives, DOCX files and choosing an editor for your documents.
        </p>

        <section aria-labelledby="document-help-title" className="mb-12">
          <h2 id="document-help-title" className="mb-4 text-xl font-semibold">Word alternatives and DOCX help</h2>
          <div className="grid gap-4">
            {featuredGuides.map((guide) => (
              <Link key={guide.slug} href={`/guides/${guide.slug}`} className="block border border-gray-200 bg-gray-50 p-5 transition-colors hover:border-gray-400">
                <h3 className="mb-2 font-semibold">{guide.title}</h3>
                <p className="text-sm leading-relaxed text-gray-600">{guide.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <h2 className="mb-4 text-xl font-semibold">WordPad guides and editing tips</h2>
        <div className="space-y-4">
          {otherGuides.map((guide) => (
            <Link
              key={guide.slug}
              href={`/guides/${guide.slug}`}
              className="block p-5 border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all group"
            >
              <h3 className="font-semibold text-gray-900 group-hover:text-black mb-1">
                {guide.title}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                {guide.description}
              </p>
            </Link>
          ))}
        </div>
      </main>

      <footer className="border-t border-gray-100 py-8">
        <div className="mx-auto max-w-3xl px-6 flex items-center justify-between text-sm text-gray-400">
          <Link href="/" className="hover:text-gray-600 transition-colors">
            © {new Date().getFullYear()} EDTRpad · Free Online WordPad
          </Link>
          <Link href="/pad" className="hover:text-gray-600 transition-colors">Open Editor</Link>
        </div>
      </footer>
    </div>
  );
}
