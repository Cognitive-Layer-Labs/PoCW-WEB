import { ImageResponse } from "next/og";
import { MARK_DATA_URI, OG_COLORS, OG_FONT_FAMILY, mapPageDataUri, ogFonts } from "@/lib/server/og";

export const alt = "Bookmap: you read the book, now see what stayed with you.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: OG_COLORS.ink, fontFamily: OG_FONT_FAMILY, padding: 72 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <img src={MARK_DATA_URI} width={64} height={64} />
            <span style={{ color: OG_COLORS.paper, fontSize: 44, fontWeight: 600 }}>Bookmap</span>
          </div>
          <div style={{ display: "flex", color: OG_COLORS.paper, fontSize: 64, fontWeight: 600, lineHeight: 1.08, letterSpacing: -1 }}>
            You read the book. Now see what stayed with you.
          </div>
          <div style={{ display: "flex", color: OG_COLORS.mute, fontSize: 28 }}>A map of its ideas, and a quick test.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flex: 1 }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <img src={mapPageDataUri(["mastered", "mastered", "attempted", "mastered", "untested", "attempted", "untested", "mastered", "untested"])} width={420} height={340} />
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() }
  );
}
