import RootDocument from "@/app/components/RootDocument";

export { metadata, viewport } from "@/app/components/RootDocument";

export default function ArabicLayout({ children }: { children: React.ReactNode }) {
  return <RootDocument locale="ar">{children}</RootDocument>;
}
