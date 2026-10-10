import { ImageResponse } from "next/og";
import { MARK_DATA_URI, OG_COLORS } from "@/lib/server/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: OG_COLORS.ink }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img src={MARK_DATA_URI} width={136} height={136} />
      </div>
    ),
    size
  );
}
