import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { customers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { listServices, listStaff } from "@/lib/booking";
import { findCustomers } from "@/lib/customers";
import { displayPhone, kr } from "@/lib/format";
import { str } from "@/lib/server";
import { hhmmToMinutes, isIsoDate, minutesToHhmm, toZoned } from "@/lib/time";
import { createStaffBookingAction } from "./actions";

export const metadata = { title: "Ny booking" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const KEEP = ["dato", "tid", "medarbejder", "ydelse", "retur"] as const;

export default async function NewBookingPage({ searchParams }: Props) {
  const { db, salon } = await requireAdmin();
  const q = await searchParams;
  const p = (k: string) => str(q[k]).trim();
  const tz = salon.timezone;
  const now = toZoned(new Date(), tz);

  const date = isIsoDate(p("dato")) ? p("dato") : now.date;
  // Uden tidspunkt foreslås næste hele kvarter i dag, ellers kl. 10.
  const time = hhmmToMinutes(p("tid")) !== null ? p("tid") : date === now.date ? minutesToHhmm(Math.min(23 * 60 + 45, Math.ceil(now.minutes / 15) * 15)) : "10:00";
  const retur = p("retur").startsWith("/admin") ? p("retur") : `/admin?dato=${date}`;

  const [services, team] = await Promise.all([listServices(db, salon.id), listStaff(db, salon.id)]);
  const customerId = Number(p("kunde")) || null;
  const customer = customerId
    ? await db.query.customers.findFirst({ where: and(eq(customers.id, customerId), eq(customers.salonId, salon.id)) })
    : undefined;
  const search = customer ? "" : p("q");
  const hits = search ? await findCustomers(db, salon.id, search) : [];

  // Link der bevarer det, der allerede er valgt, og ændrer resten.
  const href = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams();
    for (const k of KEEP) if (p(k)) params.set(k, p(k));
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    return `/admin/ny?${params}`;
  };
  // Har man søgt på et nummer eller navn uden at finde nogen, foreslås det til den nye kunde.
  const searchDigits = search.replace(/\D/g, "");
  const newName = p("navn") || (search && searchDigits.length < 8 ? search : "");
  const newPhone = p("telefon") || (searchDigits.length >= 8 ? search : "");

  return (
    <main className="page" style={{ maxWidth: 640 }}>
      <p className="small" style={{ margin: 0 }}>
        <Link href={retur}>&larr; Tilbage til kalenderen</Link>
      </p>
      <h1>Ny booking</h1>
      <p className="muted small" style={{ marginTop: 0 }}>
        Til kunder der ringer eller kommer ind fra gaden. Der kræves ikke depositum, når salonen selv booker.
      </p>

      {p("fejl") && <div className="alert">{p("fejl")}</div>}

      <section className="card stack" style={{ marginTop: 16 }}>
        <h2 style={{ margin: 0 }}>1. Kunde</h2>
        {customer ? (
          <div className="spread">
            <span>
              <strong>{customer.name}</strong>
              <br />
              <span className="muted small">{displayPhone(customer.phone)}</span>
            </span>
            <Link className="button secondary small" href={href({ kunde: null })}>Skift kunde</Link>
          </div>
        ) : (
          <>
            <form action="/admin/ny" className="row" role="search">
              {KEEP.map((k) => (p(k) ? <input key={k} type="hidden" name={k} value={p(k)} /> : null))}
              <input
                name="q"
                type="search"
                defaultValue={search}
                placeholder="Søg på navn eller telefon"
                aria-label="Søg efter kunde"
                autoFocus={!search}
                style={{ flex: 1, width: "auto" }}
              />
              <button className="secondary" type="submit">Søg</button>
            </form>
            {search && hits.length > 0 && (
              <ul className="pick-list">
                {hits.map((c) => (
                  <li key={c.id}>
                    <Link href={href({ kunde: String(c.id) })}>
                      <strong>{c.name}</strong>
                      <span className="muted small">{displayPhone(c.phone)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {search && hits.length === 0 && (
              <p className="muted small" style={{ margin: 0 }}>
                Ingen kunder matcher &quot;{search}&quot;. Opret kunden herunder.
              </p>
            )}
          </>
        )}
        {customer?.note && (
          <div className="alert warn" style={{ margin: 0 }}>
            <strong>Note:</strong> {customer.note}
          </div>
        )}
      </section>

      <form action={createStaffBookingAction} className="card stack" style={{ marginTop: 16 }}>
        <input type="hidden" name="retur" value={retur} />
        {customer ? (
          <input type="hidden" name="kunde" value={customer.id} />
        ) : (
          <>
            <h2 style={{ margin: 0 }}>Ny kunde</h2>
            <p className="muted small" style={{ margin: 0 }}>
              Findes telefonnummeret allerede, bookes tiden på den kunde.
            </p>
            <div className="grid-form">
              <label>
                Navn
                <input name="navn" defaultValue={newName} required minLength={2} autoComplete="off" />
              </label>
              <label>
                Telefon
                <input name="telefon" type="tel" inputMode="tel" defaultValue={newPhone} required autoComplete="off" />
              </label>
            </div>
            <label>
              E-mail (valgfri)
              <input name="email" type="email" defaultValue={p("email")} autoComplete="off" />
            </label>
          </>
        )}

        <h2 style={{ margin: "8px 0 0" }}>2. Tid</h2>
        <label>
          Ydelse
          <select name="ydelse" defaultValue={p("ydelse")} required>
            <option value="" disabled>Vælg ydelse</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMin} min, {kr(s.priceOre)})
              </option>
            ))}
          </select>
        </label>
        <label>
          Frisør
          <select name="medarbejder" defaultValue={p("medarbejder") || String(team[0]?.id ?? "")} required>
            {team.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <div className="grid-form">
          <label>
            Dato
            <input name="dato" type="date" defaultValue={date} required />
          </label>
          <label>
            Klokken
            <input name="tid" type="time" step={300} defaultValue={time} required />
          </label>
        </div>
        <label>
          Note til tiden (valgfri)
          <textarea name="note" rows={2} defaultValue={p("note")} placeholder="Fx ønsker eller hvad kunden sagde i telefonen" />
        </label>
        <label className="row">
          <input type="checkbox" name="sms" defaultChecked={p("sms") !== "nej"} />
          Send bekræftelse på SMS med link til at flytte eller aflyse
        </label>
        <button type="submit">Opret booking</button>
      </form>
    </main>
  );
}
