import { inArray } from "drizzle-orm";
import { workingHours } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { listServices, listStaff } from "@/lib/booking";
import { str } from "@/lib/server";
import { minutesToHhmm } from "@/lib/time";
import { savePolicyAction, saveServiceAction, saveStaffAction } from "../actions";

const WEEKDAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];

const kroner = (ore: number) => String(ore / 100).replace(".", ",");

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { db, salon } = await requireAdmin();
  const q = await searchParams;
  const error = str(q.fejl);
  const [services, team] = await Promise.all([listServices(db, salon.id, false), listStaff(db, salon.id, false)]);
  const hours = team.length
    ? await db.select().from(workingHours).where(inArray(workingHours.staffId, team.map((s) => s.id)))
    : [];

  return (
    <main className="page">
      <h1>Ydelser og medarbejdere</h1>
      {error && <div className="alert">{error}</div>}

      <h2>Afbud og depositum</h2>
      {str(q.gemt) === "regler" && <div className="alert ok">Reglerne er gemt.</div>}
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

      <h2>Ydelser</h2>
      <p className="muted small">
        Sæt et depositum på ydelser hvor en udeblivelse koster meget, fx farve. Kunden betaler det med MobilePay, når de booker. Virketid
        er tiden hvor fx farven sidder, og frisøren kan tage en anden kunde imens. Skriv hvor mange minutter der går, før den starter,
        og hvor længe den varer. Genbooking er hvor mange uger der typisk går, før kunden skal komme igen.
      </p>
      <div className="stack">
        {services.map((s) => (
          <form key={s.id} action={saveServiceAction} className="card grid-form">
            <input type="hidden" name="id" value={s.id} />
            <label style={{ gridColumn: "span 2" }}>
              Navn
              <input name="name" defaultValue={s.name} required />
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
            <button className="secondary small" type="submit">Gem</button>
          </form>
        ))}
        <form action={saveServiceAction} className="card grid-form">
          <label style={{ gridColumn: "span 2" }}>
            Ny ydelse
            <input name="name" placeholder="Fx Permanent" required />
          </label>
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
