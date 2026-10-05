import Link from "next/link";
import { notFound } from "next/navigation";
import { customerCanCancelFree, getBookingDetails } from "@/lib/booking";
import { clock, displayPhone, kr, longDate } from "@/lib/format";
import { appDb, str } from "@/lib/server";
import { toZoned } from "@/lib/time";
import { cancelAction } from "./actions";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata = { title: "Din booking", robots: { index: false } };

export default async function BookingPage({ params, searchParams }: Props) {
  const { token } = await params;
  const q = await searchParams;
  const db = await appDb();
  const d = await getBookingDetails(db, { token });
  if (!d) notFound();
  const { booking, salon, service, staff, payment } = d;
  const tz = salon.timezone;
  const now = new Date();
  const message = str(q.besked);
  const holdActive = booking.status === "pending_payment" && booking.holdExpiresAt && booking.holdExpiresAt > now;
  const canCancel = ["confirmed", "pending_payment"].includes(booking.status) && booking.startsAt > now;
  const freeCancel = customerCanCancelFree(booking, salon, now);

  return (
    <main className="page narrow">
      <p className="muted small" style={{ margin: 0 }}>{salon.name}</p>
      <h1>
        {booking.status === "confirmed" && "Din tid er bekræftet"}
        {booking.status === "pending_payment" && (holdActive ? "Mangler betaling af depositum" : "Betalingen blev ikke gennemført")}
        {booking.status === "expired" && "Betalingen blev ikke gennemført"}
        {booking.status === "cancelled" && "Tiden er aflyst"}
        {booking.status === "completed" && "Tak for besøget"}
        {booking.status === "no_show" && "Du kom ikke til tiden"}
      </h1>

      {message === "aflyst" && <div className="alert ok">Din tid er aflyst. Du får en SMS som bekræftelse.</div>}
      {message && message !== "aflyst" && <div className="alert">{message}</div>}
      {str(q.ny) && booking.status === "confirmed" && <div className="alert ok">Du får en SMS med bekræftelsen om lidt.</div>}

      <div className="card" style={{ marginTop: 16 }}>
        <dl className="summary">
          <dt>Hvornår</dt>
          <dd>
            {longDate(toZoned(booking.startsAt, tz).date)} kl. {clock(booking.startsAt, tz)} til {clock(booking.endsAt, tz)}
          </dd>
          <dt>Hvad</dt>
          <dd>{service.name}</dd>
          <dt>Hos</dt>
          <dd>{staff.name}</dd>
          <dt>Pris</dt>
          <dd>{kr(booking.priceOre)}</dd>
          {booking.depositOre > 0 && (
            <>
              <dt>Depositum</dt>
              <dd>
                {kr(booking.depositOre)}{" "}
                {payment?.status === "authorized" && <span className="badge">Reserveret</span>}
                {payment?.status === "captured" && <span className="badge neutral">Trukket</span>}
                {(payment?.status === "cancelled" || payment?.status === "refunded") && <span className="badge neutral">Frigivet</span>}
              </dd>
            </>
          )}
          {salon.address && (
            <>
              <dt>Adresse</dt>
              <dd>{salon.address}</dd>
            </>
          )}
        </dl>
      </div>

      {holdActive && payment?.redirectUrl && (
        <p>
          <a className="button mp full" href={payment.redirectUrl}>Betal depositum med MobilePay</a>
        </p>
      )}

      {(booking.status === "expired" || (booking.status === "pending_payment" && !holdActive)) && (
        <p>
          <Link className="button full" href={`/book/${salon.slug}?ydelse=${service.id}`}>Find en ny tid</Link>
        </p>
      )}

      {canCancel && (
        <form action={cancelAction} style={{ marginTop: 24 }} className="stack">
          <input type="hidden" name="token" value={booking.token} />
          {booking.depositOre > 0 && booking.status === "confirmed" && (
            <p className="small muted" style={{ margin: 0 }}>
              {freeCancel
                ? `Aflyser du nu, får du dit depositum på ${kr(booking.depositOre)} tilbage.`
                : `Der er under ${salon.cancellationHours} timer til din tid. Aflyser du nu, beholder salonen depositummet på ${kr(booking.depositOre)}.`}
            </p>
          )}
          <button className="danger full" type="submit">Aflys tiden</button>
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
