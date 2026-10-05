"use client";

import { useEffect, useState } from "react";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

/**
 * Billedvælger til en medarbejder: viser billedet (eller forbogstavet) med knapper til at vælge og fjerne.
 * Et nyt billede vises med det samme, men gemmes først, når formularen sendes.
 */
export function PhotoPicker({ name, photoId }: { name: string; photoId: number | null }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const src = preview ?? (photoId && !removed ? `/billeder/${photoId}` : null);
  const initial = name.trim().slice(0, 1).toUpperCase() || "+";

  return (
    <div className="photo-picker">
      {src ? (
        <img className="avatar avatar-xl" src={src} alt="" />
      ) : (
        <span className="avatar avatar-xl" aria-hidden>{initial}</span>
      )}
      <div className="photo-picker-body">
        <span className="photo-picker-title">Billede</span>
        <span className="muted small">Vises når kunden vælger frisør</span>
        <div className="photo-picker-actions">
          <label className="button secondary small">
            {src ? "Skift billede" : "Vælg billede"}
            <input
              className="visually-hidden"
              type="file"
              name="photo"
              accept={ACCEPT}
              onChange={(e) => {
                const file = e.target.files?.[0];
                setPreview(file ? URL.createObjectURL(file) : null);
                if (file) setRemoved(false);
              }}
            />
          </label>
          {photoId && (
            <label className={`photo-picker-remove small ${removed ? "is-on" : ""}`}>
              <input
                className="visually-hidden"
                type="checkbox"
                name="photoRemove"
                checked={removed}
                onChange={(e) => setRemoved(e.target.checked)}
              />
              {removed ? "Fortryd" : "Fjern"}
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
