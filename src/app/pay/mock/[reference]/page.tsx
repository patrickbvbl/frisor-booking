import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { payments } from "@/db/schema";
import { defaultDeps, getBookingDetails, handlePaymentEvent } from "@/lib/booking";
import { kr } from "@/lib/format";
import { appDb, str } from "@/lib/server";

// Testside der efterligner MobilePay, indtil vi har rigtige nøgler. Findes kun når PAYMENT_PROVIDER=mock.

type Props = { params: Promise<{ reference: string }> };

export const metadata = { title: "MobilePay (test)", robots: { index: false } };

async function respond(formData: FormData) {
  "use server";
  const reference = str(formData.get("reference"));
  const event = str(formData.get("event")) === "approve" ? "AUTHORIZED" : "ABORTED";
  const db = await appDb();
  const booking = await handlePaymentEvent(db, reference, event, defaultDeps());
  if (!booking) notFound();
  redirect(`/b/${booking.token}`);
}

export default async function MockPayPage({ params }: Props) {
  if ((process.env.PAYMENT_PROVIDER ?? "mock") !== "mock") notFound();
  const { reference } = await params;
  const db = await appDb();
  const payment = await db.query.payments.findFirst({ where: eq(payments.reference, decodeURIComponent(reference)) });
  if (!payment) notFound();
  const d = (await getBookingDetails(db, { id: payment.bookingId }))!;

  return (
    <main className="page narrow">
      <div className="mp-screen">
        <div className="small">MobilePay (testtilstand, der trækkes ingen penge)</div>
        <div className="amount">{kr(payment.amountOre)}</div>
        <div>Depositum til {d.salon.name}</div>
        <div className="small" style={{ opacity: 0.8 }}>{d.service.name}</div>
      </div>
      {payment.status === "created" ? (
        <div className="stack" style={{ marginTop: 16 }}>
          <form action={respond}>
            <input type="hidden" name="reference" value={payment.reference} />
            <input type="hidden" name="event" value="approve" />
            <button className="mp full" type="submit">Godkend</button>
          </form>
          <form action={respond}>
            <input type="hidden" name="reference" value={payment.reference} />
            <input type="hidden" name="event" value="reject" />
            <button className="secondary full" type="submit">Afvis</button>
          </form>
        </div>
      ) : (
        <p className="muted">
          Betalingen er allerede behandlet. <a href={`/b/${d.booking.token}`}>Gå til din booking</a>
        </p>
      )}
    </main>
  );
}
