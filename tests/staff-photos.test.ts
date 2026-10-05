import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { salonImages, type Salon } from "@/db/schema";
import { seedDemo } from "@/db/seed";
import { listStaff } from "@/lib/booking";
import { MAX_STAFF_PHOTO_BYTES, setStaffPhoto, staffPhotoError } from "@/lib/staff-photos";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

let db: Db;
let salon: Salon;

beforeEach(async () => {
  db = await createDb({ dataDir: "memory://" });
  salon = await seedDemo(db);
});

describe("billeder af medarbejdere", () => {
  it("gemmer billedet og viser det på medarbejderen", async () => {
    const [m] = await listStaff(db, salon.id);
    expect(m.photoId).toBeNull();
    await setStaffPhoto(db, salon.id, m.id, PNG);
    const updated = (await listStaff(db, salon.id)).find((s) => s.id === m.id)!;
    const img = await db.query.salonImages.findFirst();
    expect(updated.photoId).toBe(img!.id);
    expect(img!.mime).toBe("image/png");
  });

  it("sletter det gamle billede, når det skiftes eller fjernes", async () => {
    const [m] = await listStaff(db, salon.id);
    await setStaffPhoto(db, salon.id, m.id, PNG);
    await setStaffPhoto(db, salon.id, m.id, PNG);
    expect(await db.select().from(salonImages)).toHaveLength(1);
    await setStaffPhoto(db, salon.id, m.id, null);
    expect(await db.select().from(salonImages)).toHaveLength(0);
    expect((await listStaff(db, salon.id)).find((s) => s.id === m.id)!.photoId).toBeNull();
  });

  it("afviser filer der ikke er billeder eller er for store", async () => {
    expect(staffPhotoError(PNG)).toBeNull();
    expect(staffPhotoError(Buffer.from("<svg onload=alert(1)></svg>"))).toMatch(/JPG, PNG/);
    expect(staffPhotoError(Buffer.concat([PNG, Buffer.alloc(MAX_STAFF_PHOTO_BYTES)]))).toMatch(/3 MB/);
    const [m] = await listStaff(db, salon.id);
    await expect(setStaffPhoto(db, salon.id, m.id, Buffer.from("hej med dig, ikke et billede"))).rejects.toThrow();
  });

  it("rører ikke medarbejdere fra en anden salon", async () => {
    const [m] = await listStaff(db, salon.id);
    await setStaffPhoto(db, salon.id + 1, m.id, PNG);
    expect(await db.select().from(salonImages)).toHaveLength(0);
  });
});
