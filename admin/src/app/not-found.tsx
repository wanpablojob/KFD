import Link from "next/link";
import { PixelScooter } from "@/components/pixel/sprites-render";
import "./pixel.css";

/**
 * The custom 404. A root not-found.tsx handles every unmatched URL, so this is
 * the page a mistyped link lands on. It reuses the marketing pixel language
 * rather than the dashboard shell, because most bad links come from customers.
 */
export default function NotFound() {
  return (
    <div className="pixel-page pixel-scanlines flex min-h-dvh flex-col items-center justify-center gap-8 px-6 text-center">
      <div aria-hidden="true" className="pixel-checker pixel-card p-8">
        <PixelScooter title="" />
      </div>
      <div className="flex flex-col gap-3">
        <p className="pixel-eyebrow">Error 404</p>
        <h1 className="pixel-title text-3xl font-bold sm:text-4xl">
          Wala kami mahanap dito.
        </h1>
        <p className="pixel-body text-sm">
          The page you were looking for does not exist, or the link was mistyped.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        <Link href="/" className="pixel-btn pixel-btn-primary pixel-focus">
          Back to home
        </Link>
        <Link href="/track" className="pixel-btn pixel-btn-secondary pixel-focus">
          Track an order
        </Link>
      </div>
    </div>
  );
}
