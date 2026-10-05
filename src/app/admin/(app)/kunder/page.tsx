import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listCustomers } from "@/lib/customers";
import { rebookPlans } from "@/lib/rebooking";
import { displayPhone } from "@/lib/format";
import { toZoned } from "@/lib/time";

export default async function CustomersPage() {
  const { db, salon } = await requireAdmin();
  const now = new Date();
  const [rows, plans] = await Promise.all([listCustomers(db, salon.id), rebookPlans(db, salon.id, now)]);
  const planOf = new Map(plans.map((p) => [p.customerId, p]));
  return (
    <main className="page">
      <div className="spread">
        <div>
          <h1>Kunder</h1>
          <p className="muted small" style={{ margin: 0 }}>
            {rows.length} kunder. Dine kunder er dine: du kan altid hente hele listen.
          </p>
        </div>
        <div className="row">
          <Link className="button secondary small" href="/admin/kunder/import">Importér</Link>
          <a className="button secondary small" href="/admin/kunder/eksport">Hent som CSV</a>
        </div>
      </div>
      <div className="card table-scroll" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Navn</th>
              <th>Telefon</th>
              <th>E-mail</th>
              <th>Besøg</th>
              <th>Udeblevet</th>
              <th>Seneste tid</th>
              <th title="Hvornår kunden bør komme igen, ud fra sin egen rytme eller ydelsens interval">Næste besøg ca.</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>
                  <a href={`tel:${c.phone}`}>{displayPhone(c.phone)}</a>
                </td>
                <td>{c.email}</td>
                <td>{c.visits}</td>
                <td>{c.noShows > 0 ? <span className="badge danger">{c.noShows}</span> : 0}</td>
                <td>{c.lastVisit ? toZoned(c.lastVisit, salon.timezone).date : ""}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <NextVisit plan={planOf.get(c.id)} tz={salon.timezone} now={now} />
                </td>
                <td className="small">{c.note}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">Ingen kunder endnu. De kommer her, når de booker, eller du kan importere dem fra dit gamle system.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function NextVisit({ plan, tz, now }: { plan: Awaited<ReturnType<typeof rebookPlans>>[number] | undefined; tz: string; now: Date }) {
  if (!plan) return null;
  const weeks = Math.round(plan.intervalDays / 7);
  const title = `Hver ${weeks}. uge (${plan.source === "rytme" ? "kundens egen rytme" : "ydelsens interval"})${plan.optIn ? ", får SMS" : ", ingen SMS uden samtykke"}`;
  return (
    <span title={title}>
      {plan.hasFutureBooking ? <span className="badge neutral">Har en tid</span> : toZoned(plan.dueAt, tz).date}{" "}
      {!plan.hasFutureBooking && plan.dueAt <= now && <span className="badge warn">Over tiden</span>}{" "}
      {plan.optIn && <span className="badge">SMS</span>}
    </span>
  );
}
