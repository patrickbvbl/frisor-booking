import { fromZoned } from "./time";

export type Interval = { start: Date; end: Date };

export type SlotInput = {
  /** Dagen der søges på, YYYY-MM-DD i salonens tidszone */
  date: string;
  tz: string;
  /** Medarbejderens arbejdstid den dag, i minutter efter midnat */
  windows: { startMin: number; endMin: number }[];
  /** Tider der allerede er optaget for medarbejderen */
  busy: Interval[];
  durationMin: number;
  now: Date;
  stepMin?: number;
  /** Hvor kort tid før en kunde tidligst kan booke */
  minLeadMin?: number;
};

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Beregner ledige starttider for én medarbejder på én dag. Ren funktion, så den er nem at teste. */
export function computeSlots(input: SlotInput): Date[] {
  const step = input.stepMin ?? 15;
  const earliest = new Date(input.now.getTime() + (input.minLeadMin ?? 60) * 60000);
  const slots: Date[] = [];
  for (const w of input.windows) {
    // Start på et helt kvarter fra vinduets begyndelse.
    for (let m = w.startMin; m + input.durationMin <= w.endMin; m += step) {
      const start = fromZoned(input.date, m, input.tz);
      const end = new Date(start.getTime() + input.durationMin * 60000);
      if (start < earliest) continue;
      if (input.busy.some((b) => overlaps({ start, end }, b))) continue;
      slots.push(start);
    }
  }
  return slots.sort((a, b) => a.getTime() - b.getTime());
}
