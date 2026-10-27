import { SOCIAL_IMAGE } from "@/lib/landing-seo";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "./I18nProvider";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import "../globals.css";
import ArabicI18nProvider from "./ArabicI18nProvider";

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
  verification: {
    other: { "msvalidate.01": "42A53046E5D2A6675BBAE6009BE747A7" },
  },
  openGraph: {
    images: [SOCIAL_IMAGE],
    siteName: "EDTRpad",
    type: "website",
  },
  twitter: {
    images: [SOCIAL_IMAGE.url],
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
  locale = "en",
}: Readonly<{
  children: React.ReactNode;
  locale?: "en" | "ar";
}>) {
  const LocaleProvider = locale === "ar" ? ArabicI18nProvider : I18nProvider;
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
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
        <LocaleProvider>
          <TooltipProvider delayDuration={400}>
            {children}
          </TooltipProvider>
        </LocaleProvider>
        <Analytics />
        <SpeedInsights />
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-7NJ9KXXNT7" strategy="afterInteractive" />
        <Script id="ga4" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-7NJ9KXXNT7');`}
        </Script>
      </body>
    </html>
  );
}
