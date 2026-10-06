import { requireAdmin } from "@/lib/auth";
import { BLOCK_TYPES, BLOCKS, CORNERS, FONTS, imageUrl, PALETTES, parseDesign, type Block } from "@/lib/design";
import { str } from "@/lib/server";
import { MoveButtons } from "../move-buttons";
import {
  addBlockAction,
  moveBlockDownAction,
  moveBlockUpAction,
  paletteAction,
  removeBlockAction,
  resetDesignAction,
  saveBlockAction,
  saveThemeAction,
  toggleBlockAction,
} from "./actions";

export const metadata = { title: "Bookingside" };

// Forklaring til hvert felt i blokkene. Felter der ikke står her, vises ikke.
const FIELDS: Record<string, { label: string; long?: boolean; placeholder?: string }> = {
  title: { label: "Overskrift", placeholder: "Salonens navn" },
  subtitle: { label: "Undertekst", placeholder: "Fx Klip og farve på Nørrebro siden 2009" },
  logoId: { label: "Logo" },
  imageId: { label: "Forsidebillede" },
  heading: { label: "Overskrift" },
  body: { label: "Tekst", long: true },
  intro: { label: "Tekst under overskriften", long: true },
  tabs: { label: "Vis kategorierne som knapper øverst" },
  showDuration: { label: "Vis varighed" },
  showPrices: { label: "Vis priser" },
  showMap: { label: "Vis link til kort" },
  mapUrl: { label: "Kode fra Google Maps", long: true, placeholder: '<iframe src="https://www.google.com/maps/embed?pb=..."></iframe>' },
};

export default async function DesignPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { salon } = await requireAdmin();
  const q = await searchParams;
  const design = parseDesign(salon.design);
  const { theme, blocks } = design;
  const missing = BLOCK_TYPES.filter((t) => t !== "services" || !blocks.some((b) => b.type === "services"));

  return (
    <main className="page">
      <div className="spread">
        <h1>Bookingside</h1>
        <a className="button secondary small" href={`/book/${salon.slug}`} target="_blank">Åbn bookingsiden</a>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Vælg hvad kunderne ser, og i hvilken rækkefølge. Ydelserne og kategorierne redigerer du under{" "}
        <a href="/admin/indstillinger#kategorier">Ydelser og medarbejdere</a>.
      </p>
      {q.fejl && <div className="alert" role="alert">{str(q.fejl)}</div>}
      {q.gemt && !q.fejl && <div className="alert ok" role="status">Gemt. Bookingsiden er opdateret.</div>}

      <div className="design-layout">
        <div className="stack">
          <section className="card stack" id="tema">
            <h2 style={{ margin: 0 }}>Farver og skrift</h2>
            <div className="row">
              {PALETTES.map((p) => (
                <form key={p.name} action={paletteAction}>
                  <input type="hidden" name="palette" value={`${p.accent},${p.background}`} />
                  <button type="submit" className="swatch" title={p.name} style={{ background: p.background, color: p.accent }}>
                    <span style={{ background: p.accent }} aria-hidden />
                    {p.name}
                  </button>
                </form>
              ))}
            </div>
            <form key={JSON.stringify(theme)} action={saveThemeAction} className="grid-form">
              <label>
                Hovedfarve
                <input type="color" name="accent" defaultValue={theme.accent} />
              </label>
              <label>
                Baggrund
                <input type="color" name="background" defaultValue={theme.background} />
              </label>
              <label>
                Overskrifter
                <select name="headingFont" defaultValue={theme.headingFont}>
                  {Object.entries(FONTS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Brødtekst
                <select name="bodyFont" defaultValue={theme.bodyFont}>
                  {Object.entries(FONTS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Hjørner
                <select name="corners" defaultValue={theme.corners}>
                  {Object.entries(CORNERS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <button className="small" type="submit">Gem farver og skrift</button>
            </form>
          </section>

          <h2 id="blokke" style={{ marginBottom: 0 }}>Blokke</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Siden vises oppefra og ned i denne rækkefølge. Ydelserne er altid med, da det er der kunden starter sin booking.
          </p>
          {blocks.map((b, i) => (
            <BlockEditor key={b.id} block={b} first={i === 0} last={i === blocks.length - 1} />
          ))}

          <form action={addBlockAction} className="card row">
            <label style={{ flex: 1 }}>
              Tilføj en blok
              <select name="type" defaultValue="">
                <option value="" disabled>Vælg</option>
                {missing.map((t) => (
                  <option key={t} value={t}>{BLOCKS[t].label}</option>
                ))}
              </select>
            </label>
            <button className="small" type="submit" style={{ alignSelf: "end" }}>Tilføj</button>
          </form>

          <form action={resetDesignAction}>
            <button className="danger small" type="submit">Nulstil til standarddesign</button>
          </form>
        </div>

        <aside className="design-preview">
          <p className="muted small" style={{ margin: "0 0 6px" }}>Sådan ser det ud på en mobil</p>
          <div className="phone">
            <iframe src={`/book/${salon.slug}`} title="Forhåndsvisning af bookingsiden" />
          </div>
        </aside>
      </div>
    </main>
  );
}

function BlockEditor({ block, first, last }: { block: Block; first: boolean; last: boolean }) {
  const label = BLOCKS[block.type].label;
  const fields = Object.entries(block.props).filter(([k]) => FIELDS[k]);
  return (
    <section className={`card stack block-editor ${block.hidden ? "is-hidden" : ""}`} id={`blok-${block.id}`}>
      <form action={toggleBlockAction} className="spread">
        <input type="hidden" name="id" value={block.id} />
        <strong>
          {label} {block.hidden && <span className="badge neutral">Skjult</span>}
        </strong>
        <span className="row">
          <MoveButtons up={moveBlockUpAction} down={moveBlockDownAction} first={first} last={last} label={label} />
          {block.type !== "services" && (
            <>
              <button className="secondary small" type="submit">{block.hidden ? "Vis" : "Skjul"}</button>
              <button className="danger small" type="submit" formAction={removeBlockAction}>Slet</button>
            </>
          )}
        </span>
      </form>
      {block.type === "hours" && (
        <p className="muted small" style={{ margin: 0 }}>Åbningstiderne regnes ud fra medarbejdernes arbejdstider.</p>
      )}
      {block.type === "contact" && (
        <p className="muted small" style={{ margin: 0 }}>Viser salonens adresse og telefonnummer.</p>
      )}
      {block.type === "map" && (
        <p className="muted small" style={{ margin: 0 }}>
          Find salonen på Google Maps, tryk <strong>Del</strong>, vælg <strong>Integrer et kort</strong> og tryk <strong>Kopiér HTML</strong>. Sæt koden ind herunder og tryk Gem.
        </p>
      )}
      {fields.length > 0 && (
        // Nøglen følger indholdet, så felterne viser det gemte, når React nulstiller formularen efter at have gemt.
        <form key={JSON.stringify(block.props)} action={saveBlockAction} className="stack">
          <input type="hidden" name="id" value={block.id} />
          {fields.map(([key, value]) => {
            const f = FIELDS[key];
            if (typeof value === "boolean") {
              return (
                <label key={key} className="row" style={{ fontWeight: "normal" }}>
                  <input type="checkbox" name={key} defaultChecked={value} /> {f.label}
                </label>
              );
            }
            if (typeof value === "string") {
              return (
                <label key={key}>
                  {f.label}
                  {f.long ? (
                    <textarea name={key} defaultValue={value} rows={4} placeholder={f.placeholder} />
                  ) : (
                    <input name={key} defaultValue={value} placeholder={f.placeholder} />
                  )}
                </label>
              );
            }
            return (
              <div key={key} className="stack" style={{ gap: 4 }}>
                <label>
                  {f.label}
                  <input type="file" name={key} accept="image/jpeg,image/png,image/webp,image/gif" />
                </label>
                {value && (
                  <label className="row small" style={{ fontWeight: "normal" }}>
                    <img src={imageUrl(value)} alt="" className="thumb" />
                    <input type="checkbox" name={`${key}Remove`} /> Fjern billedet
                  </label>
                )}
              </div>
            );
          })}
          <button className="secondary small" type="submit" style={{ justifySelf: "start" }}>Gem</button>
        </form>
      )}
    </section>
  );
}
