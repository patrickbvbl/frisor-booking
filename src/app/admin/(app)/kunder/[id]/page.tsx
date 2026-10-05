import Link from "next/link";
import { notFound } from "next/navigation";
import type { BookingStatus } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getCustomerCard } from "@/lib/customers";
import { clock, displayPhone, kr, longDate } from "@/lib/format";
import { str } from "@/lib/server";
import { toZoned } from "@/lib/time";
import { VisitNoteForm } from "../../visit-note-form";
import { saveCustomerAction } from "./actions";

const STATUS: Record<BookingStatus, { label: string; badge: string }> = {
  pending_payment: { label: "Venter på depositum", badge: "warn" },
  confirmed: { label: "Kommende", badge: "" },
  completed: { label: "Gennemført", badge: "neutral" },
  no_show: { label: "Udeblevet", badge: "danger" },
  cancelled: { label: "Aflyst", badge: "neutral" },
  expired: { label: "Udløbet", badge: "neutral" },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomerCardPage({ params, searchParams }: Props) {
  const { db, salon } = await requireAdmin();
  const id = Number((await params).id);
  const q = await searchParams;
  const card = Number.isInteger(id) ? await getCustomerCard(db, salon.id, id) : undefined;
  if (!card) notFound();
  const { customer, history, stats } = card;
  const tz = salon.timezone;
  const now = new Date();
  const upcoming = history.filter((h) => ["confirmed", "pending_payment"].includes(h.booking.status) && h.booking.endsAt > now).reverse();
  const past = history.filter((h) => !upcoming.includes(h));
  const back = `/admin/kunder/${customer.id}`;
  const depositRule =
    salon.depositMode === "no_show"
      ? `Salonens regel: depositum efter ${salon.depositAfterNoShows} ${salon.depositAfterNoShows === 1 ? "udeblivelse" : "udeblivelser"}`
      : "Salonens regel: depositum på ydelser der har et";

  return (
    <main className="page">
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/kunder">&larr; Alle kunder</Link>
      </p>
      <div className="spread">
        <div>
          <h1>{customer.name}</h1>
          <p className="muted small" style={{ margin: 0 }}>
            <a href={`tel:${customer.phone}`}>{displayPhone(customer.phone)}</a>
            {customer.email && <> · {customer.email}</>} · kunde siden {toZoned(customer.createdAt, tz).date}
          </p>
        </div>
        <Link className="button small" href={`/admin/ny?kunde=${customer.id}`}>+ Book tid</Link>
      </div>

      {str(q.fejl) && <div className="alert">{str(q.fejl)}</div>}
      {str(q.gemt) && <div className="alert ok">Kunden er gemt.</div>}

      <div className="stat-row" style={{ marginTop: 16 }}>
        <Stat label="Besøg" value={String(stats.visits)} />
        <Stat label="Udeblevet" value={String(stats.noShows)} danger={stats.noShows > 0} />
        <Stat label="Brugt i alt" value={kr(stats.spentOre)} />
        <Stat label="Seneste besøg" value={stats.lastVisit ? toZoned(stats.lastVisit, tz).date : "Ingen endnu"} />
        <Stat label="Klippes oftest af" value={stats.favouriteStaff ?? "Ingen endnu"} />
      </div>

      {customer.note && (
        <div className="alert warn" style={{ marginTop: 16 }}>
          <strong>Note:</strong> {customer.note}
        </div>
      )}

      <div className="card-layout" style={{ marginTop: 16 }}>
        <section>
          {upcoming.length > 0 && (
            <>
              <h2 style={{ marginTop: 0 }}>Kommende tider</h2>
              <div className="stack">
                {upcoming.map((h) => (
                  <Link key={h.booking.id} className="card link-card" href={`/admin?dato=${toZoned(h.booking.startsAt, tz).date}&valgt=${h.booking.id}`}>
                    <span>
                      <strong>{longDate(toZoned(h.booking.startsAt, tz).date)} kl. {clock(h.booking.startsAt, tz)}</strong>
                      <br />
                      <span className="muted small">{h.serviceName} hos {h.staffName}</span>
                    </span>
                    <span className={`badge ${STATUS[h.booking.status].badge}`}>{STATUS[h.booking.status].label}</span>
                  </Link>
                ))}
              </div>
            </>
          )}

          <h2 style={upcoming.length ? undefined : { marginTop: 0 }}>Historik</h2>
          {past.length === 0 ? (
            <div className="card muted">Ingen besøg endnu.</div>
          ) : (
            <div className="stack">
              {past.map((h) => (
                <div key={h.booking.id} className="card">
                  <div className="spread">
                    <span>
                      <strong>{toZoned(h.booking.startsAt, tz).date}</strong> {h.serviceName} hos {h.staffName}
                      <span className="muted small"> · {kr(h.booking.priceOre)}</span>
                    </span>
                    <span className={`badge ${STATUS[h.booking.status].badge}`}>{STATUS[h.booking.status].label}</span>
                  </div>
                  {h.booking.note && <p className="small muted" style={{ margin: "6px 0 0" }}>Kundens besked: {h.booking.note}</p>}
                  {h.booking.status === "completed" && <VisitNoteForm bookingId={h.booking.id} value={h.booking.visitNote} back={back} />}
                </div>
              ))}
            </div>
          )}
        </section>

        <aside>
          <form action={saveCustomerAction} className="card stack">
            <h2 style={{ margin: 0 }}>Oplysninger</h2>
            <input type="hidden" name="id" value={customer.id} />
            <label>
              Navn
              <input name="name" defaultValue={customer.name} required minLength={2} />
            </label>
            <label>
              E-mail
              <input name="email" type="email" defaultValue={customer.email ?? ""} />
            </label>
            <label>
              Fast note
              <textarea name="note" rows={3} defaultValue={customer.note ?? ""} placeholder="Fx allergi, hårtype eller fast farveformel" />
            </label>
            <label>
              Depositum
              <select name="depositOverride" defaultValue={customer.depositOverride ?? ""}>
                <option value="">Følg salonens regel</option>
                <option value="always">Kræv altid depositum</option>
                <option value="never">Aldrig depositum</option>
              </select>
              <span className="muted small" style={{ fontWeight: "normal" }}>{depositRule}.</span>
            </label>
            <p className="muted small" style={{ margin: 0 }}>
              SMS om næste besøg: {customer.rebookOptIn ? "ja, kunden har sagt ja" : "nej, kunden har ikke sagt ja"}.
            </p>
            <button className="secondary small" type="submit">Gem</button>
          </form>
        </aside>
      </div>
    </main>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="card stat">
      <span className="muted small">{label}</span>
      <strong className={danger ? "text-danger" : undefined}>{value}</strong>
    </div>
  );
}
