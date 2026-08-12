import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "./components/I18nProvider";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "EDTRpad — Online WordPad & Free Browser Word Processor",
    template: "%s | EDTRpad",
  },
  description:
    "EDTRpad is a free online WordPad: a browser-based word processor with rich text, tables, images, export to DOCX/RTF/HTML/TXT, and print. No install, no login required.",
  metadataBase: new URL("https://wordpad.info"),
  robots: { index: true, follow: true },
  openGraph: {
    siteName: "EDTRpad",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

const jsonLdOrganization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "EDTRpad",
  alternateName: "Online WordPad",
  url: "https://wordpad.info",
  logo: "https://wordpad.info/logo.png",
  sameAs: ["https://wordpad.info"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('wordpad-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdOrganization) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <I18nProvider>
          <TooltipProvider delayDuration={400}>
            {children}
          </TooltipProvider>
        </I18nProvider>
        <Analytics />
      </body>
    </html>
  );
}
