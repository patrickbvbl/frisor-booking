import { saveVisitNoteAction } from "./kunder/[id]/actions";

/** Salonens note om et besøg. Står både på kundekortet og i kalenderen. */
export function VisitNoteForm({ bookingId, value, back }: { bookingId: number; value: string | null; back: string }) {
  return (
    <form action={saveVisitNoteAction} className="row" style={{ marginTop: 8, alignItems: "flex-end" }}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="back" value={back} />
      <label className="small" style={{ flex: 1 }}>
        Hvad blev lavet
        <input name="visitNote" defaultValue={value ?? ""} placeholder="Fx farveformel, længde eller maskinestørrelse" />
      </label>
      <button className="secondary small" type="submit">Gem</button>
    </form>
  );
}
