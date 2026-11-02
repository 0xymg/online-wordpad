"use client";
import { Fragment } from "react";
import Image from "next/image";
import { useT } from "./I18nProvider";

export default function BrandCredit() {
  const t = useT();
  return <span className="text-sm text-muted-foreground">
    {t.landing.footerCredit.split(/(\{project\}|\{by\})/).map((part, index) => {
      if (part === "{project}") return <span key={index} className="font-brand font-bold tracking-tight text-foreground">Project EDTR</span>;
      if (part === "{by}") return <a key={index} href="https://312.sh" target="_blank" rel="noopener noreferrer" className="inline-block align-baseline hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4">
        <Image src="/312-logo.svg" alt="312" width={35} height={11} className="inline-block h-[0.75em] w-auto align-baseline dark:invert" />
      </a>;
      return <Fragment key={index}>{part}</Fragment>;
    })}
  </span>;
}
