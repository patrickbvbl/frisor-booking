"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

const MSG = "frisor-booking";

/** Hvor langt nede i siden elementet i adressens #-del står, eller null hvis der ikke er noget. */
function anchorOffset(): number | null {
  const id = decodeURIComponent(location.hash.slice(1));
  const el = id ? document.getElementById(id) : null;
  return el ? el.getBoundingClientRect().top + window.scrollY : null;
}

/**
 * Når bookingen er indlejret på salonens hjemmeside (public/embed.js), fortæller siden hjemmesiden,
 * hvor høj den er, så rammen vokser med indholdet og aldrig får sin egen rullebjælke.
 * Rammen kan ikke selv rulle, så hop til fx en kategori sendes også videre til hjemmesiden.
 * Uden for en ramme gør den ingenting.
 */
export function EmbedBridge() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const first = useRef(true);

  useEffect(() => {
    if (window.parent === window) return;
    document.documentElement.classList.add("indlejret");
    const post = (data: Record<string, unknown>) => window.parent.postMessage({ type: MSG, ...data }, "*");
    let last = 0;
    const send = () => {
      const height = document.body.scrollHeight;
      if (height === last) return;
      last = height;
      post({ height });
    };
    send();
    const ro = new ResizeObserver(send);
    ro.observe(document.body);

    // Links til et sted på samme side, fx kategorierne øverst. Også når man trykker på den samme to gange.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !a.hash || a.pathname !== location.pathname || a.search !== location.search) return;
      setTimeout(() => {
        const anchor = anchorOffset();
        if (anchor !== null) post({ anchor });
      });
    };
    // Esc lukker vinduet på hjemmesiden, også når kunden har klikket inde i bookingen.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") post({ escape: true });
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      ro.disconnect();
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (window.parent === window) return;
    if (first.current) {
      first.current = false;
      return;
    }
    // Et nyt trin. Peger linket på et sted på siden (fx #venteliste), ruller hjemmesiden derhen i stedet for til toppen.
    const anchor = anchorOffset();
    window.parent.postMessage({ type: MSG, navigated: true, anchor, height: document.body.scrollHeight }, "*");
  }, [path, search]);

  return null;
}
