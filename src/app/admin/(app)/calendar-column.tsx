import Link from "next/link";
import type { Booking, BookingStatus } from "@/db/schema";
import { clock } from "@/lib/format";
import { minutesToHhmm, toZoned } from "@/lib/time";

export const PX_PER_MIN = 1.3;
/** Hvor fint man kan trykke i et tomt felt. Samme trin som de ledige tider på bookingsiden. */
const SLOT_MIN = 15;

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: "Venter på depositum",
  confirmed: "Bekræftet",
  completed: "Gennemført",
  no_show: "Udeblevet",
  cancelled: "Aflyst",
  expired: "Udløbet",
};

export type CalItem = { booking: Booking; customer: { name: string }; service: { name: string } };

/** Det tidsrum kalenderen viser: fra første arbejdstime til sidste, mindst 9 til 17, og altid hele bookinger. */
export function visibleRange(windows: { startMin: number; endMin: number }[], items: CalItem[], tz: string) {
  const mins = items.map((b) => {
    const start = toZoned(b.booking.startsAt, tz).minutes;
    return { start, end: start + (b.booking.endsAt.getTime() - b.booking.startsAt.getTime()) / 60000 };
  });
  const from = Math.floor(Math.min(9 * 60, ...windows.map((h) => h.startMin), ...mins.map((m) => m.start)) / 60) * 60;
  const to = Math.min(24 * 60, Math.ceil(Math.max(17 * 60, ...windows.map((h) => h.endMin), ...mins.map((m) => m.end)) / 60) * 60);
  return { from, to };
}

export function TimeAxis({ from, to }: { from: number; to: number }) {
  return (
    <div className="cal-times" style={{ height: (to - from) * PX_PER_MIN }}>
      {hourMarks(from, to).map((m) => (
        <div key={m} className="cal-hour" style={{ top: (m - from) * PX_PER_MIN }}>{minutesToHhmm(m)}</div>
      ))}
    </div>
  );
}

function hourMarks(from: number, to: number) {
  return Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60);
}

/**
 * Én kolonne i kalenderen: én frisør på én dag. Tomme felter er links til en ny booking på netop det tidspunkt,
 * så frisøren kan trykke direkte i kalenderen, når en kunde ringer.
 */
export function CalendarColumn(props: {
  date: string;
  staffId: number;
  windows: { startMin: number; endMin: number }[];
  items: CalItem[];
  from: number;
  to: number;
  tz: string;
  selectedId: number | null;
  bookingHref: (id: number) => string;
  /** Hvor man kommer tilbage til efter en ny booking. */
  returnTo: string;
}) {
  const { from, to, tz } = props;
  const y = (min: number) => (min - from) * PX_PER_MIN;
  // Skraver tiden uden for arbejdstid.
  const off: [number, number][] = [];
  let cursor = from;
  for (const w of [...props.windows].sort((a, b) => a.startMin - b.startMin)) {
    if (w.startMin > cursor) off.push([cursor, w.startMin]);
    cursor = Math.max(cursor, w.endMin);
  }
  if (cursor < to) off.push([cursor, to]);
  const newHref = (min: number) =>
    `/admin/ny?dato=${props.date}&tid=${minutesToHhmm(min)}&medarbejder=${props.staffId}&retur=${encodeURIComponent(props.returnTo)}`;

  return (
    <div className="cal-col" style={{ height: (to - from) * PX_PER_MIN }}>
      {hourMarks(from, to).map((m) => (
        <div key={m} className="cal-hour" style={{ top: y(m) }} />
      ))}
      {off.map(([a, b]) => (
        <div key={a} className="cal-off" style={{ top: y(a), height: (b - a) * PX_PER_MIN }} />
      ))}
      {Array.from({ length: (to - from) / SLOT_MIN }, (_, i) => from + i * SLOT_MIN).map((m) => (
        <Link
          key={m}
          href={newHref(m)}
          className="cal-slot"
          style={{ top: y(m), height: SLOT_MIN * PX_PER_MIN }}
          aria-label={`Ny booking kl. ${minutesToHhmm(m)}`}
          prefetch={false}
        >
          + {minutesToHhmm(m)}
        </Link>
      ))}
      {props.items.map(({ booking, customer, service }, _, column) => {
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
            href={props.bookingHref(booking.id)}
            scroll={false}
            className={`cal-booking ${booking.status} ${booking.id === props.selectedId ? "selected" : ""} ${inGap ? "in-gap" : ""}`}
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
}
