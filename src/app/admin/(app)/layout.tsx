import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logoutAction } from "./actions";

export const metadata = { title: "Salon", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { salon } = await requireAdmin();
  return (
    <>
      <header className="topbar">
        <div className="page spread">
          <strong>{salon.name}</strong>
          <nav>
            <Link href="/admin">Kalender</Link>
            <Link href="/admin/indstillinger">Ydelser og medarbejdere</Link>
            <Link href="/admin/venteliste">Venteliste</Link>
            <Link href="/admin/kunder">Kunder</Link>
            <Link href="/admin/sms">SMS</Link>
            <Link href="/admin/design">Bookingside</Link>
            <Link href={`/book/${salon.slug}`} target="_blank">Se bookingsiden</Link>
            <form action={logoutAction}>
              <button className="secondary small" type="submit">Log ud</button>
            </form>
          </nav>
        </div>
      </header>
      {children}
    </>
  );
}
