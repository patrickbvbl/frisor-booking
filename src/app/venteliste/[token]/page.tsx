import Link from "next/link";
import { notFound } from "next/navigation";
import { clock, displayPhone, kr, longDate } from "@/lib/format";
import { appDb, str } from "@/lib/server";
import { toZoned } from "@/lib/time";
import { getWaitlistDetails, matchingSlots, periodLabel } from "@/lib/waitlist";
import { bookFromWaitlistAction, leaveWaitlistAction } from "./actions";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata = { title: "Venteliste", robots: { index: false } };

export default async function WaitlistPage({ params, searchParams }: Props) {
  const { token } = await params;
  const q = await searchParams;
  const db = await appDb();
  const d = await getWaitlistDetails(db, token);
  if (!d) notFound();
  const { entry, salon, service, staff, customer } = d;
  const now = new Date();
  const passed = entry.date < toZoned(now, salon.timezone).date;
  const waiting = entry.status === "waiting" && !passed;
  const slots = waiting ? await matchingSlots(db, entry, salon, service, now) : [];
  const booking = entry.bookingId ? await db.query.bookings.findFirst({ where: (b, { eq }) => eq(b.id, entry.bookingId!) }) : undefined;
  const message = str(q.besked);
  const justJoined = !!str(q.ny) && waiting;

  return (
    <main className="page narrow">
      <p className="muted small" style={{ margin: 0 }}>{salon.name}</p>
      <h1>
        {waiting && (slots.length > 0 && !justJoined ? "Der er en ledig tid" : "Du står på ventelisten")}
        {entry.status === "waiting" && passed && "Dagen er gået"}
        {entry.status === "booked" && "Du fik en tid"}
        {entry.status === "cancelled" && "Du er afmeldt ventelisten"}
      </h1>

      {message === "afmeldt" && <div className="alert ok">Du er afmeldt. Du får ikke flere beskeder om denne dag.</div>}
      {message && message !== "afmeldt" && <div className="alert">{message}</div>}
      {justJoined && <div className="alert ok">Du får en SMS, hvis en tid bliver ledig.</div>}
      {justJoined && slots.length > 0 && (
        <p className="small">Der er faktisk ledige tider i dit tidsrum lige nu. Du kan booke en af dem med det samme herunder.</p>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <dl className="summary">
          <dt>Dag</dt>
          <dd>{longDate(entry.date)}</dd>
          <dt>Tidsrum</dt>
          <dd>{periodLabel(entry)}</dd>
          <dt>Hvad</dt>
          <dd>{service.name}, {service.durationMin} min, {kr(service.priceOre)}</dd>
          <dt>Hos</dt>
          <dd>{staff ? staff.name : "Første ledige"}</dd>
          <dt>Navn</dt>
          <dd>{customer.name}</dd>
        </dl>
      </div>

      {waiting && slots.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <p className="small">Først til mølle. Tryk på en tid for at booke den{service.depositOre > 0 && salon.depositMode === "always" ? ` (depositum ${kr(service.depositOre)} med MobilePay)` : ""}.</p>
          <div className="slots">
            {slots.map((s) => (
              <form key={s.start.toISOString()} action={bookFromWaitlistAction}>
                <input type="hidden" name="token" value={entry.token} />
                <input type="hidden" name="start" value={s.start.toISOString()} />
                <button type="submit">{clock(s.start, salon.timezone)}</button>
              </form>
            ))}
          </div>
        </section>
      )}

      {waiting && slots.length === 0 && (
        <p className="muted small">Der er ingen ledige tider lige nu. Vi sender en SMS, så snart der bliver en.</p>
      )}

      {entry.status === "booked" && booking && (
        <p>
          <Link className="button full" href={`/b/${booking.token}`}>Se din booking</Link>
        </p>
      )}

      {(passed || entry.status === "cancelled") && (
        <p>
          <Link className="button full" href={`/book/${salon.slug}?ydelse=${service.id}`}>Find en anden tid</Link>
        </p>
      )}

      {waiting && (
        <form action={leaveWaitlistAction} style={{ marginTop: 24 }}>
          <input type="hidden" name="token" value={entry.token} />
          <button className="secondary full" type="submit">Afmeld ventelisten</button>
        </form>
      )}

      {salon.phone && (
        <p className="muted small" style={{ marginTop: 24 }}>
          Spørgsmål? Ring til salonen på <a href={`tel:${salon.phone}`}>{displayPhone(salon.phone)}</a>.
        </p>
      )}
    </main>
  );
}
