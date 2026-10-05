import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { customerCanReschedule, getAvailability, getBookingDetails, listStaff } from "@/lib/booking";
import { clock, longDate, shortDate } from "@/lib/format";
import { appDb, str } from "@/lib/server";
import { addDays, isIsoDate, toZoned } from "@/lib/time";
import { rescheduleAction } from "../actions";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DAYS_AHEAD = 21;

export const metadata = { title: "Flyt din tid", robots: { index: false } };

export default async function ReschedulePage({ params, searchParams }: Props) {
  const { token } = await params;
  const q = await searchParams;
  const db = await appDb();
  const d = await getBookingDetails(db, { token });
  if (!d) notFound();
  const { booking, salon, service, staff } = d;
  const tz = salon.timezone;
  const now = new Date();
  if (!customerCanReschedule(booking, salon, now)) redirect(`/b/${token}`);

  const team = await listStaff(db, salon.id);
  // Som udgangspunkt vises kun tider hos samme frisør. Kunden kan vælge at se alle.
  const anyStaff = str(q.frisor) === "any" || !team.some((m) => m.id === staff.id);
  const staffId = anyStaff ? null : staff.id;
  const today = toZoned(now, tz).date;
  const current = toZoned(booking.startsAt, tz).date;
  const date = isIsoDate(str(q.dato)) && str(q.dato) >= today ? str(q.dato) : current;
  const start = str(q.tid) && !Number.isNaN(Date.parse(str(q.tid))) ? new Date(str(q.tid)) : null;
  const error = str(q.fejl);

  const href = (p: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ frisor: anyStaff ? "any" : undefined, dato: date, ...p })) if (v) sp.set(k, v);
    return `/b/${token}/flyt?${sp}`;
  };

  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));
  const slots = (await getAvailability(db, { salon, service, staffId, date, now, ignoreBookingId: booking.id })).filter(
    (s) => s.start.getTime() !== booking.startsAt.getTime() || (anyStaff && !s.staffIds.includes(booking.staffId)),
  );

  return (
    <main className="page narrow">
      <p className="muted small" style={{ margin: 0 }}>{salon.name}</p>
      <h1>Flyt din tid</h1>
      <p className="small">
        Nu: <strong>{service.name}</strong> {longDate(current)} kl. {clock(booking.startsAt, tz)} hos {staff.name}.{" "}
        <Link href={`/b/${token}`}>Tilbage</Link>
      </p>

      {error && <div className="alert" role="alert">{error}</div>}

      {start ? (
        <form action={rescheduleAction} className="card stack">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="start" value={start.toISOString()} />
          <input type="hidden" name="staffId" value={staffId ?? "any"} />
          <input type="hidden" name="back" value={href({})} />
          <p style={{ margin: 0 }}>
            Flyt til <strong>{longDate(toZoned(start, tz).date)} kl. {clock(start, tz)}</strong>
            {staffId ? ` hos ${staff.name}` : ""}?
          </p>
          {booking.depositOre > 0 && <p className="muted small" style={{ margin: 0 }}>Dit depositum følger med til den nye tid.</p>}
          <button className="full" type="submit">Flyt tiden</button>
          <Link className="small" href={href({})}>Vælg en anden tid</Link>
        </form>
      ) : (
        <section>
          <p className="small">
            {anyStaff ? (
              <>
                Viser tider hos alle frisører.{" "}
                {team.some((m) => m.id === staff.id) && <Link href={`/b/${token}/flyt?dato=${date}`}>Kun hos {staff.name}</Link>}
              </>
            ) : (
              <>
                Viser tider hos {staff.name}. <Link href={href({ frisor: "any" })}>Vis alle frisører</Link>
              </>
            )}
          </p>
          <nav className="chips" aria-label="Dato">
            {days.map((day) => (
              <Link key={day} className={`chip ${day === date ? "selected" : ""}`} href={href({ dato: day })} scroll={false}>
                {shortDate(day)}
              </Link>
            ))}
          </nav>
          <p className="small muted">{longDate(date)}</p>
          {slots.length === 0 ? (
            <div className="card muted">
              Ingen ledige tider denne dag. <Link href={href({ dato: addDays(date, 1) })}>Prøv næste dag</Link>
            </div>
          ) : (
            <div className="slots">
              {slots.map((s) => (
                <Link key={s.start.toISOString()} href={href({ tid: s.start.toISOString() })}>
                  {clock(s.start, tz)}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
