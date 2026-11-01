import Link from "next/link";
import Image from "next/image";
import styles from "./guides.module.css";

export default function GuideShell({
  children,
  language = "en",
}: {
  children: React.ReactNode;
  language?: string;
}) {
  return (
    <div lang={language} className={styles.shell}>
      <a className={styles.skip} href="#guide-main">
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link
            href="/"
            aria-label="EDTRpad home"
            className={`${styles.brand} font-brand`}
          >
            EDTR<span>PAD</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/guides">Guides</Link>
            <Link className={styles.primary} href="/pad">
              Open editor <span aria-hidden="true">↗</span>
            </Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className={styles.footer}>
        <div>
          <Link className={`${styles.brand} font-brand`} href="/">
            EDTR<span>PAD</span>
          </Link>
          <p>A little help for your next document.</p>
        </div>
        <div>
          <p>
            Guides by{" "}
            <a href="https://312.sh" aria-label="312 website">
              <Image src="/312-logo.svg" alt="312" width="35" height="11" />
            </a>
          </p>
          <nav aria-label="Footer navigation">
            <Link href="/">Home</Link>
            <Link href="/guides">All guides</Link>
            <Link href="/pad">Editor</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
