"use client";

import { useState } from "react";

/** Koden vist i en boks, der markeres ved klik, med en knap der kopierer den. */
export function CopyCode({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Uden adgang til udklipsholderen kan koden stadig markeres og kopieres i boksen.
    }
  };
  return (
    <div className="copy-code">
      <textarea
        readOnly
        aria-label={label}
        value={code}
        rows={code.split("\n").length + (code.length > 120 ? 2 : 0)}
        onFocus={(e) => e.currentTarget.select()}
        spellCheck={false}
      />
      <button type="button" className="small" onClick={copy} aria-live="polite">
        {copied ? "Kopieret" : "Kopier"}
      </button>
    </div>
  );
}
