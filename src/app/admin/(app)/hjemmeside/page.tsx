import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { appUrl } from "@/lib/booking";
import { parseDesign } from "@/lib/design";
import { embedSnippets } from "@/lib/embed";
import { CopyCode } from "./copy-code";

export const metadata = { title: "Hjemmeside" };

/** En lille falsk hjemmeside med koden sat ind, så salonen kan se resultatet, før den kopierer. */
function previewDoc(salonName: string, snippet: string) {
  const name = salonName.replace(/</g, "&lt;");
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font:16px/1.5 Georgia,serif;color:#222;background:#fff}header{padding:16px 24px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:center}
header nav{font:14px system-ui,sans-serif;color:#777;display:flex;gap:16px}main{padding:24px;max-width:760px;margin:0 auto}h1{margin:0 0 8px;font-size:28px}p{color:#555}</style></head>
<body><header><strong>${name}</strong><nav><span>Forside</span><span>Priser</span><span>Kontakt</span></nav></header>
<main><h1>Book en tid</h1><p>Sådan kan det se ud på jeres egen hjemmeside.</p>${snippet}</main></body></html>`;
}

export default async function WebsitePage() {
  const { salon } = await requireAdmin();
  const theme = parseDesign(salon.design).theme;
  const code = embedSnippets(appUrl(), salon, theme);
  // Forhåndsvisningen bruger den adresse, admin er åbnet på, så den også virker lokalt og på testudgaver.
  const h = await headers();
  const here = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const preview = embedSnippets(here, salon, theme);

  return (
    <main className="page">
      <h1>Hjemmeside</h1>
      <p className="muted small" style={{ marginTop: 0 }}>
        Sæt bookingen ind på jeres egen hjemmeside, så kunderne kan booke uden at forlade den. Kopier koden og indsæt den der,
        hvor bookingen skal vises. Det virker i WordPress, Wix, Squarespace, Shopify, Webflow og alle andre, hvor man kan
        indsætte HTML. Ændrer I ydelser, tider eller design her i admin, opdateres hjemmesiden af sig selv.
      </p>

      <div className="embed-options">
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Bookingen direkte på siden</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Bedst til en side, der hedder &quot;Book tid&quot;. Bookingen fylder hele bredden og bliver automatisk lige så høj som
            indholdet, så der aldrig er to rullebjælker.
          </p>
          <CopyCode label="Kode til bookingen direkte på siden" code={code.inline} />
          <details className="small">
            <summary>Tillader jeres hjemmeside ikke scripts?</summary>
            <p className="muted">
              Brug i stedet en almindelig ramme. Den har en fast højde og kan derfor få sin egen rullebjælke.
            </p>
            <CopyCode label="Kode til en almindelig ramme" code={code.iframe} />
          </details>
          <iframe
            className="embed-preview"
            title="Forhåndsvisning af bookingen direkte på siden"
            srcDoc={previewDoc(salon.name, preview.inline)}
            style={{ height: 560 }}
          />
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>Knap der åbner bookingen</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Sæt en &quot;Book tid&quot;-knap i menuen eller på forsiden. Bookingen åbner i et vindue oven på jeres side, og kunden
            bliver på hjemmesiden. Knappen får jeres farve fra <a href="/admin/design">Bookingside</a>.
          </p>
          <CopyCode label="Kode til knappen" code={code.button} />
          <p className="muted small" style={{ margin: 0 }}>
            Har I allerede en knap, kan I bruge den. Sæt linket til bookingsiden på knappen, og giv den egenskaben{" "}
            <code>data-frisor-booking-popup</code>. Husk scriptet én gang på siden.
          </p>
          <iframe
            className="embed-preview"
            title="Forhåndsvisning af knappen"
            srcDoc={previewDoc(salon.name, preview.button)}
            style={{ height: 560 }}
          />
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>Link til bookingen</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Til Facebook, Instagram, Google og nyhedsbreve. Sæt det fx som &quot;Book nu&quot;-knap på jeres Facebook-side og
            Google-profil.
          </p>
          <CopyCode label="Link til bookingsiden" code={code.link} />
        </section>
      </div>
    </main>
  );
}
