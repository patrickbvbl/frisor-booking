import type { Booking, Salon, Service, Staff } from "@/db/schema";
import { capitalize, clock, kr } from "@/lib/format";
import { toZoned } from "@/lib/time";

const LABEL: Record<Booking["status"], string> = {
  confirmed: "Din næste tid",
  pending_payment: "Venter på depositum",
  expired: "Ikke gennemført",
  cancelled: "Aflyst",
  completed: "Sidste besøg",
  no_show: "Udeblevet",
};

/**
 * Det digitale aftalekort. Bygget over det lille papkort, frisøren rækker over disken med "din næste tid":
 * salonens navn, dagen og klokkeslættet stort, og detaljerne under en perforering.
 */
export function AppointmentCard({
  booking,
  salon,
  service,
  staff,
  deposit,
}: {
  booking: Booking;
  salon: Salon;
  service: Service;
  staff: Staff;
  deposit?: React.ReactNode;
}) {
  const tz = salon.timezone;
  const day = toZoned(booking.startsAt, tz).date;
  const [y, m, d] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const weekday = capitalize(utc.toLocaleDateString("da-DK", { timeZone: "UTC", weekday: "long" }));
  const date = utc.toLocaleDateString("da-DK", { timeZone: "UTC", day: "numeric", month: "long" });
  const inactive = ["cancelled", "expired", "no_show"].includes(booking.status);

  return (
    <article className={`appointment-card ${inactive ? "inactive" : ""}`} aria-label="Aftalekort">
      <header className="ac-top">
        <span className="label">{salon.name}</span>
        <span className="label">{LABEL[booking.status]}</span>
      </header>
      <div className="ac-when">
        <div>
          <div className="ac-weekday">{weekday}</div>
          <div className="ac-date">{date}</div>
        </div>
        <div className="ac-time">
          {clock(booking.startsAt, tz)}
          <span>til {clock(booking.endsAt, tz)}</span>
        </div>
      </div>
      <div className="ac-perf" aria-hidden />
      <dl className="ac-details">
        <div>
          <dt className="label">Ydelse</dt>
          <dd>{service.name}</dd>
        </div>
        <div>
          <dt className="label">Frisør</dt>
          <dd>{staff.name}</dd>
        </div>
        <div>
          <dt className="label">Pris</dt>
          <dd>{kr(booking.priceOre)}</dd>
        </div>
        {booking.depositOre > 0 && (
          <div>
            <dt className="label">Depositum</dt>
            <dd>{deposit ?? kr(booking.depositOre)}</dd>
          </div>
        )}
        {salon.address && (
          <div className="wide">
            <dt className="label">Adresse</dt>
            <dd>{salon.address}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}
