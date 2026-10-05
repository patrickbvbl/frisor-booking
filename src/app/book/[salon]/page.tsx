import Link from "next/link";
import { notFound } from "next/navigation";
import { getAvailability, getSalonBySlug, listServices, listStaff } from "@/lib/booking";
import { clock, kr, longDate, shortDate } from "@/lib/format";
import { appDb, str } from "@/lib/server";
import { addDays, isIsoDate, toZoned } from "@/lib/time";
import { PERIODS } from "@/lib/waitlist";
import { inArray } from "drizzle-orm";
import { workingHours } from "@/db/schema";
import { listCategories } from "@/lib/categories";
import { groupServices, openingHours, parseDesign, themeVars, type Theme } from "@/lib/design";
import { fontFamily } from "@/lib/fonts";
import { bookAction, joinWaitlistAction } from "./actions";
import { CompactHeader, SalonBlocks } from "./blocks";

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

  const [services, team, categories] = await Promise.all([
    listServices(db, salon.id),
    listStaff(db, salon.id),
    listCategories(db, salon.id),
  ]);
  const design = parseDesign(salon.design);
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

  // Med "kun for dem der udebliver" ved vi først, om kunden skal betale, når vi kender telefonnummeret.
  const depositForAll = salon.depositMode === "always";
  const step = !service ? 1 : !staffChosen ? 2 : !start ? 3 : 4;
  const steps = (
    <div className="steps" aria-hidden>
      {["Ydelse", "Frisør", "Tid", "Dine oplysninger"].map((label, i) => (
        <span key={label} className={i < step - 1 ? "done" : i === step - 1 ? "current" : ""}>{label}</span>
      ))}
    </div>
  );
  const needsHours = step === 1 && design.blocks.some((b) => b.type === "hours" && !b.hidden);
  const hours =
    needsHours && team.length ? await db.select().from(workingHours).where(inArray(workingHours.staffId, team.map((m) => m.id))) : [];

  return (
    <SalonTheme theme={design.theme}>
    <main className="page narrow">
      {step === 1 ? (
        <>
          {error && <div className="alert" role="alert">{error}</div>}
          <SalonBlocks
            blocks={design.blocks}
            data={{ salon, groups: groupServices(services, categories), team, opening: openingHours(hours), memberId: member?.id ?? null, href, depositForAll }}
          >
            {steps}
          </SalonBlocks>
        </>
      ) : (
        <>
          <CompactHeader salon={salon} blocks={design.blocks} />
          {steps}
          {error && <div className="alert" role="alert">{error}</div>}
        </>
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
              waitlist={str(q.venteliste) === "1"}
              dateChosen={isIsoDate(str(q.dato))}
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
                  {service.depositOre > 0 && depositForAll && (
                    <>
                      <dt>Depositum</dt>
                      <dd>
                        {kr(service.depositOre)} reserveres med MobilePay og trækkes fra prisen. Du får det tilbage, hvis du aflyser
                        senest {salon.cancellationHours} timer før.
                      </dd>
                    </>
                  )}
                  {service.depositOre > 0 && !depositForAll && (
                    <>
                      <dt>Depositum</dt>
                      <dd>
                        Intet depositum. Er du udeblevet fra en tid før, reserveres {kr(service.depositOre)} med MobilePay, når du booker.
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
                <label className="row small" style={{ fontWeight: "normal" }}>
                  <input name="rebookOptIn" type="checkbox" /> Send mig en SMS, når det er tid til næste besøg
                </label>
                {service.depositOre > 0 && depositForAll ? (
                  <button className="mp full" type="submit">Book og betal depositum med MobilePay</button>
                ) : (
                  <button className="full" type="submit">Book tiden</button>
                )}
                <p className="muted small" style={{ margin: 0 }}>
                  Du får en SMS med bekræftelse og et link, hvor du kan flytte eller aflyse. Ingen app eller login.
                </p>
              </form>
            </section>
          )}
        </>
      )}
    </main>
    </SalonTheme>
  );
}

/** Salonens farver og skrift. Gælder kun bookingsiden, ikke admin. */
function SalonTheme({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  const style = {
    ...themeVars(theme),
    "--font-heading": fontFamily(theme.headingFont),
    "--font-body": fontFamily(theme.bodyFont),
  } as React.CSSProperties;
  return (
    <div className="salon-page" style={style}>
      {children}
    </div>
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
  waitlist: boolean;
  dateChosen: boolean;
}) {
  const { db, salon, service, staffId, today, now, href, waitlist, dateChosen } = props;
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));
  let date = props.date;
  let slots = await getAvailability(db, { salon, service, staffId, date, now });
  // Er dagen fuld eller lukket, finder vi den første dag med ledige tider. Har kunden ikke selv valgt en dag, viser vi den direkte.
  let nextFree: string | null = null;
  if (slots.length === 0) {
    for (const d of days.filter((d) => d > date)) {
      const found = await getAvailability(db, { salon, service, staffId, date: d, now });
      if (found.length > 0) {
        if (dateChosen) nextFree = d;
        else {
          date = d;
          slots = found;
        }
        break;
      }
    }
  }

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
          {nextFree ? (
            <Link href={href({ dato: nextFree })} scroll={false}>
              Første ledige tid er {longDate(nextFree)}
            </Link>
          ) : (
            <>Der er ingen ledige tider de næste {DAYS_AHEAD} dage.</>
          )}
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

      {waitlist ? (
        <form action={joinWaitlistAction} className="card stack" style={{ marginTop: 16 }} id="venteliste">
          <h3 style={{ margin: 0 }}>Venteliste {longDate(date)}</h3>
          <p className="muted small" style={{ margin: 0 }}>
            Bliver en tid ledig, får du en SMS med et link. Den første der trykker, får tiden.
          </p>
          <input type="hidden" name="salon" value={salon.slug} />
          <input type="hidden" name="serviceId" value={service.id} />
          <input type="hidden" name="staffId" value={staffId ?? "any"} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="back" value={href({ dato: date, venteliste: "1" })} />
          <label>
            Hvornår passer det dig?
            <select name="period" defaultValue="all">
              {Object.entries(PERIODS).map(([key, p]) => (
                <option key={key} value={key}>{p.label}</option>
              ))}
            </select>
          </label>
          <label>
            Navn
            <input name="name" required minLength={2} autoComplete="name" />
          </label>
          <label>
            Mobilnummer
            <input name="phone" type="tel" required inputMode="tel" autoComplete="tel" placeholder="12 34 56 78" />
          </label>
          <button className="full" type="submit">Skriv mig på ventelisten</button>
        </form>
      ) : (
        <p className="small" style={{ marginTop: 16 }}>
          Ingen tid der passer?{" "}
          <Link href={`${href({ dato: date, venteliste: "1" })}#venteliste`} scroll={false}>
            Skriv dig på ventelisten for {longDate(date)}
          </Link>
          , så får du en SMS, hvis en tid bliver ledig.
        </p>
      )}
    </section>
  );
}
