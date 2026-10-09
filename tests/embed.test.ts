import { describe, expect, it } from "vitest";
import { defaultDesign } from "@/lib/design";
import { embedSnippets } from "@/lib/embed";

describe("kode til salonens hjemmeside", () => {
  const theme = { ...defaultDesign().theme, accent: "#8a2be2", background: "#ffffff" };
  const code = embedSnippets("https://booking.example/", { slug: "demo", name: 'Salon "Saks" & co' }, theme);

  it("peger på salonens bookingside og scriptet på samme adresse", () => {
    expect(code.link).toBe("https://booking.example/book/demo");
    expect(code.inline).toContain('data-frisor-booking="demo"');
    expect(code.inline).toContain('<script src="https://booking.example/embed.js" async></script>');
  });

  it("giver knappen salonens farve og lader linket virke uden script", () => {
    expect(code.button).toContain('href="https://booking.example/book/demo"');
    expect(code.button).toContain("data-frisor-booking-popup");
    expect(code.button).toContain("background:#8a2be2");
  });

  it("escaper salonens navn i rammens titel", () => {
    expect(code.iframe).toContain('title="Book tid hos Salon &quot;Saks&quot; &amp; co"');
  });
});
