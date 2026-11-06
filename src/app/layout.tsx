import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Schibsted_Grotesk } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { LiveLogoBadge, LogoBadge } from "@/components/logo-badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "@/lib/site";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz", "wdth"],
});

const body = Schibsted_Grotesk({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
});

/** Site-wide defaults; pages add canonical URLs and live share images. */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME}: ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "news",
  keywords: [
    "NZ election 2026",
    "New Zealand election results",
    "election night",
    "live results",
    "electorate results",
    "party vote",
    "MMP",
    "Parliament",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_NZ",
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f2ff" },
    { media: "(prefers-color-scheme: dark)", color: "#14133a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-NZ"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 sm:px-6">
            {children}
          </main>
          <SiteFooter />
        </TooltipProvider>
        <Analytics />
      </body>
    </html>
  );
}

function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 pt-5 pb-4 sm:px-6">
      <Link
        href="/"
        className="group flex items-center gap-2 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4"
        aria-label="SixtyOne home"
      >
        {/* The shell shows "61"; the live badge swaps in "62*" if an
            overhang raises the bar. */}
        <Suspense fallback={<LogoBadge />}>
          <LiveLogoBadge />
        </Suspense>
        <span className="hidden font-display text-2xl font-extrabold tracking-tight [font-stretch:90%] min-[420px]:inline">
          SixtyOne
        </span>
      </Link>
      <nav className="flex items-center gap-1 text-sm font-medium">
        <NavLink href="/">Results</NavLink>
        <NavLink href="/electorates">Electorates</NavLink>
        <NavLink href="/about">About</NavLink>
      </nav>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="rounded-full px-2.5 py-1.5 text-muted-foreground sm:px-3 transition-colors hover:bg-secondary hover:text-foreground"
    >
      {children}
    </Link>
  );
}

function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-7xl px-4 pb-10 text-sm text-muted-foreground sm:px-6">
      <p className="max-w-prose">
        Results from the{" "}
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href="https://media.election.net.nz/xml/"
        >
          Electoral Commission media feed
        </a>
        . Election-night results are preliminary: special votes are counted over
        the following weeks. Boundaries: Stats NZ / Representation Commission
        2025 (CC BY 4.0). SixtyOne is an independent project, not affiliated
        with the Electoral Commission.
      </p>
    </footer>
  );
}
