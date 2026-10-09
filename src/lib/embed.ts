import { themeVars, type Theme } from "./design";

export type EmbedSnippets = {
  /** Bookingen vist direkte på en side af salonens hjemmeside. */
  inline: string;
  /** En "Book tid"-knap, der åbner bookingen i et vindue oven på siden. */
  button: string;
  /** En almindelig ramme til hjemmesider, der ikke tillader scripts. Vokser ikke med indholdet. */
  iframe: string;
  /** Adressen til bookingsiden, til Facebook, Instagram og Google. */
  link: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Koden salonen kopierer ind på sin egen hjemmeside. Knappen får salonens egen farve og hjørner. */
export function embedSnippets(origin: string, salon: { slug: string; name: string }, theme: Theme): EmbedSnippets {
  const base = origin.replace(/\/$/, "");
  const link = `${base}/book/${encodeURIComponent(salon.slug)}`;
  const script = `<script src="${base}/embed.js" async></script>`;
  const vars = themeVars(theme);
  const buttonStyle = [
    "display:inline-block",
    "padding:12px 22px",
    `background:${vars["--accent"]}`,
    `color:${vars["--accent-text"]}`,
    `border-radius:${vars["--radius"]}`,
    "font:600 16px/1.2 system-ui,sans-serif",
    "text-decoration:none",
  ].join(";");
  return {
    inline: `<div data-frisor-booking="${esc(salon.slug)}"></div>\n${script}`,
    button: `<a href="${link}" data-frisor-booking-popup style="${buttonStyle}">Book tid</a>\n${script}`,
    iframe: `<iframe src="${link}" title="Book tid hos ${esc(salon.name)}" style="width:100%;height:900px;border:0"></iframe>`,
    link,
  };
}
