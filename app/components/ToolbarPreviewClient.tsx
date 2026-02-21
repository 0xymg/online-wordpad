"use client";

import dynamic from "next/dynamic";

const ToolbarPreview = dynamic(() => import("./ToolbarPreview"), { ssr: false });

export default function ToolbarPreviewClient() {
  return <ToolbarPreview />;
}
