import { requireAdmin } from "@/lib/auth";
import { listCustomers } from "@/lib/customers";
import { displayPhone } from "@/lib/format";
import { toZoned } from "@/lib/time";

export default async function CustomersPage() {
  const { db, salon } = await requireAdmin();
  const rows = await listCustomers(db, salon.id);
  return (
    <main className="page">
      <div className="spread">
        <div>
          <h1>Kunder</h1>
          <p className="muted small" style={{ margin: 0 }}>
            {rows.length} kunder. Dine kunder er dine: du kan altid hente hele listen.
          </p>
        </div>
        <a className="button secondary small" href="/admin/kunder/eksport">Hent som CSV</a>
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
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">Ingen kunder endnu. De kommer her, når de booker.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
