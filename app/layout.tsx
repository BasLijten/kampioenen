import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PSV Kampioen Countdown",
  description: "Wanneer wordt PSV kampioen?",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
