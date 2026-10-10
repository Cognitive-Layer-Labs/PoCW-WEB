import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE = (process.env.AUTH_URL || "https://bookmap.baghici.com").replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Bookmap: see what stayed with you from a book", template: "%s | Bookmap" },
  description:
    "Bring a book you've read. Bookmap draws a map of its ideas and asks you a few questions, so you can see what you really took in.",
  applicationName: "Bookmap",
  openGraph: {
    title: "Bookmap",
    description: "Turn a book you've read into a map of its ideas, then test yourself on it.",
    url: SITE,
    siteName: "Bookmap",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#1B1026",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
