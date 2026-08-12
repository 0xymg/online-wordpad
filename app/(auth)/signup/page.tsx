import type { Metadata } from "next";
import AuthPageClient from "../AuthPageClient";
import { googleEnabled } from "@/lib/auth-flags";

export const metadata: Metadata = {
  title: "Create your free account",
  description: "Create a free EDTRpad account to save documents to the cloud and sync them across devices.",
  alternates: { canonical: "https://wordpad.info/signup" },
  robots: { index: false, follow: true },
};

export default async function SignupPage({ searchParams }: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const oauthError = Array.isArray(error) ? error[error.length - 1] : error;
  return (
    <AuthPageClient
      initialMode="signup"
      googleEnabled={googleEnabled}
      oauthError={oauthError}
    />
  );
}
