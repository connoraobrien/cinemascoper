import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "CinemaScoper",
  description: "Personal Australian cinema tracker: release radar, cinema tracking matrix, and session-time alerts.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU" className="dark">
      <body className="min-h-screen bg-base-950 text-base-100 font-sans antialiased">{children}</body>
    </html>
  );
}
