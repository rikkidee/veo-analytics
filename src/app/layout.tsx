import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import AppNav from "@/components/AppNav";
import ImportRunner from "@/components/import/ImportRunner";
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
  title: "Veo Analytics",
  description: "Multi-team soccer stats built from your Veo match reports.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-40 border-b border-neutral-800 bg-[#0d1117]">
          <nav className="flex h-14 items-center gap-1 overflow-x-auto px-4 text-sm [scrollbar-width:none]">
            <Suspense
              fallback={
                <Link href="/" className="font-semibold text-neutral-100">
                  Veo Analytics
                </Link>
              }
            >
              <AppNav />
            </Suspense>
          </nav>
        </header>
        <ImportRunner>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
            {children}
          </main>
        </ImportRunner>
      </body>
    </html>
  );
}
