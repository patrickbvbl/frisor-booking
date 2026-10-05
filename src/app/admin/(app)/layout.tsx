import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logoutAction } from "./actions";
import { AdminNav } from "./admin-nav";

export const metadata = { title: "Salon", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { salon } = await requireAdmin();
  return (
    <>
      <header className="topbar">
        <div className="page topbar-inner">
          <div className="topbar-top">
            <strong>{salon.name}</strong>
            <div className="row">
              <Link className="small" href={`/book/${salon.slug}`} target="_blank">
                Se som kunde ↗
              </Link>
              <form action={logoutAction}>
                <button className="secondary small" type="submit">Log ud</button>
              </form>
            </div>
          </div>
          <nav aria-label="Menu">
            <AdminNav />
          </nav>
        </div>
      </header>
      {children}
    </>
  );
}
