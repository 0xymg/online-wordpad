import type { Metadata } from "next";
import Link from "next/link";
import { getAllGuides } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Guides: WordPad Online, Alternatives & Tips",
  description:
    "Guides about using an online WordPad, free WordPad alternatives, and browser-based text editing. No install required.",
  alternates: {
    canonical: "https://wordpad.online/guides",
  },
};

export default function GuidesIndexPage() {
  const guides = getAllGuides();

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-6 flex items-center justify-between h-14">
          <Link href="/" className="text-lg font-bold tracking-tight hover:opacity-80 transition-opacity">
            Online <span className="text-gray-900">WordPad</span>
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
          Tips, comparisons, and how-to guides for WordPad users and people looking for free browser-based text editors.
        </p>

        <div className="space-y-4">
          {guides.map((guide) => (
            <Link
              key={guide.slug}
              href={`/guides/${guide.slug}`}
              className="block p-5 border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all group"
            >
              <h2 className="font-semibold text-gray-900 group-hover:text-black mb-1">
                {guide.title}
              </h2>
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
            © {new Date().getFullYear()} Online WordPad
          </Link>
          <Link href="/pad" className="hover:text-gray-600 transition-colors">Open Editor</Link>
        </div>
      </footer>
    </div>
  );
}
