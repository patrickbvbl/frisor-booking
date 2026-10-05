"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importAction, type ImportState } from "./actions";

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importAction, { step: "upload" });

  if (state.step === "done") {
    return (
      <div className="stack">
        <div className="alert ok">
          Færdig. {state.created} nye kunder er oprettet
          {state.updated > 0 && `, og ${state.updated} fandtes i forvejen (de manglende e-mails og noter er udfyldt)`}.
          {state.skipped > 0 && ` ${state.skipped} rækker blev sprunget over.`}
        </div>
        <p>
          <Link className="button" href="/admin/kunder">Se kunderne</Link>
        </p>
      </div>
    );
  }

  if (state.step === "preview") {
    return (
      <form action={action} className="stack">
        <input type="hidden" name="confirm" value="1" />
        <input type="hidden" name="fileName" value={state.fileName} />
        <textarea name="csv" defaultValue={state.csv} hidden readOnly />
        <div className="card">
          <p style={{ marginTop: 0 }}>
            <strong>{state.fileName}</strong>: {state.total} kunder klar til import. {state.newCount} er nye
            {state.existingCount > 0 && `, ${state.existingCount} findes allerede og beholder deres navn`}.
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            Kolonner vi fandt: {state.columns.map((c) => `${c.field} = "${c.header}"`).join(", ")}
          </p>
        </div>

        {state.sample.length > 0 && (
          <div className="card table-scroll">
            <p className="small muted" style={{ marginTop: 0 }}>De første rækker:</p>
            <table>
              <thead>
                <tr>
                  <th>Navn</th>
                  <th>Telefon</th>
                  <th>E-mail</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {state.sample.map((r) => (
                  <tr key={r.phone}>
                    <td>{r.name}</td>
                    <td>{r.phone}</td>
                    <td>{r.email}</td>
                    <td>{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {state.skipped.length > 0 && (
          <details className="card">
            <summary>{state.skipped.length} rækker springes over</summary>
            <ul className="small">
              {state.skipped.map((s) => (
                <li key={s.line}>
                  Linje {s.line}: {s.reason} <span className="muted">({s.raw})</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="row">
          <button type="submit" disabled={pending || state.total === 0}>
            {pending ? "Importerer..." : `Importér ${state.total} kunder`}
          </button>
          <Link className="button secondary" href="/admin/kunder/import">Vælg en anden fil</Link>
        </div>
      </form>
    );
  }

  return (
    <form action={action} className="stack">
      {state.error && <div className="alert" role="alert">{state.error}</div>}
      <label>
        CSV-fil
        <input name="file" type="file" accept=".csv,.txt,text/csv" required />
      </label>
      <div>
        <button type="submit" disabled={pending}>{pending ? "Læser filen..." : "Se hvad der importeres"}</button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Der gemmes ingenting, før du har set en oversigt og trykket importér.</p>
    </form>
  );
}
