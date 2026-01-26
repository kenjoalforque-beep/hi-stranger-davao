import { Chewy } from "next/font/google";

import type { Metadata } from "next";
import "./globals.css";

const chewy = Chewy({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-chewy",
});

export const metadata: Metadata = {
  title: "Hi, Stranger",
  description: "Anonymous 1-on-1 chat. No history.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={chewy.variable}>
      <body>{children}</body>
    </html>
  );
}
