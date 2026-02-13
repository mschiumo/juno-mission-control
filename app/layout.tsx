import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
      <head>
        {/* Intergram Config - MUST be in head before widget script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.intergramId = "8080305413";
              window.intergramCustomizations = {
                titleClosed: 'Chat with Juno',
                titleOpen: 'Juno - Mission Control',
                introMessage: "Hey MJ! I'm Juno, your AI assistant. How can I help you today? 🪐",
                autoResponse: "I'll get back to you shortly...",
                autoNoResponse: "I'm processing your request. One moment please.",
                mainColor: '#ff6b35',
                alwaysUseFloatingButton: true
              };
            `
          }}
        />
        {/* Intergram Widget Script */}
        <script async src="https://www.intergram.xyz/js/widget.js"></script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0d1117] text-[#e6edf3] min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}