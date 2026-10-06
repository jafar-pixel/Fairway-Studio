import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { JLInfluenceFooter } from "@/components/jl-influence-footer";

export const metadata: Metadata = {
  title: "Fairway Studio — Golf, First",
  description:
    "Fairway Studio by JL Influence: a shared golf-first creative workspace for Jafar and Liz.",
  generator: "v0.app",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Fairway Studio",
  },
  icons: { icon: "/pwa/icon-192.png", apple: "/pwa/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f4f3ed",
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
    <html lang="en" className="light bg-background">
      <body className="antialiased">
        {children}
        <JLInfluenceFooter />
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}
