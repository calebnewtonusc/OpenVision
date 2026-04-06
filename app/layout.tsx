import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "OpenVision — Spatial Computing in Your Browser",
  description:
    "Apple Vision Pro-style spatial computing. Eye tracking, hand tracking, and spatial UI — running entirely in your browser. No headset required.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased bg-zinc-950 text-white">
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
