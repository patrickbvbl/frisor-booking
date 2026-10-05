import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { ImportForm } from "./import-form";

export default async function ImportPage() {
  await requireAdmin();
  return (
    <main className="page narrow">
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/kunder">Kunder</Link>
      </p>
      <h1>Importér kunder</h1>
      <p className="muted">
        Tag dit kundekartotek med fra Planway, Fresha eller et regneark. Vi finder selv kolonnerne med navn, telefon, e-mail og
        noter. Kunder du allerede har, bliver ikke dobbelt.
      </p>
      <details className="card" style={{ marginBottom: 16 }}>
        <summary>Sådan henter du filen</summary>
        <ul className="small">
          <li>
            <strong>Planway:</strong> find eksport i kundelisten. Får du en Excel-fil, så åbn den og gem den som CSV.
          </li>
          <li>
            <strong>Fresha:</strong> find eksport under Clients og vælg CSV.
          </li>
          <li>
            <strong>Regneark:</strong> første linje skal være overskrifter, fx Navn, Mobil, E-mail og Note. Gem som CSV.
          </li>
        </ul>
        <p className="small muted" style={{ margin: 0 }}>Menuernes navne kan variere. Skriv til os, hvis filen ikke kan læses.</p>
      </details>
      <ImportForm />
    </main>
  );
}
