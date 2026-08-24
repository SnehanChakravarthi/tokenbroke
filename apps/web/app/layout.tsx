import { BRAND } from "@tokenbroke/shared";
import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

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
  title: `${BRAND.name} — the most rate-limited developers alive`,
  description:
    "A community leaderboard of the most rate-limited AI coding tool users alive. Real local usage data, one command, zero signup.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Default is light; apply stored dark preference before paint. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: three-line theme bootstrap, no user input
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("tokenbroke-theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body className="console-surface min-h-screen">{children}</body>
    </html>
  );
}
