"use client";
import { useState } from "react";
import Link from "next/link";
import type { GuideMeta } from "@/lib/guides";
import { GUIDE_TOPICS } from "@/lib/guide-topics";
import styles from "./guides.module.css";

export default function GuideDirectory({ guides }: { guides: GuideMeta[] }) {
  const [topic, setTopic] = useState("All guides");
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase();
  const visible = guides.filter(
    (g) =>
      (topic === "All guides" || topic === g.topic) &&
      `${g.title} ${g.description} ${g.keywords.join(" ")}`
        .toLocaleLowerCase()
        .includes(normalized),
  );
  return (
    <section
      id="library"
      className={styles.directory}
      aria-labelledby="library-title"
    >
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>THE LIBRARY</span>
          <h2 id="library-title">Find your next step.</h2>
        </div>
        <label className={styles.search}>
          <span>Search guides</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try DOCX, tables, printing…"
          />
        </label>
      </div>
      <div
        className={styles.filters}
        role="group"
        aria-label="Filter guides by topic"
      >
        {["All guides", ...GUIDE_TOPICS].map((t) => (
          <button
            key={t}
            aria-pressed={topic === t}
            onClick={() => setTopic(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <p className={styles.resultCount} role="status">
        {visible.length} {visible.length === 1 ? "guide" : "guides"}
        {query && ` for “${query}”`}
      </p>
      <div className={styles.cardGrid}>
        {visible.map((g) => (
          <Link
            className={styles.card}
            href={`/guides/${g.slug}`}
            key={g.slug}
            lang={g.language}
          >
            <div className={styles.cardMeta}>
              <span>{g.topic}</span>
              <span>{g.readingMinutes} min read</span>
            </div>
            <h3>{g.title}</h3>
            <p>{g.description}</p>
            <span className={styles.readLink}>
              Read guide <span aria-hidden="true">↗</span>
            </span>
          </Link>
        ))}
      </div>
      {visible.length === 0 && (
        <div className={styles.empty}>
          <h3>No guides found.</h3>
          <p>Try a different word or browse all topics.</p>
          <button
            onClick={() => {
              setQuery("");
              setTopic("All guides");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
}
