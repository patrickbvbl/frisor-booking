import { themeVars, type Theme } from "@/lib/design";
import { fontFamily, headingWeight } from "@/lib/fonts";

/** Salonens farver og skrift. Gælder bookingsiden og kundens egen side med aftalekortet, ikke admin. */
export function SalonTheme({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  const style = {
    ...themeVars(theme),
    "--font-heading": fontFamily(theme.headingFont),
    "--font-body": fontFamily(theme.bodyFont),
    "--heading-weight": String(headingWeight(theme.headingFont)),
  } as React.CSSProperties;
  return (
    <div className="salon-page" style={style}>
      {children}
    </div>
  );
}
