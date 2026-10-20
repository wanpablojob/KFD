import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * The link preview for Messenger and Facebook shares.
 *
 * Generated rather than a bitmap so it uses the live brand colours and stays
 * crisp at any size: brand red with the round badge, the same pairing the app
 * opens on, so a shared link already looks like KFD.
 */
export const alt = "KFD: Pagkaing Kabankalan, hatid sa pinto mo.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const badge = await readFile(join(process.cwd(), "public/images/kabankalan/badge.png"));
  const badgeSrc = `data:image/png;base64,${badge.toString("base64")}`;
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
          { }
          <img src={badgeSrc} width={96} height={96} alt="" />
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
          <span>Cash or GCash on delivery</span>
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
