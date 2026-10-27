import RootDocument from "@/app/components/RootDocument";

export { metadata, viewport } from "@/app/components/RootDocument";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <RootDocument>{children}</RootDocument>;
}
