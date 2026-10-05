import { getBookingDetails } from "@/lib/booking";
import { appDb } from "@/lib/server";

// Aftalekortet som kalenderfil, så kunden kan lægge tiden i sin egen kalender med ét tryk.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const db = await appDb();
  const d = await getBookingDetails(db, { token: (await params).token });
  if (!d || !["confirmed", "pending_payment"].includes(d.booking.status)) return new Response("Ikke fundet", { status: 404 });
  const { booking, salon, service, staff } = d;
  const stamp = (t: Date) => t.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//frisor-booking//DA",
    "BEGIN:VEVENT",
    `UID:booking-${booking.id}@frisor-booking`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(booking.startsAt)}`,
    `DTEND:${stamp(booking.endsAt)}`,
    `SUMMARY:${esc(`${service.name} hos ${salon.name}`)}`,
    `DESCRIPTION:${esc(`Hos ${staff.name}. Flyt eller aflys: ${new URL(`/b/${booking.token}`, req.url)}`)}`,
    ...(salon.address ? [`LOCATION:${esc(salon.address)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="tid-hos-${salon.slug}.ics"`,
    },
  });
}
