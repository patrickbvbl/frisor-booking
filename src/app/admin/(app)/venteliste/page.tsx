import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { capitalize, clock, displayPhone, longDate } from "@/lib/format";
import { toZoned } from "@/lib/time";
import { listWaitlist, periodLabel } from "@/lib/waitlist";
import { offerWaitlistAction, removeWaitlistAction } from "../actions";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function WaitlistAdminPage({ searchParams }: Props) {
  const { db, salon } = await requireAdmin();
  const q = await searchParams;
  const tz = salon.timezone;
  const today = toZoned(new Date(), tz).date;
  const rows = await listWaitlist(db, salon.id, today);
  const byDate = new Map<string, typeof rows>();
  for (const r of rows) byDate.set(r.entry.date, [...(byDate.get(r.entry.date) ?? []), r]);
  const sent = q.sendt;

  return (
    <main className="page">
      <h1>Venteliste</h1>
      <p className="muted small">
        Kunder kan skrive sig på ventelisten fra bookingsiden, når en dag er fuld. Bliver en tid ledig ved en aflysning, får de
        første tre i køen automatisk en SMS, og den første der trykker, får tiden.
      </p>
      {typeof sent === "string" && (
        <div className="alert ok">{sent === "0" ? "Der er ingen ledige tider, der passer til nogen på listen." : `Sendt til ${sent}.`}</div>
      )}
      {rows.length === 0 && <div className="card muted">Ingen på ventelisten lige nu.</div>}
      {[...byDate.entries()].map(([date, list]) => (
        <section key={date} style={{ marginTop: 24 }}>
          <div className="spread">
            <h2 style={{ margin: 0 }}>
              {capitalize(longDate(date))} <span className="badge neutral">{list.length}</span>
            </h2>
            <form action={offerWaitlistAction}>
              <input type="hidden" name="date" value={date} />
              <button className="secondary small" type="submit" title="Send en SMS til de første i køen, hvis der er ledige tider, der passer dem">
                Send ledige tider
              </button>
            </form>
          </div>
          <div className="card table-scroll" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Navn</th>
                  <th>Telefon</th>
                  <th>Ydelse</th>
                  <th>Frisør</th>
                  <th>Tidsrum</th>
                  <th>Sidste tilbud</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => (
                  <tr key={r.entry.id}>
                    <td>{i + 1}</td>
                    <td><Link href={`/admin/kunder/${r.customer.id}`}>{r.customer.name}</Link></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <a href={`tel:${r.customer.phone}`}>{displayPhone(r.customer.phone)}</a>
                    </td>
                    <td>{r.service.name}</td>
                    <td>{r.staffName ?? "Alle"}</td>
                    <td>{periodLabel(r.entry)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {r.entry.lastOfferAt ? `${toZoned(r.entry.lastOfferAt, tz).date} ${clock(r.entry.lastOfferAt, tz)}` : ""}
                    </td>
                    <td>
                      <form action={removeWaitlistAction}>
                        <input type="hidden" name="id" value={r.entry.id} />
                        <button className="secondary small" type="submit">Fjern</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
