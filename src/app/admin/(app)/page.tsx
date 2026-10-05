import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getBookingDetails, getDayCalendar, getWeekCalendar } from "@/lib/booking";
import { lastVisitNote } from "@/lib/customers";
import { capitalize, clock, displayPhone, kr, longDate, shortDate } from "@/lib/format";
import { str } from "@/lib/server";
import { addDays, isIsoDate, toZoned, weekdayOf } from "@/lib/time";
import { bookingAction } from "./actions";
import { CalendarColumn, STATUS_LABEL, TimeAxis, visibleRange } from "./calendar-column";
import { VisitNoteForm } from "./visit-note-form";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CalendarPage({ searchParams }: Props) {
  const { db, salon } = await requireAdmin();
  const q = await searchParams;
  const tz = salon.timezone;
  const today = toZoned(new Date(), tz).date;
  const date = isIsoDate(str(q.dato)) ? str(q.dato) : today;
  const week = str(q.visning) === "uge";
  const selectedId = Number(str(q.valgt)) || null;
  const error = str(q.fejl);

  // Ugen starter mandag. Ugevisningen viser én frisør ad gangen, så kolonnerne kan være dage.
  const monday = addDays(date, 1 - weekdayOf(date));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const cal = week ? await getWeekCalendar(db, salon, monday) : await getDayCalendar(db, salon, date);
  const member = cal.staff.find((s) => s.id === Number(str(q.medarbejder))) ?? cal.staff[0];

  const selected = selectedId ? await getBookingDetails(db, { id: selectedId }) : undefined;
  const selectedOk = selected && selected.salon.id === salon.id ? selected : undefined;
  const lastNote = selectedOk ? await lastVisitNote(db, selectedOk.customer.id, selectedOk.booking.startsAt) : undefined;

  const viewHref = (d: string, view: "dag" | "uge" = week ? "uge" : "dag", staffId = member?.id) =>
    view === "uge" ? `/admin?visning=uge&dato=${d}${staffId ? `&medarbejder=${staffId}` : ""}` : `/admin?dato=${d}`;
  const base = viewHref(date);
  const back = selectedId ? `${base}&valgt=${selectedId}` : base;

  const shown = week ? cal.bookings.filter((b) => b.booking.staffId === member?.id) : cal.bookings;
  const windows = week ? cal.hours.filter((h) => h.staffId === member?.id) : cal.hours;
  const { from, to } = visibleRange(windows, shown, tz);
  const active = shown.filter((b) => b.booking.status !== "cancelled");
  const revenue = active.filter((b) => b.booking.status !== "no_show").reduce((sum, b) => sum + b.booking.priceOre, 0);
  const step = week ? 7 : 1;
  const sunday = addDays(monday, 6);
  const title = week
    ? `Uge ${isoWeek(monday)}, ${shortDate(monday)} til ${shortDate(sunday)}`
    : capitalize(longDate(date));

  return (
    <main className="page">
      <div className="spread">
        <div>
          <h1>{title}</h1>
          <p className="muted small" style={{ margin: 0 }}>
            {week && member ? `${member.name}: ` : ""}
            {active.length} {active.length === 1 ? "booking" : "bookinger"}, {kr(revenue)} i forventet omsætning
          </p>
        </div>
        <Link className="button small" href={`/admin/ny?dato=${date}${week && member ? `&medarbejder=${member.id}` : ""}&retur=${encodeURIComponent(base)}`}>
          + Ny booking
        </Link>
      </div>

      <div className="spread" style={{ marginTop: 12 }}>
        <div className="row">
          <div className="segmented" role="group" aria-label="Visning">
            <Link href={viewHref(date, "dag")} className={week ? undefined : "active"} aria-current={week ? undefined : "page"}>Dag</Link>
            <Link href={viewHref(date, "uge")} className={week ? "active" : undefined} aria-current={week ? "page" : undefined}>Uge</Link>
          </div>
          <Link className="button secondary small" href={viewHref(addDays(date, -step))} aria-label={week ? "Forrige uge" : "Forrige dag"}>&larr;</Link>
          <Link className="button secondary small" href={viewHref(today)}>I dag</Link>
          <Link className="button secondary small" href={viewHref(addDays(date, step))} aria-label={week ? "Næste uge" : "Næste dag"}>&rarr;</Link>
        </div>
        <form className="row" action="/admin">
          {week && <input type="hidden" name="visning" value="uge" />}
          {week && member && <input type="hidden" name="medarbejder" value={member.id} />}
          <input key={date} type="date" name="dato" defaultValue={date} style={{ width: "auto", minHeight: 32, padding: "3px 8px" }} />
          <button className="secondary small" type="submit">Gå til</button>
        </form>
      </div>

      {week && cal.staff.length > 1 && (
        <div className="chips" style={{ marginTop: 12 }} role="group" aria-label="Frisør">
          {cal.staff.map((s) => (
            <Link key={s.id} href={viewHref(date, "uge", s.id)} className={`chip ${s.id === member?.id ? "selected" : ""}`}>
              {s.name}
            </Link>
          ))}
        </div>
      )}

      {error && <div className="alert">{error}</div>}

      <div className={`cal-layout ${selectedOk ? "with-panel" : ""}`} style={{ marginTop: 16 }}>
        {cal.staff.length === 0 || !member ? (
          <div className="card">
            Ingen medarbejdere endnu. <Link href="/admin/indstillinger">Tilføj den første</Link>.
          </div>
        ) : (
          <div className="cal-scroll">
            <div
              className="cal"
              style={{ gridTemplateColumns: `52px repeat(${week ? 7 : cal.staff.length}, minmax(${week ? 96 : 140}px, 1fr))` }}
            >
              <div className="cal-head" />
              {week
                ? days.map((d) => (
                    <Link key={d} href={viewHref(d, "dag")} className={`cal-head ${d === today ? "today" : ""}`}>
                      {capitalize(shortDate(d))}
                    </Link>
                  ))
                : cal.staff.map((s) => (
                    <div key={s.id} className="cal-head">{s.name}</div>
                  ))}

              <TimeAxis from={from} to={to} />

              {week
                ? days.map((d) => (
                    <CalendarColumn
                      key={d}
                      date={d}
                      staffId={member.id}
                      windows={windows.filter((h) => h.weekday === weekdayOf(d))}
                      items={shown.filter((b) => toZoned(b.booking.startsAt, tz).date === d)}
                      from={from}
                      to={to}
                      tz={tz}
                      selectedId={selectedId}
                      bookingHref={(id) => `${base}&valgt=${id}`}
                      returnTo={base}
                    />
                  ))
                : cal.staff.map((s) => (
                    <CalendarColumn
                      key={s.id}
                      date={date}
                      staffId={s.id}
                      windows={cal.hours.filter((h) => h.staffId === s.id)}
                      items={cal.bookings.filter((b) => b.booking.staffId === s.id)}
                      from={from}
                      to={to}
                      tz={tz}
                      selectedId={selectedId}
                      bookingHref={(id) => `${base}&valgt=${id}`}
                      returnTo={base}
                    />
                  ))}
            </div>
          </div>
        )}

        {selectedOk && (
          <aside className="card" style={{ alignSelf: "start" }}>
            <div className="spread">
              <Link href={`/admin/kunder/${selectedOk.customer.id}`}>
                <strong>{selectedOk.customer.name}</strong>
              </Link>
              <Link className="small" href={base} scroll={false}>Luk</Link>
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
      {cal.staff.length > 0 && (
        <p className="muted small" style={{ marginTop: 8 }}>
          Tryk på et tomt felt i kalenderen for at booke en kunde, der ringer eller kommer ind fra gaden.
        </p>
      )}
    </main>
  );
}

/** Ugenummer efter ISO 8601, som bruges i Danmark. */
function isoWeek(monday: string): number {
  const thursday = addDays(monday, 3);
  const [y] = thursday.split("-").map(Number);
  const jan4 = `${y}-01-04`;
  const week1Monday = addDays(jan4, 1 - weekdayOf(jan4));
  return Math.round((Date.parse(monday) - Date.parse(week1Monday)) / (7 * 86400000)) + 1;
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
