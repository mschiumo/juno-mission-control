import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import IntergramWidget from "@/components/IntergramWidget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Juno Mission Control",
  description: "Personal dashboard for mission control",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0d1117] text-[#e6edf3] min-h-screen`}
      >
        {children}
        
        {/* Intergram Chat Widget */}
        <IntergramWidget />
      </body>
    </html>
  );
}
