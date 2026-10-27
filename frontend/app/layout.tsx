import type { Metadata } from "next";
import Link from "next/link";
import { DemoBanner } from "@/components/DemoBanner";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Eval Harness",
  description: "A report card for your AI prompts: test, grade, compare and catch regressions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="inner">
            <Link href="/" className="brand">LLM Eval Harness</Link>
            <Nav />
          </div>
        </header>
        <DemoBanner />
        <main>{children}</main>
      </body>
    </html>
  );
}
