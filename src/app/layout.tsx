import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://extinction-dash.vercel.app"),
  title: "Sixth Mass Extinction Watch",
  description:
    "A living record of what we are losing. Conservation status from the IUCN Red List, abundance trends from the Living Planet Index, and biomass scale from Bar-On et al. 2018 — with measured facts kept separate from modelled projections.",
  keywords: ["extinction", "IUCN Red List", "Living Planet Index", "biodiversity", "conservation", "endangered species"],
  authors: [{ name: "Coen de With" }],
  openGraph: {
    title: "Sixth Mass Extinction Watch",
    description: "A living record of what we are losing — measured facts kept honestly separate from modelled projections.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sixth Mass Extinction Watch",
    description: "A living record of what we are losing.",
  },
};

export const viewport: Viewport = {
  themeColor: "#101913",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..500&family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css" />
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/bold/style.css" />
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
