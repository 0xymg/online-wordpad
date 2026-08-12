"use client";

import dynamic from "next/dynamic";

// Fixed-height fallback ≈ toolbar + hero page, so the hero doesn't jump when
// the lazy chunk arrives.
const ToolbarPreview = dynamic(() => import("./ToolbarPreview"), {
  ssr: false,
  loading: () => <div aria-hidden className="h-[425px] bg-gray-100" />,
});

export default function ToolbarPreviewClient() {
  return <ToolbarPreview />;
}
