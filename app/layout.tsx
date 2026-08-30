import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

/** Set NEXT_PUBLIC_SITE_URL on preview deploys so their cards point at them. */
export const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.vgcstandings.com";

const DESCRIPTION =
  "Live Pokémon VGC standings with every player's team on the row. Records, " +
  "resistances, usage and the top cut, updated round by round from regionals, " +
  "internationals and Worlds.";

/**
 * Page-level `generateMetadata` overrides the title, description and card for
 * whichever event you're looking at. What's left here is the fallback and the
 * things that never change.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "VGC Standings — live Pokémon VGC results and teams",
    template: "%s · VGC Standings",
  },
  description: DESCRIPTION,
  applicationName: "VGC Standings",
  keywords: [
    "VGC standings",
    "Pokémon VGC",
    "VGC results",
    "VGC usage",
    "regional championships",
    "Pokémon Worlds",
    "team lists",
    "Swiss pairings",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "VGC Standings",
    locale: "en",
    url: "/",
    title: "VGC Standings — live Pokémon VGC results and teams",
    description: DESCRIPTION,
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "VGC Standings" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "VGC Standings — live Pokémon VGC results and teams",
    description: DESCRIPTION,
    images: ["/api/og"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* A stored theme choice has to land before the first paint, or a
            reader who picked light on a dark machine gets a dark page for the
            frame or two until React mounts. Nothing else may go in here — the
            key belongs to `useTheme`, and no key at all means the palette
            follows prefers-color-scheme, which is the default path. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('pokedata-demo:theme');" +
              "if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}",
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;600;650&display=swap"
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
