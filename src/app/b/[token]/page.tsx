import Link from "next/link";
import { notFound } from "next/navigation";
import { customerCanCancelFree, customerCanReschedule, getBookingDetails } from "@/lib/booking";
import { displayPhone, kr } from "@/lib/format";
import { appDb, str } from "@/lib/server";
import { parseDesign } from "@/lib/design";
import { SalonTheme } from "../../book/salon-theme";
import { AppointmentCard } from "./appointment-card";
import { cancelAction, rebookOptOutAction } from "./actions";

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
  const { booking, salon, service, staff, payment, customer } = d;
  const tz = salon.timezone;
  const now = new Date();
  const message = str(q.besked);
  const holdActive = booking.status === "pending_payment" && booking.holdExpiresAt && booking.holdExpiresAt > now;
  const canCancel = ["confirmed", "pending_payment"].includes(booking.status) && booking.startsAt > now;
  const freeCancel = customerCanCancelFree(booking, salon, now);
  const canMove = customerCanReschedule(booking, salon, now);

  return (
    <SalonTheme theme={parseDesign(salon.design).theme}>
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
      {message === "flyttet" && <div className="alert ok">Din tid er flyttet. Du får en SMS med den nye tid.</div>}
      {message && !["aflyst", "flyttet", "stop"].includes(message) && <div className="alert">{message}</div>}
      {str(q.ny) && booking.status === "confirmed" && <div className="alert ok">Du får en SMS med bekræftelsen om lidt.</div>}

      <AppointmentCard
        booking={booking}
        salon={salon}
        service={service}
        staff={staff}
        deposit={
          <>
            {kr(booking.depositOre)}{" "}
            {payment?.status === "authorized" && <span className="tag">Reserveret</span>}
            {payment?.status === "captured" && <span className="tag">Trukket</span>}
            {(payment?.status === "cancelled" || payment?.status === "refunded") && <span className="tag">Frigivet</span>}
          </>
        }
      />

      {booking.status === "confirmed" && booking.startsAt > now && (
        <p className="small" style={{ marginTop: 12 }}>
          <a href={`/b/${booking.token}/kalender`}>Læg tiden i din kalender</a>
        </p>
      )}

      {holdActive && payment?.redirectUrl && (
        <p>
          <a className="button mp full" href={payment.redirectUrl}>Betal depositum med MobilePay</a>
        </p>
      )}

      {booking.status === "completed" && (
        <div className="stack" style={{ marginTop: 16 }}>
          <Link className="button full" href={`/book/${salon.slug}?ydelse=${service.id}&frisor=${staff.id}`}>
            Book {service.name.toLowerCase()} hos {staff.name} igen
          </Link>
          {message === "stop" && <div className="alert ok">Du får ikke flere SMS&apos;er om ny tid.</div>}
          {customer.rebookOptIn && (
            <form action={rebookOptOutAction}>
              <input type="hidden" name="token" value={booking.token} />
              <button className="secondary full small" type="submit">Jeg vil ikke have SMS om ny tid</button>
            </form>
          )}
        </div>
      )}

      {(booking.status === "expired" || (booking.status === "pending_payment" && !holdActive)) && (
        <p>
          <Link className="button full" href={`/book/${salon.slug}?ydelse=${service.id}`}>Find en ny tid</Link>
        </p>
      )}

      {canMove && (
        <p style={{ marginTop: 24 }}>
          <Link className="button secondary full" href={`/b/${booking.token}/flyt`}>Flyt tiden</Link>
        </p>
      )}
      {booking.status === "confirmed" && booking.startsAt > now && !canMove && (
        <p className="muted small" style={{ marginTop: 24 }}>
          Der er under {salon.cancellationHours} timer til din tid, så den kan ikke flyttes her. Ring til salonen, hvis du har brug for en anden tid.
        </p>
      )}

      {canCancel && str(q.aflys) !== "1" && (
        <p style={{ marginTop: canMove ? 8 : 24 }}>
          <Link className="button danger full" href={`/b/${booking.token}?aflys=1#aflys`} scroll={false}>
            Aflys tiden
          </Link>
        </p>
      )}

      {canCancel && str(q.aflys) === "1" && (
        <form action={cancelAction} id="aflys" style={{ marginTop: canMove ? 8 : 24 }} className="card stack">
          <input type="hidden" name="token" value={booking.token} />
          <strong>Vil du aflyse tiden?</strong>
          {booking.depositOre > 0 && booking.status === "confirmed" && (
            <p className="small muted" style={{ margin: 0 }}>
              {freeCancel
                ? `Aflyser du nu, får du dit depositum på ${kr(booking.depositOre)} tilbage.`
                : `Der er under ${salon.cancellationHours} timer til din tid. Aflyser du nu, beholder salonen depositummet på ${kr(booking.depositOre)}.`}
            </p>
          )}
          <button className="danger full" type="submit">Ja, aflys tiden</button>
          <Link className="button secondary full" href={`/b/${booking.token}`} scroll={false}>
            Nej, behold tiden
          </Link>
        </form>
      )}

      {booking.status === "cancelled" && (
        <p style={{ marginTop: 24 }}>
          <Link className="button full" href={`/book/${salon.slug}?ydelse=${service.id}`}>Book en ny tid</Link>
        </p>
      )}

      {salon.phone && (
        <p className="muted small" style={{ marginTop: 24 }}>
          Spørgsmål? Ring til salonen på <a href={`tel:${salon.phone}`}>{displayPhone(salon.phone)}</a>.
        </p>
      )}
    </main>
    </SalonTheme>
  );
}
