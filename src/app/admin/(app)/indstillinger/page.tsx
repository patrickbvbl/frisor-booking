import { inArray } from "drizzle-orm";
import { workingHours } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { listServices, listStaff } from "@/lib/booking";
import { listCategories } from "@/lib/categories";
import { groupServices } from "@/lib/design";
import { str } from "@/lib/server";
import { minutesToHhmm } from "@/lib/time";
import { saveServiceAction, saveStaffAction } from "../actions";
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
  const error = str((await searchParams).fejl);
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
      {error && <div className="alert">{error}</div>}

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

      <h2>Ydelser</h2>
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

      <h2>Medarbejdere og arbejdstider</h2>
      <p className="muted small">Lad felterne stå tomme på dage, hvor medarbejderen har fri.</p>
      <div className="stack" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {[...team, null].map((m) => (
          <form key={m?.id ?? "new"} action={saveStaffAction} className="card stack">
            <input type="hidden" name="id" value={m?.id ?? ""} />
            <label>
              {m ? "Navn" : "Ny medarbejder"}
              <input name="name" defaultValue={m?.name ?? ""} required placeholder={m ? undefined : "Navn"} />
            </label>
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
            <button className={`small ${m ? "secondary" : ""}`} type="submit">{m ? "Gem" : "Tilføj"}</button>
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
