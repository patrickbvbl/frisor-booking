import { desc, eq } from "drizzle-orm";
import { smsMessages } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { clock } from "@/lib/format";
import { toZoned } from "@/lib/time";

const KIND: Record<string, string> = { confirmation: "Bekræftelse", reminder: "Påmindelse", cancellation: "Aflysning",
  rescheduled: "Flyttet",
  waitlist: "Venteliste",
  waitlist_offer: "Ledig tid",
  rebook: "Genbooking",
};

export default async function SmsPage() {
  const { db, salon } = await requireAdmin();
  const rows = await db
    .select()
    .from(smsMessages)
    .where(eq(smsMessages.salonId, salon.id))
    .orderBy(desc(smsMessages.createdAt))
    .limit(100);
  const mock = (process.env.SMS_PROVIDER ?? "mock") === "mock";
  return (
    <main className="page">
      <h1>SMS</h1>
      <p className="muted small">De seneste 100 beskeder. SMS er inkluderet i prisen, så der er intet at holde øje med her ud over at de kommer frem.</p>
      {mock && (
        <div className="alert warn">
          Testtilstand: der sendes ingen rigtige SMS&apos;er endnu. Beskederne vises kun her.
        </div>
      )}
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Tid</th>
              <th>Til</th>
              <th>Type</th>
              <th>Besked</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td style={{ whiteSpace: "nowrap" }}>
                  {toZoned(m.createdAt, salon.timezone).date} {clock(m.createdAt, salon.timezone)}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>{m.to}</td>
                <td>{KIND[m.kind] ?? m.kind}</td>
                <td>{m.body}</td>
                <td>{m.status === "sent" ? <span className="badge">Sendt</span> : <span className="badge danger" title={m.error ?? ""}>Fejlede</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">Ingen beskeder endnu.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
