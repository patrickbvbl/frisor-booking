import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { createDb } from "@/db/client";
import { serviceCategories, services } from "@/db/schema";
import { seedDemo } from "@/db/seed";
import { detectImageType, listCategories, moveCategory, moveService, reorder } from "@/lib/categories";
import {
  addBlock,
  contrast,
  defaultDesign,
  groupServices,
  mapEmbedUrl,
  moveBlock,
  openingHours,
  parseDesign,
  removeBlock,
  themeVars,
  updateBlock,
  updateTheme,
} from "@/lib/design";

describe("design af bookingsiden", () => {
  it("bruger standarddesignet, når salonen ikke har lavet sit eget", () => {
    const d = parseDesign(null);
    expect(d.blocks.map((b) => b.type)).toEqual(["hero", "services", "hours", "contact"]);
  });

  it("springer ukendte blokke over og sørger for at ydelserne altid er med én gang", () => {
    const d = parseDesign({
      theme: { accent: "rød", background: "#000000" },
      blocks: [
        { id: "a", type: "text", props: { heading: "Velkommen", body: "Hej" } },
        { id: "b", type: "video", props: {} },
        { id: "c", type: "services", hidden: true, props: {} },
        { id: "d", type: "services", props: {} },
      ],
    });
    expect(d.blocks.map((b) => b.type)).toEqual(["text", "services"]);
    expect(d.blocks[1].hidden).toBe(false);
    expect(d.theme.accent).toBe("#1e1b18");
    expect(d.theme.background).toBe("#000000");
  });

  it("tilføjer ydelser, hvis de mangler", () => {
    const d = parseDesign({ blocks: [{ id: "a", type: "hours", props: {} }] });
    expect(d.blocks.map((b) => b.type)).toEqual(["hours", "services"]);
  });

  it("flytter, skjuler og sletter blokke, men ydelserne kan ikke slettes eller skjules", () => {
    let d = defaultDesign();
    d = moveBlock(d, "ydelser", "up");
    expect(d.blocks.map((b) => b.id).slice(0, 2)).toEqual(["ydelser", "forside"]);
    expect(moveBlock(d, "ydelser", "up")).toBe(d);
    d = removeBlock(d, "ydelser");
    expect(d.blocks.some((b) => b.type === "services")).toBe(true);
    d = updateBlock(d, "ydelser", {}, true);
    expect(d.blocks.find((b) => b.id === "ydelser")!.hidden).toBe(false);
    d = updateBlock(d, "kontakt", {}, true);
    expect(d.blocks.find((b) => b.id === "kontakt")!.hidden).toBe(true);
    expect(addBlock(d, "services").blocks.length).toBe(d.blocks.length);
    d = addBlock(d, "text");
    expect(d.blocks.at(-1)!.type).toBe("text");
  });

  it("opdaterer felter og afviser for lang tekst", () => {
    let d = updateBlock(defaultDesign(), "forside", { title: "Salon Saks", subtitle: "x".repeat(500) });
    const hero = d.blocks.find((b) => b.id === "forside")!;
    expect(hero.props).toMatchObject({ title: "", subtitle: "" });
    d = updateBlock(d, "forside", { title: "Salon Saks" });
    expect(d.blocks.find((b) => b.id === "forside")!.props).toMatchObject({ title: "Salon Saks" });
  });

  it("tager kun adressen fra Google Maps' kode og afviser alt andet", () => {
    const code =
      '<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!3m3!1d2249!2d12.55!3d55.69" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>';
    const url = "https://www.google.com/maps/embed?pb=!1m18!1m12!3m3!1d2249!2d12.55!3d55.69";
    expect(mapEmbedUrl(code)).toBe(url);
    expect(mapEmbedUrl(url)).toBe(url);
    expect(mapEmbedUrl('<iframe src="https://evil.example/maps/embed?pb=1"></iframe>')).toBeNull();
    expect(mapEmbedUrl('<iframe src="javascript:alert(1)"></iframe>')).toBeNull();
    expect(mapEmbedUrl("http://www.google.com/maps/embed?pb=1")).toBeNull();
    expect(mapEmbedUrl("https://www.google.com.evil.dk/maps/embed?pb=1")).toBeNull();
    expect(mapEmbedUrl("https://maps.app.goo.gl/abc")).toBeNull();
    expect(mapEmbedUrl("<script>alert(1)</script>")).toBeNull();

    let d = addBlock(defaultDesign(), "map");
    const id = d.blocks.at(-1)!.id;
    d = updateBlock(d, id, { heading: "Find os", mapUrl: url });
    expect(d.blocks.at(-1)!.props).toMatchObject({ heading: "Find os", mapUrl: url });
    // Rå HTML gemmes aldrig, kun den rene adresse.
    d = updateBlock(d, id, { mapUrl: code });
    expect(d.blocks.at(-1)!.props).toMatchObject({ mapUrl: url });
    expect(parseDesign(JSON.parse(JSON.stringify(d))).blocks.at(-1)!.type).toBe("map");
  });

  it("gør teksten læsbar uanset hvilke farver salonen vælger", () => {
    const light = themeVars(updateTheme(defaultDesign(), { accent: "#ffe600", background: "#ffffff" }).theme);
    // Gul på hvid kan ikke læses, så links bruger tekstfarven.
    expect(light["--accent"]).toBe("#1d1b19");
    const dark = themeVars(updateTheme(defaultDesign(), { accent: "#d4a64a", background: "#141414" }).theme);
    expect(dark["--text"]).toBe("#f4f1ec");
    expect(dark.colorScheme).toBe("dark");
    expect(dark["--accent-text"]).toBe("#111111");
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21);
  });
});

describe("åbningstider", () => {
  it("lægger medarbejdernes arbejdstider sammen pr. dag", () => {
    const days = openingHours([
      { weekday: 1, startMin: 540, endMin: 900 },
      { weekday: 1, startMin: 600, endMin: 1020 },
      { weekday: 2, startMin: 540, endMin: 720 },
      { weekday: 2, startMin: 780, endMin: 1020 },
    ]);
    expect(days[0].ranges).toEqual([[540, 1020]]);
    expect(days[1].ranges).toEqual([[540, 720], [780, 1020]]);
    expect(days[6].ranges).toEqual([]);
  });
});

describe("kategorier", () => {
  const s = (id: number, categoryId: number | null, position = 0) => ({ id, categoryId, position });

  it("grupperer ydelser i salonens rækkefølge og lægger resten under Andet", () => {
    const groups = groupServices(
      [s(1, 2), s(2, 1, 1), s(3, 1, 0), s(4, null), s(5, 99)],
      [
        { id: 1, name: "Dame", description: null, position: 1 },
        { id: 2, name: "Herre", description: null, position: 0 },
        { id: 3, name: "Tom", description: null, position: 2 },
      ],
    );
    expect(groups.map((g) => g.name)).toEqual(["Herre", "Dame", "Andet"]);
    expect(groups[1].services.map((x) => x.id)).toEqual([3, 2]);
    expect(groups[2].services.map((x) => x.id)).toEqual([4, 5]);
  });

  it("viser ingen overskrift, når salonen ikke bruger kategorier", () => {
    expect(groupServices([s(1, null)], [])).toEqual([{ id: null, name: "", description: null, services: [s(1, null)] }]);
  });

  it("flytter op og ned", () => {
    expect(reorder([1, 2, 3], 2, "up")).toEqual([2, 1, 3]);
    expect(reorder([1, 2, 3], 3, "down")).toEqual([1, 2, 3]);
  });

  it("giver demosalonen kategorier og kan ændre rækkefølgen", async () => {
    const db = await createDb({ dataDir: "memory://" });
    const salon = await seedDemo(db);
    let cats = await listCategories(db, salon.id);
    expect(cats.map((c) => c.name)).toEqual(["Herre", "Dame", "Børn"]);

    await moveCategory(db, salon.id, cats[2].id, "up");
    cats = await listCategories(db, salon.id);
    expect(cats.map((c) => c.name)).toEqual(["Herre", "Børn", "Dame"]);

    const herre = cats[0].id;
    const names = async () =>
      (
        await db.query.services.findMany({
          where: and(eq(services.categoryId, herre)),
          orderBy: [asc(services.position), asc(services.id)],
        })
      ).map((x) => x.name);
    expect(await names()).toEqual(["Herreklip", "Skægtrim"]);
    const skaeg = await db.query.services.findFirst({ where: eq(services.name, "Skægtrim") });
    await moveService(db, salon.id, skaeg!.id, "up");
    expect(await names()).toEqual(["Skægtrim", "Herreklip"]);

    // Seed igen rører ikke salonens egne kategorier.
    await seedDemo(db);
    expect((await db.select().from(serviceCategories)).length).toBe(3);
  });
});

describe("billeder", () => {
  it("genkender billedtyper ud fra indholdet og afviser SVG", () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
    expect(detectImageType(png)).toBe("image/png");
    expect(detectImageType(jpg)).toBe("image/jpeg");
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
  });
});
