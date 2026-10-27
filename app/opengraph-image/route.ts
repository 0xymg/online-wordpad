import createSocialImage from "@/app/components/SocialImage";

// Keep the public image URL stable across the two language root layouts.
export const runtime = "edge";

export function GET() {
  return createSocialImage();
}
