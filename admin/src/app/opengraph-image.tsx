import { ImageResponse } from "next/og";

/**
 * The link preview for Messenger and Facebook shares.
 *
 * Generated rather than a bitmap so it uses the live brand colours and stays
 * crisp at any size. It is a marketing card, deliberately not a photo: the
 * page ships no stock imagery.
 */
export const alt = "KFD — Pagkaing Kabankalan, hatid sa pinto mo.";
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
          backgroundColor: "#A3130A",
          color: "#FFF8E7",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 28,
              height: 28,
              backgroundColor: "#ECC97B",
            }}
          />
          <div style={{ fontSize: 34, letterSpacing: 2 }}>KFD</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>
            Pagkaing Kabankalan,
          </div>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>
            hatid sa pinto mo.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 28,
            fontSize: 28,
            color: "#F6DDD6",
          }}
        >
          <span>Cash on delivery</span>
          <span>·</span>
          <span>Kabankalan only</span>
          <span>·</span>
          <span>Track your rider</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
