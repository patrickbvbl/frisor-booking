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
  /** De dele af ydelsen hvor frisøren arbejder. Uden angivelse er det hele tiden. */
  segments?: Segment[];
  now: Date;
  stepMin?: number;
  /** Hvor kort tid før en kunde tidligst kan booke */
  minLeadMin?: number;
};

export type Segment = { offsetMin: number; durationMin: number };

/**
 * De dele af en ydelse hvor frisøren er optaget. Med virketid er det to dele med et hul imellem,
 * hvor frisøren kan tage en anden kunde. Ugyldige værdier giver bare én samlet del.
 */
export function serviceSegments(s: { durationMin: number; processingAfterMin: number; processingMin: number }): Segment[] {
  const after = s.processingAfterMin;
  const gap = s.processingMin;
  if (gap <= 0 || after <= 0 || after + gap >= s.durationMin) return [{ offsetMin: 0, durationMin: s.durationMin }];
  return [
    { offsetMin: 0, durationMin: after },
    { offsetMin: after + gap, durationMin: s.durationMin - after - gap },
  ];
}

/** Tiden en eksisterende booking optager, uden dens virketid. */
export function busyParts(b: { start: Date; end: Date; processingStart?: Date | null; processingEnd?: Date | null }): Interval[] {
  if (!b.processingStart || !b.processingEnd) return [{ start: b.start, end: b.end }];
  return [
    { start: b.start, end: b.processingStart },
    { start: b.processingEnd, end: b.end },
  ].filter((i) => i.start < i.end);
}

export function segmentIntervals(start: Date, segments: Segment[]): Interval[] {
  return segments.map((g) => ({
    start: new Date(start.getTime() + g.offsetMin * 60000),
    end: new Date(start.getTime() + (g.offsetMin + g.durationMin) * 60000),
  }));
}

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
      if (start < earliest) continue;
      const parts = segmentIntervals(start, input.segments ?? [{ offsetMin: 0, durationMin: input.durationMin }]);
      if (parts.some((p) => input.busy.some((b) => overlaps(p, b)))) continue;
      slots.push(start);
    }
  }
  return slots.sort((a, b) => a.getTime() - b.getTime());
}
