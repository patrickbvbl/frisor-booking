import type { Db } from "./client";
import { and, eq } from "drizzle-orm";
import { salons, serviceCategories, services, staff, workingHours, type Salon } from "./schema";

const DEMO_PHONE = "+4535362814";

/** Opretter en demosalon med tre frisører og et udvalg af ydelser. Gør ingenting hvis den findes. */
export async function seedDemo(db: Db, slug = "demo") {
  const existing = await db.query.salons.findFirst({ where: (s, { eq }) => eq(s.slug, slug) });
  if (existing) {
    if (slug === "demo") {
      await seedDemoCategories(db, existing);
      if (existing.phone === "+4512345678") {
        await db.update(salons).set({ phone: DEMO_PHONE }).where(eq(salons.id, existing.id));
        return { ...existing, phone: DEMO_PHONE };
      }
    }
    return existing;
  }

  const [salon] = await db
    .insert(salons)
    .values({ slug, name: "Salon Saks", phone: DEMO_PHONE, address: "Nørrebrogade 1, 2200 København N" })
    .returning();

  await db.insert(services).values([
    { salonId: salon.id, name: "Herreklip", durationMin: 30, priceOre: 32500, depositOre: 0, rebookWeeks: 4 },
    { salonId: salon.id, name: "Dameklip", durationMin: 45, priceOre: 49500, depositOre: 10000, rebookWeeks: 8 },
    { salonId: salon.id, name: "Børneklip (under 12 år)", durationMin: 30, priceOre: 22500, depositOre: 0, rebookWeeks: 6 },
    // Farven påføres i 30 min og virker i 45 min, hvor frisøren kan tage en anden kunde.
    {
      salonId: salon.id,
      name: "Farve og klip",
      durationMin: 120,
      priceOre: 129500,
      depositOre: 30000,
      processingAfterMin: 30,
      processingMin: 45,
      rebookWeeks: 8,
    },
    { salonId: salon.id, name: "Skægtrim", durationMin: 15, priceOre: 15000, depositOre: 0, rebookWeeks: 3 },
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
  await seedDemoCategories(db, salon);
  return salon;
}

const DEMO_CATEGORIES: { name: string; description: string; services: string[] }[] = [
  { name: "Herre", description: "Klip og skæg", services: ["Herreklip", "Skægtrim"] },
  { name: "Dame", description: "Klip, farve og styling", services: ["Dameklip", "Farve og klip"] },
  { name: "Børn", description: "For børn under 12 år", services: ["Børneklip (under 12 år)"] },
];

/** Giver demosalonen kategorier. Gør ingenting, hvis salonen allerede har kategorier, så salonens egne ændringer bevares. */
async function seedDemoCategories(db: Db, salon: Salon) {
  const has = await db.query.serviceCategories.findFirst({ where: eq(serviceCategories.salonId, salon.id) });
  if (has) return;
  for (const [position, c] of DEMO_CATEGORIES.entries()) {
    const [cat] = await db
      .insert(serviceCategories)
      .values({ salonId: salon.id, name: c.name, description: c.description, position })
      .returning();
    for (const [i, name] of c.services.entries()) {
      await db
        .update(services)
        .set({ categoryId: cat.id, position: i })
        .where(and(eq(services.salonId, salon.id), eq(services.name, name)));
    }
  }
}
