import type { Metadata, Viewport } from "next";
import "./globals.css";
import { manrope } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Frisør Booking",
  description: "Book tid hos din frisør på under et minut. Ingen app, intet login.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
