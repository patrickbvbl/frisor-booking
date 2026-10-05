import { randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * Salonens eget design af bookingsiden. Siden består af blokke i den rækkefølge salonen vælger,
 * og et tema med farver, skrift og hjørner. Gemmes som JSON på salonen (salons.design).
 */

export const FONTS = {
  manrope: "Premium (Manrope)",
  youngserif: "Skilt (Young Serif)",
  atkinson: "Letlæst (Atkinson Hyperlegible)",
  system: "Systemets egen",
  inter: "Moderne (Inter)",
  nunito: "Rund (Nunito)",
  playfair: "Klassisk (Playfair Display)",
  cormorant: "Elegant (Cormorant Garamond)",
  oswald: "Kraftig (Oswald)",
} as const;
export type FontKey = keyof typeof FONTS;
const fontKey = z.enum(Object.keys(FONTS) as [FontKey, ...FontKey[]]);

export const CORNERS = { round: "Runde", soft: "Bløde", square: "Skarpe" } as const;
export type Corners = keyof typeof CORNERS;

const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const text = (max: number) => z.string().max(max).default("");
const imageId = z.number().int().positive().nullable().default(null);

export const BLOCKS = {
  hero: {
    label: "Forside med logo og billede",
    schema: z.object({ title: text(80), subtitle: text(160), logoId: imageId, imageId }),
  },
  text: {
    label: "Tekst",
    schema: z.object({ heading: text(80), body: text(2000) }),
  },
  notice: {
    label: "Besked (fx ferie eller tilbud)",
    schema: z.object({ body: text(400) }),
  },
  services: {
    label: "Ydelser og kategorier",
    schema: z.object({
      heading: text(80),
      // Viser kategorierne som knapper øverst, så kunden hurtigt kan hoppe til fx Børneklip.
      tabs: z.boolean().default(true),
      showDuration: z.boolean().default(true),
      showPrices: z.boolean().default(true),
    }),
  },
  staff: {
    label: "Medarbejdere",
    schema: z.object({ heading: text(80), intro: text(400) }),
  },
  hours: {
    label: "Åbningstider",
    schema: z.object({ heading: text(80) }),
  },
  contact: {
    label: "Kontakt og adresse",
    schema: z.object({ heading: text(80), showMap: z.boolean().default(true) }),
  },
} as const;

export type BlockType = keyof typeof BLOCKS;
export const BLOCK_TYPES = Object.keys(BLOCKS) as BlockType[];

export type BlockProps<T extends BlockType> = z.infer<(typeof BLOCKS)[T]["schema"]>;
export type Block = { [T in BlockType]: { id: string; type: T; hidden: boolean; props: BlockProps<T> } }[BlockType];

export type Theme = {
  accent: string;
  background: string;
  headingFont: FontKey;
  bodyFont: FontKey;
  corners: Corners;
};

export type Design = { theme: Theme; blocks: Block[] };

export const DEFAULT_THEME: Theme = {
  accent: "#1e1b18",
  background: "#f4efe6",
  headingFont: "manrope",
  bodyFont: "manrope",
  corners: "soft",
};

/** Færdige farvesæt, så salonen ikke behøver at vælge farver selv. */
export const PALETTES: { name: string; accent: string; background: string }[] = [
  { name: "Blæk på papir", accent: "#1e1b18", background: "#f4efe6" },
  { name: "Grøn", accent: "#1f5f4a", background: "#faf8f5" },
  { name: "Sort og hvid", accent: "#111111", background: "#ffffff" },
  { name: "Rosa", accent: "#b03a64", background: "#fdf4f6" },
  { name: "Blå", accent: "#1d4ed8", background: "#f5f8ff" },
  { name: "Guld på sort", accent: "#d4a64a", background: "#141414" },
  { name: "Terrakotta", accent: "#b4532a", background: "#fbf3ec" },
];

const themeSchema = z.object({
  accent: color.catch(DEFAULT_THEME.accent),
  background: color.catch(DEFAULT_THEME.background),
  headingFont: fontKey.catch(DEFAULT_THEME.headingFont),
  bodyFont: fontKey.catch(DEFAULT_THEME.bodyFont),
  corners: z.enum(["round", "soft", "square"]).catch(DEFAULT_THEME.corners),
});

export const imageUrl = (id: number) => `/billeder/${id}`;

export function newBlockId() {
  return randomBytes(4).toString("hex");
}

export function makeBlock<T extends BlockType>(type: T, props: Partial<BlockProps<T>> = {}, id = newBlockId()): Block {
  return { id, type, hidden: false, props: BLOCKS[type].schema.parse(props) } as Block;
}

export function defaultDesign(): Design {
  return {
    theme: { ...DEFAULT_THEME },
    blocks: [
      makeBlock("hero", {}, "forside"),
      makeBlock("services", { heading: "Hvad skal du have lavet?" }, "ydelser"),
      makeBlock("hours", { heading: "Åbningstider" }, "aabningstider"),
      makeBlock("contact", { heading: "Find os" }, "kontakt"),
    ],
  };
}

/**
 * Læser et gemt design. Ukendte blokke og ugyldige felter springes over i stedet for at fejle,
 * så bookingsiden altid kan vises. Ydelsesblokken findes altid præcis én gang, da kunden ellers ikke kan booke.
 */
export function parseDesign(raw: unknown): Design {
  if (!raw || typeof raw !== "object") return defaultDesign();
  const r = raw as { theme?: unknown; blocks?: unknown };
  const theme = themeSchema.parse({ ...DEFAULT_THEME, ...(r.theme && typeof r.theme === "object" ? r.theme : {}) });
  const blocks: Block[] = [];
  const seen = new Set<string>();
  for (const b of Array.isArray(r.blocks) ? r.blocks : []) {
    if (!b || typeof b !== "object") continue;
    const { id, type, hidden, props } = b as Record<string, unknown>;
    if (typeof type !== "string" || !(type in BLOCKS)) continue;
    if (type === "services" && blocks.some((x) => x.type === "services")) continue;
    const parsed = BLOCKS[type as BlockType].schema.safeParse(props ?? {});
    if (!parsed.success) continue;
    const blockId = typeof id === "string" && /^[a-z0-9-]{1,40}$/.test(id) && !seen.has(id) ? id : newBlockId();
    seen.add(blockId);
    blocks.push({ id: blockId, type, hidden: type === "services" ? false : hidden === true, props: parsed.data } as Block);
  }
  if (!blocks.some((b) => b.type === "services")) blocks.push(makeBlock("services", { heading: "Hvad skal du have lavet?" }));
  return { theme, blocks };
}

export function moveBlock(design: Design, id: string, dir: "up" | "down"): Design {
  const i = design.blocks.findIndex((b) => b.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= design.blocks.length) return design;
  const blocks = [...design.blocks];
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  return { ...design, blocks };
}

export function removeBlock(design: Design, id: string): Design {
  return { ...design, blocks: design.blocks.filter((b) => b.id !== id || b.type === "services") };
}

export function addBlock(design: Design, type: BlockType): Design {
  if (type === "services" && design.blocks.some((b) => b.type === "services")) return design;
  return { ...design, blocks: [...design.blocks, makeBlock(type)] };
}

/** Opdaterer en bloks felter. Felter der ikke er med i props beholder deres værdi. */
export function updateBlock(design: Design, id: string, props: Record<string, unknown>, hidden?: boolean): Design {
  return {
    ...design,
    blocks: design.blocks.map((b) => {
      if (b.id !== id) return b;
      const parsed = BLOCKS[b.type].schema.safeParse({ ...b.props, ...props });
      return {
        ...b,
        hidden: b.type === "services" ? false : (hidden ?? b.hidden),
        props: parsed.success ? parsed.data : b.props,
      } as Block;
    }),
  };
}

export function updateTheme(design: Design, theme: Partial<Theme>): Design {
  return { ...design, theme: themeSchema.parse({ ...design.theme, ...theme }) };
}

// Farver

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relativ luminans efter WCAG. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function isDark(hex: string) {
  return luminance(hex) < 0.2;
}

const RADII: Record<Corners, string> = { round: "16px", soft: "6px", square: "2px" };

/**
 * CSS-variabler til bookingsiden ud fra salonens to farver. Resten afledes, så tekst altid er til at læse:
 * tekstfarven følger baggrunden, og knaptekst bliver sort eller hvid efter hvad der giver bedst kontrast.
 */
export function themeVars(theme: Theme): Record<string, string> {
  const dark = isDark(theme.background);
  const text = dark ? "#f4f1ec" : "#1d1b19";
  const mix = (pct: number, a: string, b: string) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
  // En accentfarve, der ligner baggrunden for meget, kan ikke bruges til links. Så bruges tekstfarven.
  const accent = contrast(theme.accent, theme.background) >= 2.5 ? theme.accent : text;
  return {
    "--bg": theme.background,
    "--surface": dark ? mix(92, theme.background, "#ffffff") : mix(30, theme.background, "#ffffff"),
    "--text": text,
    "--muted": mix(62, text, theme.background),
    "--line": mix(14, text, theme.background),
    "--accent": accent,
    "--accent-soft": mix(14, accent, theme.background),
    "--accent-text": contrast("#ffffff", accent) >= contrast("#111111", accent) ? "#ffffff" : "#111111",
    "--radius": RADII[theme.corners],
    // Tynde linjer i stedet for skygger. Bløde skygger på alt er et af de tydeligste tegn på skabelon-design.
    "--shadow": "none",
    colorScheme: dark ? "dark" : "light",
  };
}

// Åbningstider

export type OpeningDay = { weekday: number; ranges: [number, number][] };

/** Salonens åbningstider ud fra medarbejdernes arbejdstider: åbent når mindst én arbejder. */
export function openingHours(hours: { weekday: number; startMin: number; endMin: number }[]): OpeningDay[] {
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const sorted = hours
      .filter((h) => h.weekday === weekday && h.endMin > h.startMin)
      .map((h) => [h.startMin, h.endMin] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const ranges: [number, number][] = [];
    for (const [s, e] of sorted) {
      const last = ranges.at(-1);
      if (last && s <= last[1]) last[1] = Math.max(last[1], e);
      else ranges.push([s, e]);
    }
    return { weekday, ranges };
  });
}

// Kategorier

export type CategoryGroup<S> = { id: number | null; name: string; description: string | null; services: S[] };

/**
 * Grupperer ydelser efter kategori i salonens rækkefølge. Ydelser uden kategori kommer sidst under "Andet",
 * eller uden overskrift, hvis salonen slet ikke bruger kategorier. Tomme kategorier vises ikke.
 */
export function groupServices<S extends { categoryId: number | null; position: number; id: number }>(
  services: S[],
  categories: { id: number; name: string; description: string | null; position: number }[],
): CategoryGroup<S>[] {
  const byOrder = (a: { position: number; id: number }, b: { position: number; id: number }) => a.position - b.position || a.id - b.id;
  const sortedServices = [...services].sort(byOrder);
  const known = new Set(categories.map((c) => c.id));
  const groups: CategoryGroup<S>[] = [...categories].sort(byOrder).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    services: sortedServices.filter((s) => s.categoryId === c.id),
  }));
  const rest = sortedServices.filter((s) => s.categoryId === null || !known.has(s.categoryId));
  if (rest.length) groups.push({ id: null, name: groups.length ? "Andet" : "", description: null, services: rest });
  return groups.filter((g) => g.services.length > 0);
}
