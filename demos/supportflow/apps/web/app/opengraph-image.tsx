import { ImageResponse } from "next/og";

export const alt = "SupportFlow — AI answers from your help centre, people in charge.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#f7f6f2",
          color: "#1b1a17",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontFamily: "sans-serif", fontWeight: 600 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "#1d5c4e" }} />
          SupportFlow
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 88, lineHeight: 1.05, letterSpacing: -2 }}>
          <span>Answers in seconds.</span>
          <span style={{ color: "#1d5c4e", fontStyle: "italic" }}>People in charge.</span>
        </div>
        <div style={{ fontSize: 30, color: "#5c5850", fontFamily: "sans-serif" }}>
          AI-assisted customer support grounded in your own help centre.
        </div>
      </div>
    ),
    size,
  );
}
