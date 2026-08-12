import Editor from "../components/Editor";
import { googleEnabled } from "@/lib/auth-flags";

// The start screen is app UI over the editor, not standalone content — keep it
// out of the index and point search engines at the editor instead.
export const metadata = {
  title: "Your Documents — EDTRpad",
  description: "Start a new document, pick a template, or continue where you left off.",
  alternates: {
    canonical: "https://wordpad.info/pad",
  },
  robots: { index: false, follow: true },
};

export default function WelcomePage() {
  return <Editor googleEnabled={googleEnabled} initialHome />;
}
