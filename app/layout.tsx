import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
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
    default: "Online WordPad — Free Browser Word Processor",
    template: "%s | Online WordPad",
  },
  description:
    "Free browser-based word processor. Rich text, tables, images, export to DOCX/HTML/TXT, and print. No install, no login required.",
  metadataBase: new URL("https://wordpad.info"),
  robots: { index: true, follow: true },
  openGraph: {
    siteName: "Online WordPad",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
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
  name: "Online WordPad",
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Roboto:ital,wght@0,400;0,700;1,400&family=Open+Sans:ital,wght@0,400;0,700;1,400&family=Lato:ital,wght@0,400;0,700;1,400&family=Montserrat:ital,wght@0,400;0,700;1,400&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Merriweather:ital,wght@0,400;0,700;1,400&family=Source+Code+Pro:wght@400;700&family=Raleway:ital,wght@0,400;0,700;1,400&family=Nunito:ital,wght@0,400;0,700;1,400&family=Poppins:ital,wght@0,400;0,700;1,400&family=PT+Serif:ital,wght@0,400;0,700;1,400&family=Libre+Baskerville:ital,wght@0,400;1,400&family=Josefin+Sans:ital,wght@0,400;0,700;1,400&family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=Oswald:wght@400;700&family=Dancing+Script:wght@400;700&family=Pacifico&family=Lobster&family=Caveat:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TooltipProvider delayDuration={400}>
          {children}
        </TooltipProvider>
        <Analytics />
      </body>
    </html>
  );
}
