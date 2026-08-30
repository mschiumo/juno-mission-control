import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import UsageTracker from "@/components/UsageTracker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// IBM Plex powers the Agentic Trading terminal (components/confluence): Sans
// for labels/prose, Mono for every numeral (tabular alignment is the point).
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

// Absolute base for og:image and twitter:image meta tags. Social crawlers
// (iMessage, older Slack/Discord, etc.) don't resolve relative image URLs,
// so without this they emit `/opengraph-image` and the share preview is empty.
// Vercel sets VERCEL_PROJECT_PRODUCTION_URL automatically on prod builds;
// fall back to the configured custom domain.
const productionUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://confluencetrading.app');

export const metadata: Metadata = {
  metadataBase: new URL(productionUrl),
  title: "Confluence Trading",
  description: "Your disciplined trading command center",
  openGraph: {
    title: "Confluence Trading",
    description: "Your disciplined trading command center",
    siteName: "Confluence Trading",
    type: "website",
    url: productionUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Confluence Trading",
    description: "Your disciplined trading command center",
  },
};

// Mobile viewport: scale to device width, respect notch safe areas (iPhone),
// and allow user zoom for accessibility. Affects only how the page maps to the
// device viewport — desktop layout is unchanged.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${plexSans.variable} ${plexMono.variable} antialiased bg-[#0d1117] text-[#e6edf3] min-h-screen`}
      >
        <SessionProvider>
          {/* Suspense: UsageTracker reads useSearchParams, which would
              otherwise force the whole tree into client-side rendering. */}
          <Suspense fallback={null}>
            <UsageTracker />
          </Suspense>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
