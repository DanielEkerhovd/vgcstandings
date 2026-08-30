import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VGC Standings — Pokédata demo",
  description:
    "A small Next.js app that reads live Pokémon VGC standings from pokedata.ovh.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;600;650&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
