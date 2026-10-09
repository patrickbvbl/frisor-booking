"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

const MSG = "frisor-booking";

/**
 * Når bookingen er indlejret på salonens hjemmeside (public/embed.js), fortæller siden hjemmesiden,
 * hvor høj den er, så rammen vokser med indholdet og aldrig får sin egen rullebjælke.
 * Uden for en ramme gør den ingenting.
 */
export function EmbedBridge() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const first = useRef(true);

  useEffect(() => {
    if (window.parent === window) return;
    document.documentElement.classList.add("indlejret");
    let last = 0;
    const send = () => {
      const height = document.body.scrollHeight;
      if (height === last) return;
      last = height;
      window.parent.postMessage({ type: MSG, height }, "*");
    };
    send();
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (window.parent === window) return;
    if (first.current) {
      first.current = false;
      return;
    }
    window.parent.postMessage({ type: MSG, navigated: true, height: document.body.scrollHeight }, "*");
  }, [path, search]);

  return null;
}
