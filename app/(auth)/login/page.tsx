import type { Metadata } from "next";
import AuthPageClient from "../AuthPageClient";
import { googleEnabled } from "@/lib/auth-flags";

export const metadata: Metadata = {
  title: "Log in",
  description: "Sign in to EDTRpad to access your documents on any device.",
  alternates: { canonical: "https://wordpad.info/login" },
  robots: { index: false, follow: true },
};

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const oauthError = Array.isArray(error) ? error[error.length - 1] : error;
  return (
    <AuthPageClient
      initialMode="login"
      googleEnabled={googleEnabled}
      oauthError={oauthError}
    />
  );
}
