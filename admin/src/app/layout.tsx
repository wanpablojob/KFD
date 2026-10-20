import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { SITE_URL } from "@/lib/site-url";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * The brand's display face, for landing headings only. A soft, warm serif reads
 * as home cooking and sits well beside the round red badge; Geist stays the body
 * and dashboard face. next/font self-hosts it, so there is no runtime CDN call.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "KFD Admin — Kabankalan Food Delivery",
  description:
    "Operations dashboard for the Kabankalan City Food Delivery platform.",
  applicationName: "KFD Admin",
  // Icons come from the app/ file conventions: favicon.ico, icon.png, apple-icon.png.
  openGraph: {
    title: "KFD Admin",
    description: "Operations dashboard for KFD.",
    siteName: "KFD Admin",
    type: "website",
  },
};

const themeInit = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark");}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}