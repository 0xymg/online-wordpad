import type { Metadata } from "next";
import AuthPageClient from "../AuthPageClient";

export const metadata: Metadata = {
  title: "Create your free account",
  description: "Create a free EDTRpad account to save documents to the cloud and sync them across devices.",
  alternates: { canonical: "https://wordpad.info/signup" },
  robots: { index: false, follow: true },
};

export default function SignupPage() {
  return <AuthPageClient initialMode="signup" />;
}
