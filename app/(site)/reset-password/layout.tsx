import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset your password",
  alternates: { canonical: "https://wordpad.info/reset-password" },
  robots: { index: false, follow: true },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
