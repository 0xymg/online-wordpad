"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { GuideDemoKind } from "@/lib/guide-topics";
import styles from "./guides.module.css";

const examples = {
  slash: {
    title: "From a slash to a heading",
    steps: [
      "Type / in the document to open the command menu.",
      "Choose Heading 2 from the command menu.",
      "Write a heading, then add your notes below it.",
    ],
  },
  docx: {
    title: "A Word file, a fresh copy",
    steps: [
      "Choose File → Open and select a .docx file.",
      "Review the imported content and make your changes.",
      "Choose File → Export → Word (.docx) for a new copy.",
    ],
  },
  table: {
    title: "Give your notes some structure",
    steps: [
      "Type /table and choose Table in the command menu.",
      "Fill the table with a task, an owner and a due date.",
      "Review the columns and use the toolbar to format the text.",
    ],
  },
  print: {
    title: "From draft to printed page",
    steps: [
      "Finish your document and check the page layout.",
      "Choose File → Print to open the print dialog.",
      "Check the preview, paper size and destination before printing.",
    ],
  },
} satisfies Record<GuideDemoKind, { title: string; steps: string[] }>;

export default function GuideDemo({
  kind = "slash",
}: {
  kind?: GuideDemoKind;
}) {
  const example = examples[kind];
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [active, setActive] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const playing = !paused && motionAllowed;
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotionAllowed(!preference.matches);
    update();
    preference.addEventListener("change", update);
    const visibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", visibility);
    visibility();
    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { threshold: 0.25 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!playing || !active || !pageVisible) return;
    const timer = window.setInterval(() => setStep((s) => (s + 1) % 3), 3500);
    return () => window.clearInterval(timer);
  }, [playing, active, pageVisible]);
  return (
    <figure ref={ref} className={styles.demo} aria-labelledby={titleId}>
      <div className={styles.demoTop}>
        <span className={styles.eyebrow}>ANIMATED WALKTHROUGH</span>
        <button
          aria-label={playing ? "Pause example" : "Play example"}
          onClick={() => {
            if (!playing) {
              setMotionAllowed(true);
              setPaused(false);
            } else setPaused(true);
          }}
        >
          {playing ? "Ⅱ Pause" : "▷ Play"}
        </button>
      </div>
      <figcaption id={titleId}>{example.title}</figcaption>
      <div className={styles.demoStage} aria-hidden="true">
        <div className={styles.miniToolbar}>
          <span>File</span>
          <span>Home</span>
          <span>Insert</span>
          <span className={styles.miniFormat}>
            B <i>I</i> <u>U</u>
          </span>
        </div>
        <div className={styles.demoScene} key={`${kind}-${step}`}>
          <div className={styles.paper}>
            <span className={styles.paperLabel}>
              {kind === "docx"
                ? "Project brief"
                : kind === "print"
                  ? "A letter to send"
                  : "Meeting notes"}
            </span>
            {kind === "slash" && (
              <>
                {step < 2 ? (
                  <>
                    <span className={styles.typing}>
                      /{step === 1 ? "heading" : ""}
                      <span className={styles.caret} />
                    </span>
                    <div className={styles.command}>
                      <span className={step === 1 ? styles.selected : ""}>
                        <b>H₂</b> Heading 2 <small>↵</small>
                      </span>
                      <span>
                        <b>≡</b> Bullet list
                      </span>
                      <span>
                        <b>▦</b> Table
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <strong className={styles.paperHeading}>Next steps</strong>
                    <p>Turn the discussion into a plan.</p>
                    <div className={styles.paperLine} />
                    <div className={styles.paperLine} />
                  </>
                )}
              </>
            )}
            {kind === "table" && (
              <>
                {step === 0 ? (
                  <>
                    <span className={styles.typing}>
                      /table
                      <span className={styles.caret} />
                    </span>
                    <div className={styles.command}>
                      <span className={styles.selected}>
                        <b>▦</b> Table <small>↵</small>
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.miniTable}>
                      {[
                        "Task",
                        "Owner",
                        "Due",
                        "Draft",
                        "Alex",
                        "Monday",
                        "Review",
                        "Sam",
                        "Tuesday",
                      ].map((text, i) => (
                        <span
                          key={text}
                          className={step === 2 && i < 3 ? styles.cellBold : ""}
                        >
                          {text}
                        </span>
                      ))}
                    </div>
                    <p>Every task has a next step.</p>
                  </>
                )}
              </>
            )}
            {kind === "docx" && (
              <>
                {step === 0 ? (
                  <div className={styles.fileTile}>
                    <b>W</b>
                    <span>
                      project-brief.docx<small>File → Open</small>
                    </span>
                  </div>
                ) : (
                  <>
                    <strong className={styles.paperHeading}>
                      Project brief
                    </strong>
                    <p>Scope, schedule and next steps.</p>
                    <div className={styles.paperLine} />
                    <div className={styles.paperLine} />
                    {step === 2 && (
                      <div className={styles.exportNotice}>
                        ↓ &nbsp; project-brief.docx
                        <small>Export a new Word copy</small>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            {kind === "print" && (
              <>
                <strong className={styles.paperHeading}>Hello, Alex.</strong>
                <p>Thank you for your time.</p>
                <div className={styles.paperLine} />
                <div className={styles.paperLine} />
                {step > 0 && (
                  <div className={styles.printPreview}>
                    <b>{step === 1 ? "Print preview" : "Ready to print"}</b>
                    <span>Paper size &nbsp; A4</span>
                    <span>Pages &nbsp; All</span>
                    <span>
                      {step === 2
                        ? "✓ Review your destination"
                        : "Check margins and page breaks"}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <ol className={styles.demoSteps}>
        {example.steps.map((text, i) => (
          <li key={text}>
            <button
              aria-current={step === i ? "step" : undefined}
              onClick={() => {
                setStep(i);
                setPaused(true);
              }}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              <span>{text}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className={styles.demoNote}>
        Illustrative example. Try these steps in the editor.
      </p>
    </figure>
  );
}
