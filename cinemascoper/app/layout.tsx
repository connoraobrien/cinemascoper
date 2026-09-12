import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Oswald } from "next/font/google";
import "./globals.css";

// A condensed, cinema-marquee-flavoured display face for the wordmark only
// (body text stays the default Tailwind sans stack) — see the new
// `ScopeReelLogo` mark in components/Icons.tsx for the rest of the
// refreshed header treatment.
const displayFont = Oswald({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "CinemaScoper",
  description: "Personal Australian cinema tracker: release radar, cinema tracking matrix, and session-time alerts.",
  appleWebApp: { title: "CinemaScoper", statusBarStyle: "black-translucent" },
};

// Matches the app's own background so Safari's toolbar (and any other
// browser chrome that respects this) blends in with the page instead of
// showing a mismatched default colour.
export const viewport: Viewport = {
  themeColor: "#0a0a0c",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU" className={`dark ${displayFont.variable}`}>
      <body className="min-h-screen bg-base-950 text-base-100 font-sans antialiased">{children}</body>
    </html>
  );
}
