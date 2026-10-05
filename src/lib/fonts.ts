import { Cormorant_Garamond, Inter, Nunito, Oswald, Playfair_Display } from "next/font/google";
import type { FontKey } from "./design";

// Skrifterne hentes ved build og ligger på vores eget domæne, så kundens IP ikke sendes til Google.
// preload: false, så en skrift kun hentes på de bookingsider, der bruger den.
const inter = Inter({ subsets: ["latin"], display: "swap", preload: false });
const nunito = Nunito({ subsets: ["latin"], display: "swap", preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "700"], display: "swap", preload: false });
const oswald = Oswald({ subsets: ["latin"], display: "swap", preload: false });

const SYSTEM = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const FAMILIES: Record<FontKey, string> = {
  system: SYSTEM,
  inter: `${inter.style.fontFamily}, ${SYSTEM}`,
  nunito: `${nunito.style.fontFamily}, ${SYSTEM}`,
  playfair: `${playfair.style.fontFamily}, Georgia, serif`,
  cormorant: `${cormorant.style.fontFamily}, Georgia, serif`,
  oswald: `${oswald.style.fontFamily}, "Arial Narrow", ${SYSTEM}`,
};

export function fontFamily(key: FontKey): string {
  return FAMILIES[key] ?? SYSTEM;
}
