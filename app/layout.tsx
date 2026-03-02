import type { Metadata, Viewport } from "next";
import { Oswald, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { resolveConfig, formatTemplate, getSiteUrl } from "@/config/env";
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

const { league, club, texts } = resolveConfig();

const templateVars = {
  clubName: club.name,
  clubShortName: club.shortName,
  leagueName: league.name,
  season: league.season,
};

export const viewport: Viewport = {
  themeColor: club.primaryColor,
};

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  alternates: {
    canonical: "/",
  },
  title: formatTemplate(texts.metaTitleTemplate, templateVars),
  description: formatTemplate(texts.metaDescriptionTemplate, templateVars),
  applicationName: formatTemplate(texts.schemaName, templateVars),
  authors: [{ name: "Bas Lijten" }],
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: "BeTa41y1AwjDg_P9stRe828gB5I5ceN6h2A5Tjvo2_E",
  },
  openGraph: {
    title: formatTemplate(texts.ogTitleTemplate, templateVars),
    description: formatTemplate(texts.ogDescriptionTemplate, templateVars),
    type: "website",
    locale: league.locale.replace("-", "_"),
  },
  twitter: {
    card: "summary_large_image",
    title: formatTemplate(texts.ogTitleTemplate, templateVars),
    description: formatTemplate(texts.ogDescriptionTemplate, templateVars),
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: formatTemplate(texts.schemaName, templateVars),
  description: formatTemplate(texts.schemaDescription, templateVars),
  url: getSiteUrl(),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang={league.language}
      className={`${oswald.variable} ${dmSans.variable}`}
      style={{
        '--club-primary': club.primaryColor,
        '--club-primary-deep': club.primaryColorDeep,
        '--club-primary-glow': club.primaryColorGlow,
      } as React.CSSProperties}
    >
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <Analytics />
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        )}
      </body>
    </html>
  );
}
