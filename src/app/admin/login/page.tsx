import { redirect } from "next/navigation";
import { adminPassword, isAdmin, passwordMatches, startSession } from "@/lib/auth";
import { str } from "@/lib/server";

export const metadata = { title: "Log ind", robots: { index: false } };

async function login(formData: FormData) {
  "use server";
  if (!passwordMatches(str(formData.get("password")))) redirect("/admin/login?fejl=1");
  await startSession();
  redirect("/admin");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await isAdmin()) redirect("/admin");
  const q = await searchParams;
  return (
    <main className="page narrow">
      <h1>Log ind</h1>
      <p className="muted">Salonens kalender og indstillinger.</p>
      {!adminPassword() && <div className="alert">ADMIN_PASSWORD er ikke sat på serveren.</div>}
      {q.fejl && <div className="alert">Forkert kodeord.</div>}
      <form action={login} className="stack">
        <label>
          Kodeord
          <input name="password" type="password" required autoFocus autoComplete="current-password" />
        </label>
        <button type="submit">Log ind</button>
      </form>
    </main>
  );
}
