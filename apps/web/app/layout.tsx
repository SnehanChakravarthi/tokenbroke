import { BRAND } from "@tokenbroke/shared";
import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { CodexMarkDefs } from "./components/icons";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  weight: ["500", "700", "800", "900"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.siteUrl),
  title: `${BRAND.name} · the most rate-limited developers alive`,
  description:
    "A community leaderboard of the most rate-limited AI coding tool users alive. Real local usage data, one command, zero signup.",
  openGraph: {
    siteName: BRAND.name,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
      <body className="console-surface min-h-screen">
        <CodexMarkDefs />
        {children}
      </body>
    </html>
  );
}
