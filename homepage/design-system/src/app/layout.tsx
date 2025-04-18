import type { Metadata } from "next";
import "./globals.css";

import { Manrope } from "next/font/google";
import { Inter } from "next/font/google";
import localFont from "next/font/local";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const commitMono = localFont({
  src: [
    {
      path: "../../fonts/CommitMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../fonts/CommitMono-Regular.woff",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-commit-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jazz Design System by Garden Computing, Inc",
  description: "Jazz Design System by Garden Computing, Inc",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        className={[
          manrope.variable,
          commitMono.variable,
          inter.className,
          "h-full",
          "bg-white text-stone-700 dark:text-stone-400 dark:bg-stone-950",
        ].join(" ")}
      >
        {children}
      </body>
    </html>
  );
}
