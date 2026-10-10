import { ImageResponse } from "next/og";
import { firstName } from "@/lib/server/auth";
import { sharedResult } from "@/lib/server/repo";
import { MARK_DATA_URI, OG_COLORS, OG_FONT_FAMILY, mapPageDataUri, ogFonts } from "@/lib/server/og";

export const runtime = "nodejs";
export const alt = "A Bookmap result";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: Promise<{ slug: string }> };

export default async function ShareImage({ params }: Props) {
  const { slug } = await params;
  const r = sharedResult(slug);
  const fonts = await ogFonts();

  if (!r) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 24, background: OG_COLORS.ink, fontFamily: OG_FONT_FAMILY }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <img src={MARK_DATA_URI} width={96} height={96} />
          <span style={{ color: OG_COLORS.paper, fontSize: 64, fontWeight: 600 }}>Bookmap</span>
        </div>
      ),
      { ...size, fonts }
    );
  }

  const outcomes = [...r.concepts]
    .sort((a, b) => b.asked - a.asked)
    .map((c) => (c.asked <= 0 ? "untested" : c.mastered ? "mastered" : "attempted") as "mastered" | "attempted" | "untested");
  const title = r.bookTitle.length > 70 ? `${r.bookTitle.slice(0, 68)}…` : r.bookTitle;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: OG_COLORS.ink, fontFamily: OG_FONT_FAMILY, padding: "64px 72px" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 640 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <img src={MARK_DATA_URI} width={56} height={56} />
            <span style={{ color: OG_COLORS.paper, fontSize: 38, fontWeight: 600 }}>Bookmap</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: OG_COLORS.mute, fontSize: 34 }}>{firstName({ name: r.name })} scored</span>
            <span style={{ color: OG_COLORS.paper, fontSize: 190, fontWeight: 600, lineHeight: 0.95, letterSpacing: -4 }}>{r.score}</span>
            <span style={{ color: OG_COLORS.paper, fontSize: title.length > 36 ? 40 : 52, fontWeight: 600, fontStyle: "italic", lineHeight: 1.1, marginTop: 8 }}>
              on {title}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 28 }}>
            {r.tested > 0 && (
              <span style={{ color: OG_COLORS.paper }}>
                {r.mastered} of {r.tested} ideas mastered
              </span>
            )}
            <span style={{ color: OG_COLORS.ribbon }}>Map your own book</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flex: 1 }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <img src={mapPageDataUri(outcomes)} width={400} height={324} />
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
