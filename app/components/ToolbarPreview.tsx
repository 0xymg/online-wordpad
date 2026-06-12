"use client";

import { useRef } from "react";
import { EditorView } from "prosemirror-view";
import Toolbar from "./Toolbar";
import { mySchema } from "./Editor";

export default function ToolbarPreview() {
  const viewRef = useRef<EditorView | null>(null);

  return (
    <div className="pointer-events-none select-none overflow-hidden">
      <Toolbar
        viewRef={viewRef}
        schema={mySchema}
        onInsertTable={() => {}}
        onPageBreakAdd={() => {}}
        onLinkAdd={() => {}}
        onImageAdd={() => {}}
        tick={0}
      />
    </div>
  );
}
