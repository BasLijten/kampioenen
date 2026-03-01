import type { Metadata, Viewport } from "next";
import { Oswald, DM_Sans } from "next/font/google";
import "./globals.css";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-body",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#E8001C",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://psvkampioen.nl"),
  alternates: {
    canonical: "/",
  },
  title: "PSV Kampioen 2025/26 — Wanneer wordt PSV Eredivisie kampioen?",
  description:
    "Monte Carlo simulatie met 50.000 scenario's berekent wanneer PSV Eindhoven Eredivisie kampioen 2025/26 wordt. Bekijk kansen per speelronde, best case scenario en de huidige stand.",
  applicationName: "PSV Kampioen",
  authors: [{ name: "Bas Lijten" }],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "PSV Kampioen 2025/26 — Wanneer wordt PSV Eredivisie kampioen?",
    description:
      "Monte Carlo simulatie met 50.000 scenario's berekent wanneer PSV kampioen wordt. Kansen per speelronde, best case scenario en live stand.",
    type: "website",
    locale: "nl_NL",
  },
  twitter: {
    card: "summary_large_image",
    title: "PSV Kampioen 2025/26 — Wanneer wordt PSV Eredivisie kampioen?",
    description:
      "Monte Carlo simulatie met 50.000 scenario's berekent wanneer PSV kampioen wordt.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "PSV Kampioen 2025/26",
  description:
    "Monte Carlo simulatie berekent wanneer PSV Eindhoven Eredivisie kampioen 2025/26 wordt.",
  url: "https://psvkampioen.nl",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${oswald.variable} ${dmSans.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
