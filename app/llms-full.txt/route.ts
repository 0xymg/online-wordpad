import fs from "fs";
import path from "path";
import { getGuide } from "@/lib/guides";
import { guideMarkdown, REVIEWED_GUIDE_SLUGS } from "@/lib/guide-markdown";

export const dynamic = "force-static";

export function GET() {
  const reference = fs.readFileSync(path.join(process.cwd(), "public/llms.md"), "utf8");
  const guides = REVIEWED_GUIDE_SLUGS.map((slug) => guideMarkdown(getGuide(slug)));
  return new Response([reference, ...guides].join("\n\n---\n\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
