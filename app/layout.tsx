import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
