import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://pocw.baghici.com"),
  title: "PoCW: find out how well you understood a document",
  description:
    "Drop in a PDF, notes or a link. PoCW maps its ideas into a knowledge graph, asks adaptive questions, and estimates how much you've grasped.",
  openGraph: {
    title: "PoCW, Proof of Cognitive Work",
    description: "Turn any document into a knowledge graph and an adaptive test of how well you understood it.",
    url: "https://pocw.baghici.com",
    siteName: "PoCW",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#150D1C",
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
        <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
            <Link href="/" className="flex items-center gap-2.5" aria-label="PoCW home">
              <Image src="/logo.png" alt="" width={34} height={34} priority className="h-[34px] w-[34px]" />
              <span className="font-display text-lg font-bold tracking-tight">PoCW</span>
              <span className="hidden text-sm text-mute md:inline">Proof of Cognitive Work</span>
            </Link>
            <nav aria-label="Page sections" className="flex items-center gap-5 text-sm">
              <a href="#how-it-works" className="text-mute hover:text-paper">
                How it works
              </a>
              <a href="#fine-print" className="hidden text-mute hover:text-paper sm:inline">
                What the score means
              </a>
            </nav>
          </div>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
