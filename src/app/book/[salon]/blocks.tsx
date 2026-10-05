import Link from "next/link";
import type { Salon, Service, Staff } from "@/db/schema";
import { displayPhone, kr } from "@/lib/format";
import { minutesToHhmm } from "@/lib/time";
import { imageUrl, type Block, type BlockProps, type CategoryGroup, type OpeningDay } from "@/lib/design";

const WEEKDAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];

export type PageData = {
  salon: Salon;
  groups: CategoryGroup<Service>[];
  team: Staff[];
  opening: OpeningDay[];
  memberId: number | null;
  // Med "kun for dem der udebliver" vises depositum ikke på forhånd.
  depositForAll: boolean;
  href: (p: Record<string, string | undefined>) => string;
};

/** Salonens forside: blokkene i den rækkefølge, salonen har valgt i admin under Bookingside. */
export function SalonBlocks({ blocks, data, children }: { blocks: Block[]; data: PageData; children?: React.ReactNode }) {
  const visible = blocks.filter((b) => !b.hidden);
  return (
    <>
      {!visible.some((b) => b.type === "hero") && <h1>{data.salon.name}</h1>}
      {visible.map((b) => (
        <BlockView key={b.id} block={b} data={data}>
          {b.type === "services" ? children : null}
        </BlockView>
      ))}
    </>
  );
}

function BlockView({ block, data, children }: { block: Block; data: PageData; children?: React.ReactNode }) {
  switch (block.type) {
    case "hero":
      return <Hero props={block.props} salon={data.salon} />;
    case "text":
      return <TextBlock props={block.props} />;
    case "notice":
      return block.props.body ? <div className="block notice">{block.props.body}</div> : null;
    case "services":
      return (
        <ServicesBlock props={block.props} data={data}>
          {children}
        </ServicesBlock>
      );
    case "staff":
      return <StaffBlock props={block.props} data={data} />;
    case "hours":
      return <HoursBlock props={block.props} opening={data.opening} />;
    case "contact":
      return <ContactBlock props={block.props} salon={data.salon} />;
  }
}

function Hero({ props, salon }: { props: BlockProps<"hero">; salon: Salon }) {
  return (
    <header className="block hero">
      {props.imageId && <img className="hero-image" src={imageUrl(props.imageId)} alt="" />}
      <div className={`hero-text ${props.imageId ? "with-image" : ""}`}>
        {props.logoId && <img className="hero-logo" src={imageUrl(props.logoId)} alt={`${salon.name} logo`} />}
        <div>
          <h1>{props.title || salon.name}</h1>
          {props.subtitle && <p className="muted" style={{ margin: 0 }}>{props.subtitle}</p>}
        </div>
      </div>
    </header>
  );
}

function TextBlock({ props }: { props: BlockProps<"text"> }) {
  if (!props.heading && !props.body) return null;
  return (
    <section className="block">
      {props.heading && <h2>{props.heading}</h2>}
      {props.body
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} style={{ whiteSpace: "pre-line" }}>{p}</p>
        ))}
    </section>
  );
}

function ServicesBlock({ props, data, children }: { props: BlockProps<"services">; data: PageData; children?: React.ReactNode }) {
  const { groups, href, team, memberId } = data;
  const member = team.find((m) => m.id === memberId);
  const named = groups.filter((g) => g.name);
  return (
    <section className="block" id="ydelser">
      {props.heading && <h2>{props.heading}</h2>}
      {children}
      {member && (
        <p className="small">
          Du booker hos <strong>{member.name}</strong>. <Link href={href({ frisor: undefined })}>Skift</Link>
        </p>
      )}
      {props.tabs && named.length > 1 && (
        <nav className="chips category-tabs" aria-label="Kategorier">
          {named.map((g) => (
            <a key={g.id ?? "andet"} className="chip" href={`#kategori-${g.id ?? "andet"}`}>
              {g.name}
            </a>
          ))}
        </nav>
      )}
      {groups.map((g) => (
        <div key={g.id ?? "andet"} className="stack category" id={`kategori-${g.id ?? "andet"}`}>
          {g.name && (
            <div>
              <h3>{g.name}</h3>
              {g.description && <p className="muted small" style={{ margin: 0 }}>{g.description}</p>}
            </div>
          )}
          {g.services.map((s) => (
            <Link key={s.id} className="card link-card" href={href({ ydelse: String(s.id) })}>
              <span>
                <strong>{s.name}</strong>
                {s.description && (
                  <>
                    <br />
                    <span className="muted small">{s.description}</span>
                  </>
                )}
                {props.showDuration && (
                  <>
                    <br />
                    <span className="muted small">{s.durationMin} min</span>
                  </>
                )}
              </span>
              <span style={{ textAlign: "right" }}>
                {props.showPrices && kr(s.priceOre)}
                {s.depositOre > 0 && data.depositForAll && (
                  <>
                    {props.showPrices && <br />}
                    <span className="badge">Depositum {kr(s.depositOre)}</span>
                  </>
                )}
              </span>
            </Link>
          ))}
        </div>
      ))}
      {groups.length === 0 && <div className="card muted">Der er ingen ydelser at booke lige nu.</div>}
    </section>
  );
}

function StaffBlock({ props, data }: { props: BlockProps<"staff">; data: PageData }) {
  if (data.team.length === 0) return null;
  return (
    <section className="block">
      {props.heading && <h2>{props.heading}</h2>}
      {props.intro && <p className="muted">{props.intro}</p>}
      <div className="staff-list">
        {data.team.map((m) => (
          <Link
            key={m.id}
            className={`card staff-card ${data.memberId === m.id ? "selected" : ""}`}
            href={`${data.href({ frisor: String(m.id) })}#ydelser`}
          >
            <span className="avatar" aria-hidden>{m.name.slice(0, 1)}</span>
            <span>
              <strong>{m.name}</strong>
              <br />
              <span className="small">Book hos {m.name}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function HoursBlock({ props, opening }: { props: BlockProps<"hours">; opening: OpeningDay[] }) {
  return (
    <section className="block">
      {props.heading && <h2>{props.heading}</h2>}
      <dl className="summary card">
        {opening.map((d) => (
          <div key={d.weekday} style={{ display: "contents" }}>
            <dt>{WEEKDAYS[d.weekday - 1]}</dt>
            <dd>{d.ranges.length ? d.ranges.map(([s, e]) => `${minutesToHhmm(s)}-${minutesToHhmm(e)}`).join(", ") : "Lukket"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ContactBlock({ props, salon }: { props: BlockProps<"contact">; salon: Salon }) {
  if (!salon.address && !salon.phone) return null;
  return (
    <section className="block">
      {props.heading && <h2>{props.heading}</h2>}
      <div className="card stack">
        {salon.address && (
          <span>
            {salon.address}
            {props.showMap && (
              <>
                {" "}
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(salon.address)}`} target="_blank" rel="noopener">
                  Vis på kort
                </a>
              </>
            )}
          </span>
        )}
        {salon.phone && (
          <span>
            Telefon <a href={`tel:${salon.phone.replace(/\s/g, "")}`}>{displayPhone(salon.phone)}</a>
          </span>
        )}
      </div>
    </section>
  );
}

/** Lille topbar på de næste trin i bookingen, så kunden kan se hvor de booker. */
export function CompactHeader({ salon, blocks }: { salon: Salon; blocks: Block[] }) {
  const hero = blocks.find((b): b is Extract<Block, { type: "hero" }> => b.type === "hero" && !b.hidden);
  return (
    <Link href={`/book/${salon.slug}`} className="compact-header">
      {hero?.props.logoId && <img className="hero-logo small" src={imageUrl(hero.props.logoId)} alt="" />}
      <span>
        <span className="muted small">Book tid hos</span>
        <br />
        <strong>{salon.name}</strong>
      </span>
    </Link>
  );
}
