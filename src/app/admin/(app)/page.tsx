import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getBookingDetails, getDayCalendar } from "@/lib/booking";
import { lastVisitNote } from "@/lib/customers";
import { capitalize, clock, displayPhone, kr, longDate } from "@/lib/format";
import { str } from "@/lib/server";
import { addDays, isIsoDate, minutesToHhmm, toZoned } from "@/lib/time";
import type { BookingStatus } from "@/db/schema";
import { bookingAction } from "./actions";
import { VisitNoteForm } from "./visit-note-form";

const PX_PER_MIN = 1.3;

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: "Venter på depositum",
  confirmed: "Bekræftet",
  completed: "Gennemført",
  no_show: "Udeblevet",
  cancelled: "Aflyst",
  expired: "Udløbet",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CalendarPage({ searchParams }: Props) {
  const { db, salon } = await requireAdmin();
  const q = await searchParams;
  const tz = salon.timezone;
  const today = toZoned(new Date(), tz).date;
  const date = isIsoDate(str(q.dato)) ? str(q.dato) : today;
  const selectedId = Number(str(q.valgt)) || null;
  const error = str(q.fejl);

  const cal = await getDayCalendar(db, salon, date);
  const selected = selectedId ? await getBookingDetails(db, { id: selectedId }) : undefined;
  const selectedOk = selected && selected.salon.id === salon.id ? selected : undefined;
  const lastNote = selectedOk ? await lastVisitNote(db, selectedOk.customer.id, selectedOk.booking.startsAt) : undefined;

  // Vis fra første arbejdstime til sidste, mindst 9 til 17, og altid hele bookinger.
  const mins = cal.bookings.map((b) => ({
    start: toZoned(b.booking.startsAt, tz).minutes,
    end: toZoned(b.booking.startsAt, tz).minutes + (b.booking.endsAt.getTime() - b.booking.startsAt.getTime()) / 60000,
  }));
  const from = Math.floor(Math.min(9 * 60, ...cal.hours.map((h) => h.startMin), ...mins.map((m) => m.start)) / 60) * 60;
  const to = Math.ceil(Math.max(17 * 60, ...cal.hours.map((h) => h.endMin), ...mins.map((m) => m.end)) / 60) * 60;
  const height = (to - from) * PX_PER_MIN;
  const y = (min: number) => (min - from) * PX_PER_MIN;

  const dayHref = (d: string) => `/admin?dato=${d}`;
  const back = `/admin?dato=${date}${selectedId ? `&valgt=${selectedId}` : ""}`;
  const active = cal.bookings.filter((b) => b.booking.status !== "cancelled");
  const revenue = active.filter((b) => b.booking.status !== "no_show").reduce((sum, b) => sum + b.booking.priceOre, 0);

  return (
    <main className="page">
      <div className="spread">
        <div>
          <h1>{capitalize(longDate(date))}</h1>
          <p className="muted small" style={{ margin: 0 }}>
            {active.length} {active.length === 1 ? "booking" : "bookinger"}, {kr(revenue)} i forventet omsætning
          </p>
        </div>
        <div className="row">
          <Link className="button secondary small" href={dayHref(addDays(date, -1))} aria-label="Forrige dag">&larr;</Link>
          <Link className="button secondary small" href={dayHref(today)}>I dag</Link>
          <Link className="button secondary small" href={dayHref(addDays(date, 1))} aria-label="Næste dag">&rarr;</Link>
          <form className="row" action="/admin">
            <input key={date} type="date" name="dato" defaultValue={date} style={{ width: "auto", minHeight: 32, padding: "3px 8px" }} />
            <button className="secondary small" type="submit">Gå til</button>
          </form>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className={`cal-layout ${selectedOk ? "with-panel" : ""}`} style={{ marginTop: 16 }}>
        {cal.staff.length === 0 ? (
          <div className="card">
            Ingen medarbejdere endnu. <Link href="/admin/indstillinger">Tilføj den første</Link>.
          </div>
        ) : (
          <div className="cal-scroll">
            <div className="cal" style={{ gridTemplateColumns: `52px repeat(${cal.staff.length}, minmax(140px, 1fr))` }}>
              <div className="cal-head" />
              {cal.staff.map((s) => (
                <div key={s.id} className="cal-head">{s.name}</div>
              ))}

              <div className="cal-times" style={{ height }}>
                {Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60).map((m) => (
                  <div key={m} className="cal-hour" style={{ top: y(m) }}>{minutesToHhmm(m)}</div>
                ))}
              </div>

              {cal.staff.map((s) => {
                const windows = cal.hours.filter((h) => h.staffId === s.id).sort((a, b) => a.startMin - b.startMin);
                // Skraver tiden uden for arbejdstid.
                const off: [number, number][] = [];
                let cursor = from;
                for (const w of windows) {
                  if (w.startMin > cursor) off.push([cursor, w.startMin]);
                  cursor = Math.max(cursor, w.endMin);
                }
                if (cursor < to) off.push([cursor, to]);
                return (
                  <div key={s.id} className="cal-col" style={{ height }}>
                    {Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60).map((m) => (
                      <div key={m} className="cal-hour" style={{ top: y(m) }} />
                    ))}
                    {off.map(([a, b]) => (
                      <div key={a} className="cal-off" style={{ top: y(a), height: (b - a) * PX_PER_MIN }} />
                    ))}
                    {cal.bookings
                      .filter((b) => b.booking.staffId === s.id)
                      .map(({ booking, customer, service }, _, column) => {
                        const start = toZoned(booking.startsAt, tz).minutes;
                        const dur = (booking.endsAt.getTime() - booking.startsAt.getTime()) / 60000;
                        const gap =
                          booking.processingStartsAt && booking.processingEndsAt
                            ? {
                                top: ((booking.processingStartsAt.getTime() - booking.startsAt.getTime()) / 60000) * PX_PER_MIN,
                                height: ((booking.processingEndsAt.getTime() - booking.processingStartsAt.getTime()) / 60000) * PX_PER_MIN,
                              }
                            : null;
                        // Sidder kunden i en anden kundes virketid, rykkes den til højre, så begge kan ses.
                        const inGap = column.some(
                          (o) =>
                            o.booking.id !== booking.id &&
                            o.booking.status !== "cancelled" &&
                            o.booking.processingStartsAt &&
                            o.booking.processingEndsAt &&
                            booking.startsAt >= o.booking.processingStartsAt &&
                            booking.startsAt < o.booking.processingEndsAt,
                        );
                        return (
                          <Link
                            key={booking.id}
                            href={`/admin?dato=${date}&valgt=${booking.id}`}
                            scroll={false}
                            className={`cal-booking ${booking.status} ${booking.id === selectedId ? "selected" : ""} ${inGap ? "in-gap" : ""}`}
                            style={{ top: y(start) + 1, height: dur * PX_PER_MIN - 2 }}
                            title={`${clock(booking.startsAt, tz)} ${customer.name}, ${service.name} (${STATUS_LABEL[booking.status]})`}
                          >
                            {gap && booking.status !== "cancelled" && (
                              <span className="cal-gap" style={{ top: gap.top, height: gap.height }}>
                                Virketid
                              </span>
                            )}
                            <strong>{clock(booking.startsAt, tz)}</strong> {customer.name}
                            <br />
                            {service.name}
                          </Link>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedOk && (
          <aside className="card" style={{ alignSelf: "start" }}>
            <div className="spread">
              <Link href={`/admin/kunder/${selectedOk.customer.id}`}>
                <strong>{selectedOk.customer.name}</strong>
              </Link>
              <Link className="small" href={`/admin?dato=${date}`} scroll={false}>Luk</Link>
            </div>
            <p style={{ margin: "4px 0 12px" }}>
              <span className={`badge ${selectedOk.booking.status === "confirmed" ? "" : selectedOk.booking.status === "pending_payment" ? "warn" : selectedOk.booking.status === "completed" ? "neutral" : "danger"}`}>
                {STATUS_LABEL[selectedOk.booking.status]}
              </span>
            </p>
            <dl className="summary small">
              <dt>Tid</dt>
              <dd>
                {clock(selectedOk.booking.startsAt, tz)} til {clock(selectedOk.booking.endsAt, tz)}
              </dd>
              <dt>Ydelse</dt>
              <dd>{selectedOk.service.name}</dd>
              {selectedOk.booking.processingStartsAt && selectedOk.booking.processingEndsAt && (
                <>
                  <dt>Virketid</dt>
                  <dd>
                    {clock(selectedOk.booking.processingStartsAt, tz)} til {clock(selectedOk.booking.processingEndsAt, tz)}
                  </dd>
                </>
              )}
              <dt>Frisør</dt>
              <dd>{selectedOk.staff.name}</dd>
              <dt>Telefon</dt>
              <dd>
                <a href={`tel:${selectedOk.customer.phone}`}>{displayPhone(selectedOk.customer.phone)}</a>
              </dd>
              <dt>Pris</dt>
              <dd>{kr(selectedOk.booking.priceOre)}</dd>
              {selectedOk.booking.depositOre > 0 && (
                <>
                  <dt>Depositum</dt>
                  <dd>
                    {kr(selectedOk.booking.depositOre)} ({paymentLabel(selectedOk.payment?.status)})
                  </dd>
                </>
              )}
              {selectedOk.booking.note && (
                <>
                  <dt>Besked</dt>
                  <dd>{selectedOk.booking.note}</dd>
                </>
              )}
              {selectedOk.customer.note && (
                <>
                  <dt>Kundenote</dt>
                  <dd>{selectedOk.customer.note}</dd>
                </>
              )}
              {lastNote && (
                <>
                  <dt>Sidst</dt>
                  <dd>
                    {lastNote.note} <span className="muted">({lastNote.serviceName}, {toZoned(lastNote.startsAt, tz).date})</span>
                  </dd>
                </>
              )}
            </dl>
            {selectedOk.booking.status === "completed" && (
              <VisitNoteForm bookingId={selectedOk.booking.id} value={selectedOk.booking.visitNote} back={back} />
            )}
            <p className="small" style={{ margin: "12px 0 0" }}>
              <Link href={`/admin/kunder/${selectedOk.customer.id}`}>Se kundekort og historik</Link>
            </p>
            {["confirmed", "completed", "no_show", "pending_payment"].includes(selectedOk.booking.status) && (
              <div className="stack" style={{ marginTop: 16 }}>
                {selectedOk.booking.status !== "pending_payment" && (
                  <div className="row">
                    <ActionButton id={selectedOk.booking.id} op="completed" back={back} label="Gennemført" />
                    <ActionButton id={selectedOk.booking.id} op="no_show" back={back} label="Udeblevet" danger />
                  </div>
                )}
                {["confirmed", "pending_payment"].includes(selectedOk.booking.status) && (
                  <ActionButton id={selectedOk.booking.id} op="cancel" back={back} label={selectedOk.booking.depositOre > 0 ? "Aflys og giv depositum retur" : "Aflys tiden"} danger />
                )}
                <p className="muted small" style={{ margin: 0 }}>
                  Ved udeblivelse trækkes depositum. Aflyser salonen, får kunden det tilbage og en SMS.
                </p>
              </div>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}

function paymentLabel(status: string | undefined) {
  switch (status) {
    case "authorized":
      return "reserveret";
    case "captured":
      return "trukket";
    case "cancelled":
    case "refunded":
      return "givet retur";
    case "created":
      return "ikke betalt endnu";
    default:
      return "ikke betalt";
  }
}

function ActionButton(props: { id: number; op: string; back: string; label: string; danger?: boolean }) {
  return (
    <form action={bookingAction}>
      <input type="hidden" name="bookingId" value={props.id} />
      <input type="hidden" name="op" value={props.op} />
      <input type="hidden" name="back" value={props.back} />
      <button className={`small ${props.danger ? "danger" : "secondary"}`} type="submit">{props.label}</button>
    </form>
  );
}
