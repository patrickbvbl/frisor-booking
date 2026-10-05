import type { Staff } from "@/db/schema";

/** Medarbejderens billede, eller forbogstavet hvis salonen ikke har lagt et billede op. */
export function StaffAvatar({ member, size = "md" }: { member: Pick<Staff, "name" | "photoId">; size?: "sm" | "md" | "lg" }) {
  const cls = `avatar${size === "md" ? "" : ` avatar-${size}`}`;
  if (member.photoId) {
    return <img className={cls} src={`/billeder/${member.photoId}`} alt="" />;
  }
  return (
    <span className={cls} aria-hidden>
      {member.name.slice(0, 1)}
    </span>
  );
}
