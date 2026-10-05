import { inArray } from "drizzle-orm";
import { workingHours } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { listServices, listStaff } from "@/lib/booking";
import { listCategories } from "@/lib/categories";
import { groupServices } from "@/lib/design";
import { str } from "@/lib/server";
import { minutesToHhmm } from "@/lib/time";
import { savePolicyAction, saveServiceAction, saveStaffAction } from "../actions";
import { StaffAvatar } from "@/app/staff-avatar";
import { MoveButtons } from "../move-buttons";
import {
  deleteCategoryAction,
  moveCategoryDownAction,
  moveCategoryUpAction,
  moveServiceDownAction,
  moveServiceUpAction,
  saveCategoryAction,
} from "./actions";

const WEEKDAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];

const kroner = (ore: number) => String(ore / 100).replace(".", ",");

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { db, salon } = await requireAdmin();
  const q = await searchParams;
  const error = str(q.fejl);
  const saved = str(q.gemt);
  const savedNote = (anchor: string) =>
    saved === anchor && (
      <span className="badge" role="status">
        Gemt
      </span>
    );
  const [services, team, categories] = await Promise.all([
    listServices(db, salon.id, false),
    listStaff(db, salon.id, false),
    listCategories(db, salon.id),
  ]);
  const groups = groupServices(services, categories);
  const hours = team.length
    ? await db.select().from(workingHours).where(inArray(workingHours.staffId, team.map((s) => s.id)))
    : [];

  return (
    <main className="page">
      <h1>Ydelser og medarbejdere</h1>
      <nav className="jump-links small" aria-label="Gå til">
        <a href="#regler">Afbud og depositum</a>
        <a href="#kategorier">Kategorier</a>
        <a href="#ydelser">Ydelser</a>
        <a href="#medarbejdere">Medarbejdere og arbejdstider</a>
      </nav>
      {error && <div className="alert">{error}</div>}

      <h2 id="regler">Afbud og depositum</h2>
      {saved === "regler" && <div className="alert ok">Reglerne er gemt.</div>}
      <form action={savePolicyAction} className="card stack">
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Hvem skal betale depositum?</legend>
          <label className="row" style={{ fontWeight: "normal" }}>
            <input type="radio" name="depositMode" value="always" defaultChecked={salon.depositMode === "always"} /> Alle kunder, på ydelser med depositum
          </label>
          <label className="row" style={{ fontWeight: "normal" }}>
            <input type="radio" name="depositMode" value="no_show" defaultChecked={salon.depositMode === "no_show"} /> Kun kunder der er udeblevet
            mindst
            <input
              name="depositAfterNoShows"
              type="number"
              min={1}
              max={10}
              defaultValue={salon.depositAfterNoShows}
              aria-label="Antal udeblivelser"
              style={{ width: 64 }}
            />
            {salon.depositAfterNoShows === 1 ? "gang" : "gange"}
          </label>
        </fieldset>
        <p className="muted small" style={{ margin: 0 }}>
          Med den sidste regel booker trofaste kunder uden at betale noget på forhånd. Beløbet er ydelsens depositum. På kundekortet kan du
          altid kræve depositum af en bestemt kunde eller tilgive en, der er udeblevet.
        </p>
        <label style={{ maxWidth: 320 }}>
          Gratis afbud og flytning indtil (timer før)
          <input name="cancellationHours" type="number" min={0} max={168} defaultValue={salon.cancellationHours} />
        </label>
        <button className="secondary small" type="submit" style={{ justifySelf: "start" }}>Gem regler</button>
      </form>

      <h2 id="kategorier">Kategorier</h2>
      <p className="muted small">
        Kategorier samler ydelserne på bookingsiden, fx Herre, Dame og Børn, så kunden hurtigt finder sin. Rækkefølgen her er rækkefølgen
        på bookingsiden. Farver, skrift og hvad der ellers står på siden, vælger du under <a href="/admin/design">Bookingside</a>.
      </p>
      <div className="stack">
        {categories.map((c, i) => (
          <form key={JSON.stringify(c)} action={saveCategoryAction} className="card grid-form">
            <input type="hidden" name="id" value={c.id} />
            <label>
              Navn
              <input name="name" defaultValue={c.name} required maxLength={60} />
            </label>
            <label style={{ gridColumn: "span 2" }}>
              Undertekst (valgfri)
              <input name="description" defaultValue={c.description ?? ""} maxLength={200} placeholder="Fx Klip og skæg" />
            </label>
            <div className="row">
              <button className="secondary small" type="submit">Gem</button>
              <MoveButtons up={moveCategoryUpAction} down={moveCategoryDownAction} first={i === 0} last={i === categories.length - 1} label={c.name} />
              <button className="danger small" type="submit" formAction={deleteCategoryAction} formNoValidate>
                Slet
              </button>
            </div>
          </form>
        ))}
        <form action={saveCategoryAction} className="card grid-form">
          <label>
            Ny kategori
            <input name="name" placeholder="Fx Børneklip" required maxLength={60} />
          </label>
          <label style={{ gridColumn: "span 2" }}>
            Undertekst (valgfri)
            <input name="description" maxLength={200} />
          </label>
          <button className="small" type="submit">Tilføj</button>
        </form>
      </div>

      <h2 id="ydelser">Ydelser</h2>
      <p className="muted small">
        Sæt et depositum på ydelser hvor en udeblivelse koster meget, fx farve. Kunden betaler det med MobilePay, når de booker. Virketid
        er tiden hvor fx farven sidder, og frisøren kan tage en anden kunde imens. Skriv hvor mange minutter der går, før den starter,
        og hvor længe den varer. Genbooking er hvor mange uger der typisk går, før kunden skal komme igen.
      </p>
      <div className="stack">
        {groups.map((g) => (
          <div key={g.id ?? "andet"} className="stack">
            {g.name && <h3 style={{ margin: "8px 0 0" }}>{g.name}</h3>}
            {g.services.map((s, i) => (
              <form key={JSON.stringify(s)} id={`ydelse-${s.id}`} action={saveServiceAction} className="card grid-form">
                <input type="hidden" name="id" value={s.id} />
                <label style={{ gridColumn: "span 2" }}>
                  Navn
                  <input name="name" defaultValue={s.name} required />
                </label>
                <CategorySelect categories={categories} value={s.categoryId} />
                <label style={{ gridColumn: "span 2" }}>
                  Beskrivelse (valgfri)
                  <input name="description" defaultValue={s.description ?? ""} maxLength={300} placeholder="Vises under navnet" />
                </label>
                <label>
                  Minutter
                  <input name="durationMin" type="number" min={5} step={5} defaultValue={s.durationMin} required />
                </label>
                <label>
                  Pris (kr.)
                  <input name="price" inputMode="decimal" defaultValue={kroner(s.priceOre)} />
                </label>
                <label>
                  Depositum (kr.)
                  <input name="deposit" inputMode="decimal" defaultValue={kroner(s.depositOre)} />
                </label>
                <label title="Minutter frisøren arbejder, før virketiden starter, fx påføring af farve">
                  Virketid efter (min)
                  <input name="processingAfterMin" type="number" min={0} step={5} defaultValue={s.processingAfterMin || ""} placeholder="0" />
                </label>
                <label title="Minutter hvor farven virker, og frisøren kan tage en anden kunde">
                  Virketid (min)
                  <input name="processingMin" type="number" min={0} step={5} defaultValue={s.processingMin || ""} placeholder="0" />
                </label>
                <label title="Typisk antal uger til næste besøg. Bruges til genbooking, indtil kunden har sin egen rytme">
                  Genbooking (uger)
                  <input name="rebookWeeks" type="number" min={1} max={26} defaultValue={s.rebookWeeks ?? ""} placeholder="ingen" />
                </label>
                <label className="row" style={{ alignSelf: "center" }}>
                  <input name="active" type="checkbox" defaultChecked={s.active} /> Kan bookes
                </label>
                <div className="row">
                  <button className="secondary small" type="submit">Gem</button>
                  {savedNote(`ydelse-${s.id}`)}
                  <MoveButtons up={moveServiceUpAction} down={moveServiceDownAction} first={i === 0} last={i === g.services.length - 1} label={s.name} />
                </div>
              </form>
            ))}
          </div>
        ))}
        <form action={saveServiceAction} className="card grid-form">
          <label style={{ gridColumn: "span 2" }}>
            Ny ydelse
            <input name="name" placeholder="Fx Permanent" required />
          </label>
          <CategorySelect categories={categories} value={null} />
          <label>
            Minutter
            <input name="durationMin" type="number" min={5} step={5} defaultValue={30} required />
          </label>
          <label>
            Pris (kr.)
            <input name="price" inputMode="decimal" placeholder="0" />
          </label>
          <label>
            Depositum (kr.)
            <input name="deposit" inputMode="decimal" placeholder="0" />
          </label>
          <button className="small" type="submit">Tilføj</button>
        </form>
      </div>

      <h2 id="medarbejdere">Medarbejdere og arbejdstider</h2>
      <p className="muted small">Lad felterne stå tomme på dage, hvor medarbejderen har fri.</p>
      <div className="stack" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {[...team, null].map((m) => (
          <form
            key={m ? JSON.stringify([m, hours.filter((h) => h.staffId === m.id)]) : "new"}
            id={m ? `medarbejder-${m.id}` : undefined}
            action={saveStaffAction}
            className="card stack"
          >
            <input type="hidden" name="id" value={m?.id ?? ""} />
            <label>
              {m ? "Navn" : "Ny medarbejder"}
              <input name="name" defaultValue={m?.name ?? ""} required placeholder={m ? undefined : "Navn"} />
            </label>
            <div className="stack" style={{ gap: 4 }}>
              <label>
                Billede (valgfrit)
                <input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/gif" />
              </label>
              {m?.photoId ? (
                <label className="row small" style={{ fontWeight: "normal" }}>
                  <StaffAvatar member={m} size="lg" />
                  <input type="checkbox" name="photoRemove" /> Fjern billedet
                </label>
              ) : (
                <span className="muted small">Kunderne ser billedet, når de vælger frisør. Uden billede vises forbogstavet.</span>
              )}
            </div>
            <div className="hours small">
              {WEEKDAYS.map((label, i) => {
                const h = m ? hours.find((x) => x.staffId === m.id && x.weekday === i + 1) : undefined;
                return (
                  <div key={label} style={{ display: "contents" }}>
                    <span>{label}</span>
                    <input name={`from${i + 1}`} aria-label={`${label} fra`} placeholder="fri" defaultValue={h ? minutesToHhmm(h.startMin) : ""} />
                    <input name={`to${i + 1}`} aria-label={`${label} til`} placeholder="fri" defaultValue={h ? minutesToHhmm(h.endMin) : ""} />
                  </div>
                );
              })}
            </div>
            {m && (
              <label className="row">
                <input name="active" type="checkbox" defaultChecked={m.active} /> Kan bookes
              </label>
            )}
            <div className="row">
              <button className={`small ${m ? "secondary" : ""}`} type="submit" style={{ flex: 1 }}>{m ? "Gem" : "Tilføj"}</button>
              {m && savedNote(`medarbejder-${m.id}`)}
            </div>
          </form>
        ))}
      </div>
    </main>
  );
}

function CategorySelect({ categories, value }: { categories: { id: number; name: string }[]; value: number | null }) {
  if (categories.length === 0) return null;
  return (
    <label>
      Kategori
      <select name="categoryId" defaultValue={value ?? ""}>
        <option value="">Ingen</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </label>
  );
}
