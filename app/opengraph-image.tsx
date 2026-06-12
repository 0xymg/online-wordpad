import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Online WordPad — Free Browser Word Processor";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#ffffff",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          padding: "60px",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "2px", marginBottom: "32px" }}>
          <span style={{ fontSize: 72, fontWeight: 900, letterSpacing: "-2px", color: "#111827" }}>EDTR</span>
          <span style={{ fontSize: 52, fontWeight: 700, letterSpacing: "4px", color: "#6b7280" }}>PAD</span>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: "#111827",
            textAlign: "center",
            lineHeight: 1.15,
            marginBottom: "20px",
            letterSpacing: "-1px",
          }}
        >
          Free Online Word Processor
        </div>

        {/* Subheadline */}
        <div
          style={{
            fontSize: 28,
            color: "#6b7280",
            textAlign: "center",
            lineHeight: 1.4,
            marginBottom: "44px",
          }}
        >
          WordPad &amp; Microsoft Word alternative in your browser
        </div>

        {/* Badges */}
        <div style={{ display: "flex", gap: "16px" }}>
          {["No Install", "No Login", "Export to .docx", "Free Forever"].map((label) => (
            <div
              key={label}
              style={{
                background: "#f3f4f6",
                border: "1px solid #e5e7eb",
                borderRadius: "999px",
                padding: "10px 22px",
                fontSize: 20,
                color: "#374151",
                fontWeight: 600,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* URL */}
        <div style={{ position: "absolute", bottom: "36px", fontSize: 22, color: "#9ca3af", letterSpacing: "0.5px" }}>
          wordpad.online
        </div>
      </div>
    ),
    { ...size }
  );
}
