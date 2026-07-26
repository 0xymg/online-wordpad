import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EDTRpad — Online WordPad",
    short_name: "EDTRpad",
    description:
      "Free online WordPad-style word processor. Rich text, tables, images, export to DOCX/RTF — right in your browser.",
    start_url: "/pad",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
