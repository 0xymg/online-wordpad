import { getAllGuideSlugs, getGuide } from "@/lib/guides";
import { guideMarkdown } from "@/lib/guide-markdown";
import { SITE_URL } from "@/lib/landing-seo";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllGuideSlugs().map((slug) => ({ slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getAllGuideSlugs().includes(slug)) return new Response("Not found", { status: 404 });
  return new Response(guideMarkdown(getGuide(slug)), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${SITE_URL}/guides/${slug}>; rel="canonical", <${SITE_URL}/llms.txt>; rel="describedby"`,
    },
  });
}
