import Link from "next/link";
import { notFound } from "next/navigation";
import { getAvailability, getSalonBySlug, listServices, listStaff } from "@/lib/booking";
import { clock, kr, longDate, shortDate } from "@/lib/format";
import { appDb, str } from "@/lib/server";
import { addDays, isIsoDate, toZoned } from "@/lib/time";
import { bookAction } from "./actions";

type Props = {
  params: Promise<{ salon: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DAYS_AHEAD = 21;

export async function generateMetadata({ params }: Props) {
  const db = await appDb();
  const salon = await getSalonBySlug(db, (await params).salon);
  return { title: salon ? `Book tid hos ${salon.name}` : "Book tid" };
}

export default async function BookPage({ params, searchParams }: Props) {
  const { salon: slug } = await params;
  const q = await searchParams;
  const db = await appDb();
  const salon = await getSalonBySlug(db, slug);
  if (!salon) notFound();

  const [services, team] = await Promise.all([listServices(db, salon.id), listStaff(db, salon.id)]);
  const service = services.find((s) => String(s.id) === str(q.ydelse));
  const staffParam = str(q.frisor);
  const member = team.find((m) => String(m.id) === staffParam);
  const staffChosen = staffParam === "any" || !!member;
  const now = new Date();
  const today = toZoned(now, salon.timezone).date;
  const date = isIsoDate(str(q.dato)) && str(q.dato) >= today ? str(q.dato) : today;
  const start = str(q.tid) && !Number.isNaN(Date.parse(str(q.tid))) ? new Date(str(q.tid)) : null;
  const error = str(q.fejl);

  const href = (p: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { ydelse: service ? String(service.id) : undefined, frisor: staffChosen ? staffParam : undefined, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    return `/book/${salon.slug}?${sp}`;
  };

  const step = !service ? 1 : !staffChosen ? 2 : !start ? 3 : 4;

  return (
    <main className="page narrow">
      <p className="muted small" style={{ margin: 0 }}>Book tid hos</p>
      <h1>{salon.name}</h1>
      {salon.address && <p className="muted small" style={{ margin: 0 }}>{salon.address}</p>}

      <div className="steps" aria-hidden>
        {["Ydelse", "Frisør", "Tid", "Dine oplysninger"].map((label, i) => (
          <span key={label} className={i < step ? "done" : ""}>{label}</span>
        ))}
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      {step === 1 && (
        <section className="stack">
          <h2 style={{ marginTop: 0 }}>Hvad skal du have lavet?</h2>
          {services.map((s) => (
            <Link key={s.id} className="card link-card" href={href({ ydelse: String(s.id) })}>
              <span>
                <strong>{s.name}</strong>
                <br />
                <span className="muted small">{s.durationMin} min</span>
              </span>
              <span style={{ textAlign: "right" }}>
                {kr(s.priceOre)}
                {s.depositOre > 0 && (
                  <>
                    <br />
                    <span className="badge">Depositum {kr(s.depositOre)}</span>
                  </>
                )}
              </span>
            </Link>
          ))}
        </section>
      )}

      {service && (
        <>
          {step > 1 && (
            <p className="small">
              <strong>{service.name}</strong>, {service.durationMin} min, {kr(service.priceOre)}{" "}
              <Link href={`/book/${salon.slug}`}>Skift</Link>
            </p>
          )}

          {step === 2 && (
            <section className="stack">
              <h2 style={{ marginTop: 0 }}>Hvem vil du klippes af?</h2>
              <Link className="card link-card" href={href({ frisor: "any" })}>
                <strong>Første ledige</strong>
                <span className="muted small">Flest tider at vælge imellem</span>
              </Link>
              {team.map((m) => (
                <Link key={m.id} className="card link-card" href={href({ frisor: String(m.id) })}>
                  <strong>{m.name}</strong>
                </Link>
              ))}
            </section>
          )}

          {step >= 3 && (
            <p className="small">
              Frisør: <strong>{member ? member.name : "Første ledige"}</strong>{" "}
              <Link href={href({ frisor: undefined })}>Skift</Link>
            </p>
          )}

          {step === 3 && (
            <TimePicker
              db={db}
              salon={salon}
              service={service}
              staffId={member ? member.id : null}
              date={date}
              today={today}
              now={now}
              href={href}
            />
          )}

          {step === 4 && start && (
            <section>
              <div className="card">
                <dl className="summary">
                  <dt>Tid</dt>
                  <dd>
                    {longDate(toZoned(start, salon.timezone).date)} kl. {clock(start, salon.timezone)}{" "}
                    <Link className="small" href={href({ dato: toZoned(start, salon.timezone).date })}>Skift</Link>
                  </dd>
                  <dt>Pris</dt>
                  <dd>{kr(service.priceOre)}, betales i salonen</dd>
                  {service.depositOre > 0 && (
                    <>
                      <dt>Depositum</dt>
                      <dd>
                        {kr(service.depositOre)} reserveres med MobilePay og trækkes fra prisen. Du får det tilbage, hvis du aflyser
                        senest {salon.cancellationHours} timer før.
                      </dd>
                    </>
                  )}
                </dl>
              </div>
              <form action={bookAction} className="stack" style={{ marginTop: 16 }}>
                <input type="hidden" name="salon" value={salon.slug} />
                <input type="hidden" name="serviceId" value={service.id} />
                <input type="hidden" name="staffId" value={member ? member.id : "any"} />
                <input type="hidden" name="start" value={start.toISOString()} />
                <input type="hidden" name="back" value={href({ tid: start.toISOString() })} />
                <label>
                  Navn
                  <input name="name" required minLength={2} autoComplete="name" />
                </label>
                <label>
                  Mobilnummer
                  <input name="phone" type="tel" required inputMode="tel" autoComplete="tel" placeholder="12 34 56 78" />
                </label>
                <label>
                  E-mail (valgfri)
                  <input name="email" type="email" autoComplete="email" />
                </label>
                <label>
                  Besked til frisøren (valgfri)
                  <textarea name="note" rows={2} />
                </label>
                {service.depositOre > 0 ? (
                  <button className="mp full" type="submit">Book og betal depositum med MobilePay</button>
                ) : (
                  <button className="full" type="submit">Book tiden</button>
                )}
                <p className="muted small" style={{ margin: 0 }}>
                  Du får en SMS med bekræftelse og et link, hvor du kan aflyse. Ingen app eller login.
                </p>
              </form>
            </section>
          )}
        </>
      )}
    </main>
  );
}

async function TimePicker(props: {
  db: Awaited<ReturnType<typeof appDb>>;
  salon: NonNullable<Awaited<ReturnType<typeof getSalonBySlug>>>;
  service: Awaited<ReturnType<typeof listServices>>[number];
  staffId: number | null;
  date: string;
  today: string;
  now: Date;
  href: (p: Record<string, string | undefined>) => string;
}) {
  const { db, salon, service, staffId, date, today, now, href } = props;
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));
  const slots = await getAvailability(db, { salon, service, staffId, date, now });

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Vælg en tid</h2>
      <nav className="chips" aria-label="Dato">
        {days.map((d) => (
          <Link key={d} className={`chip ${d === date ? "selected" : ""}`} href={href({ dato: d })} scroll={false}>
            {shortDate(d)}
          </Link>
        ))}
      </nav>
      <p className="small muted">{longDate(date)}</p>
      {slots.length === 0 ? (
        <div className="card muted">
          Ingen ledige tider denne dag.{" "}
          <Link href={href({ dato: addDays(date, 1) })}>Prøv næste dag</Link>
        </div>
      ) : (
        <div className="slots">
          {slots.map((s) => (
            <Link key={s.start.toISOString()} href={href({ dato: date, tid: s.start.toISOString() })}>
              {clock(s.start, salon.timezone)}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
