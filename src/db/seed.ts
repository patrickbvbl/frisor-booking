import type { Db } from "./client";
import { salons, services, staff, workingHours } from "./schema";

/** Opretter en demosalon med tre frisører og et udvalg af ydelser. Gør ingenting hvis den findes. */
export async function seedDemo(db: Db, slug = "demo") {
  const existing = await db.query.salons.findFirst({ where: (s, { eq }) => eq(s.slug, slug) });
  if (existing) return existing;

  const [salon] = await db
    .insert(salons)
    .values({ slug, name: "Salon Saks", phone: "+4512345678", address: "Nørrebrogade 1, 2200 København N" })
    .returning();

  await db.insert(services).values([
    { salonId: salon.id, name: "Herreklip", durationMin: 30, priceOre: 32500, depositOre: 0 },
    { salonId: salon.id, name: "Dameklip", durationMin: 45, priceOre: 49500, depositOre: 10000 },
    { salonId: salon.id, name: "Børneklip (under 12 år)", durationMin: 30, priceOre: 22500, depositOre: 0 },
    { salonId: salon.id, name: "Farve og klip", durationMin: 120, priceOre: 129500, depositOre: 30000 },
    { salonId: salon.id, name: "Skægtrim", durationMin: 15, priceOre: 15000, depositOre: 0 },
  ]);

  const team = await db
    .insert(staff)
    .values([
      { salonId: salon.id, name: "Mette" },
      { salonId: salon.id, name: "Ali" },
      { salonId: salon.id, name: "Sofie" },
    ])
    .returning();

  const h = (hh: number, mm = 0) => hh * 60 + mm;
  const schedule: Record<string, [number, number, number][]> = {
    // [ugedag, start, slut]
    Mette: [1, 2, 3, 4, 5].map((d) => [d, h(9), h(17)]),
    Ali: [[2, h(10), h(18)], [3, h(10), h(18)], [4, h(12), h(20)], [5, h(10), h(18)], [6, h(9), h(14)]],
    Sofie: [[1, h(9), h(15)], [3, h(9), h(15)], [5, h(9), h(15)], [6, h(9), h(14)]],
  };
  await db.insert(workingHours).values(
    team.flatMap((m) => schedule[m.name].map(([weekday, startMin, endMin]) => ({ staffId: m.id, weekday, startMin, endMin }))),
  );
  return salon;
}
