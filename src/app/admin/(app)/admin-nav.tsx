"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Kalender" },
  { href: "/admin/kunder", label: "Kunder" },
  { href: "/admin/venteliste", label: "Venteliste" },
  { href: "/admin/indstillinger", label: "Ydelser og medarbejdere" },
  { href: "/admin/design", label: "Bookingside" },
  { href: "/admin/hjemmeside", label: "Hjemmeside" },
  { href: "/admin/sms", label: "SMS" },
];

/** Menuen i admin. Markerer den side, man står på, så frisøren kan se hvor de er. */
export function AdminNav() {
  const path = usePathname();
  return (
    <>
      {LINKS.map((l) => {
        const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
