import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
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
 * The brand's display face, for landing headings only. A chunky, friendly
 * grotesque reads as street food and sits well beside the round red badge;
 * its optical-size axis tightens it at headline sizes. Geist stays the body
 * and dashboard face. next/font self-hosts it, so there is no runtime CDN call.
 */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz", "wdth"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Meriendash Admin",
  description:
    "Operations dashboard for the Kabankalan City Food Delivery platform.",
  applicationName: "Meriendash Admin",
  // Icons come from the app/ file conventions: favicon.ico, icon.png, apple-icon.png.
  openGraph: {
    title: "Meriendash Admin",
    description: "Operations dashboard for Meriendash.",
    siteName: "Meriendash Admin",
    type: "website",
  },
};

const themeInit = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark");}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
