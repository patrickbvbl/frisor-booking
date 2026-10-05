import Link from "next/link";

export default function Home() {
  return (
    <main className="page narrow">
      <h1>Frisør Booking</h1>
      <p className="muted">Første version af bookingsystemet. Prøv begge sider af det:</p>
      <div className="stack">
        <Link className="card link-card" href="/book/demo">
          <strong>Book en tid</strong>
          <span className="muted">Sådan ser det ud for kunden</span>
        </Link>
        <Link className="card link-card" href="/admin">
          <strong>Salonens kalender</strong>
          <span className="muted">Kodeord i udvikling: demo</span>
        </Link>
      </div>
    </main>
  );
}
