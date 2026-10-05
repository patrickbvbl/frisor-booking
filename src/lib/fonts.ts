import { Atkinson_Hyperlegible_Next, Cormorant_Garamond, Inter, Nunito, Oswald, Playfair_Display, Young_Serif } from "next/font/google";
import type { FontKey } from "./design";

// Skrifterne hentes ved build og ligger på vores eget domæne, så kundens IP ikke sendes til Google.
// preload: false, så en skrift kun hentes på de bookingsider, der bruger den.
const inter = Inter({ subsets: ["latin"], display: "swap", preload: false });
const nunito = Nunito({ subsets: ["latin"], display: "swap", preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "700"], display: "swap", preload: false });
const oswald = Oswald({ subsets: ["latin"], display: "swap", preload: false });
const youngSerif = Young_Serif({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin"], display: "swap", preload: false });

const SYSTEM = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const FAMILIES: Record<FontKey, string> = {
  system: SYSTEM,
  inter: `${inter.style.fontFamily}, ${SYSTEM}`,
  nunito: `${nunito.style.fontFamily}, ${SYSTEM}`,
  playfair: `${playfair.style.fontFamily}, Georgia, serif`,
  cormorant: `${cormorant.style.fontFamily}, Georgia, serif`,
  oswald: `${oswald.style.fontFamily}, "Arial Narrow", ${SYSTEM}`,
  youngserif: `${youngSerif.style.fontFamily}, Georgia, serif`,
  atkinson: `${atkinson.style.fontFamily}, ${SYSTEM}`,
};

// Skrifter der kun findes i én vægt. Overskrifter i dem må ikke gøres fede, for så tegner browseren en grim falsk fed.
const SINGLE_WEIGHT: FontKey[] = ["youngserif"];

export function fontFamily(key: FontKey): string {
  return FAMILIES[key] ?? SYSTEM;
}

export function headingWeight(key: FontKey): number {
  return SINGLE_WEIGHT.includes(key) ? 400 : 700;
}
