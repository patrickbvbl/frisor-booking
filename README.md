# frisor-booking

Et bookingsystem til frisører. Kunder finder en ledig tid og booker på under et minut uden app eller login, og salonen styrer kalender, medarbejdere og ydelser ét sted.

## Status

Første version (MVP) er bygget. Den dækker de fire ting, vi valgte at starte med ud fra researchen:

| Funktion | Hvor | Status |
|---|---|---|
| Online booking for kunder | `/book/demo` | Virker. Ydelse, frisør (eller "første ledige"), dato og tid, navn og mobilnummer |
| Kalender for medarbejdere | `/admin` | Virker. Dagsvisning med en kolonne pr. frisør, markér gennemført, udeblevet eller aflys |
| SMS-bekræftelse og påmindelse | `/admin/sms` | Logikken virker. Sendes ikke rigtigt endnu (stub), beskederne kan ses i SMS-loggen |
| Depositum via MobilePay | `/pay/mock/...` | Logikken virker. Betaling er en testside (stub), indtil vi har MobilePay-nøgler |

Derudover: ydelser og arbejdstider kan redigeres under `/admin/indstillinger`, og kundelisten kan hentes som CSV under `/admin/kunder` ("dine kunder er dine").

## Kom i gang

Kræver Node 22. Der skal ikke installeres en database, lokalt bruges [PGlite](https://pglite.dev) (Postgres i WebAssembly), som gemmer data i `.data/pglite`.

```bash
npm install
npm run db:seed   # opretter demosalonen "Salon Saks" med tre frisører og fem ydelser
npm run dev       # http://localhost:3000
```

Admin-kodeordet er `demo` i udvikling. Stop `npm run dev`, før du kører `db:seed` eller `reminders`, da PGlite kun tillader én proces ad gangen.

```bash
npm test          # tests af ledige tider, tidszoner, depositum, aflysning og påmindelser
npm run typecheck
npm run build
```

## Læg den online på Vercel

Det tager omkring ti minutter og er gratis. SMS og MobilePay forbliver testudgaver, så ingen får rigtige beskeder eller bliver trukket penge.

1. Opret en konto på [vercel.com](https://vercel.com/signup) med "Continue with GitHub".
2. Klik **Add New, Project**, vælg `frisor-booking` og klik **Import**. Giv Vercel adgang til repoet, hvis det ikke står på listen.
3. Åbn **Environment Variables** på samme side og tilføj `ADMIN_PASSWORD` (kodeord til `/admin`) og `CRON_SECRET` (en lang tilfældig tekst). Klik **Deploy**. Første deploy fejler med "DATABASE_URL mangler", det er forventet.
4. Gå til projektets fane **Storage**, klik **Create Database**, vælg **Neon** (Postgres, gratis plan), region Frankfurt, og forbind den til projektet. Det sætter `DATABASE_URL` automatisk.
5. Gå til **Deployments**, klik på de tre prikker ved seneste deploy og vælg **Redeploy**.

Hver deploy kører `npm run db:setup` før build (se `vercel.json`), som opdaterer databasen og opretter demosalonen "Salon Saks", hvis den mangler. Links i SMS bruger automatisk projektets Vercel-adresse, medmindre `APP_URL` er sat, fx når der kommer et rigtigt domæne.

Bookingsiden ligger derefter på `https://<projekt>.vercel.app/book/demo` og kalenderen på `/admin`.

## Teknologivalg

| Valg | Hvorfor |
|---|---|
| **Next.js 16 (App Router) og TypeScript** | Én kodebase til både kundens bookingside og salonens kalender. Siderne er server-renderet og virker uden JavaScript, så bookingsiden er hurtig på en gammel mobil |
| **Postgres med Drizzle ORM** | Rigtig database fra dag ét med transaktioner og låse, så to kunder ikke kan få samme tid. Lokalt PGlite, i produktion en hostet Postgres (fx Neon eller Supabase) via `DATABASE_URL` |
| **Server actions og almindelige formularer** | Ingen separat API at vedligeholde. Hvert trin i bookingen er en URL, som kan deles og linkes til fra Instagram eller Google |
| **Udbydere bag et interface** | `src/lib/sms.ts` og `src/lib/payments.ts`. Mock nu, rigtig udbyder senere uden at røre bookinglogikken |
| **Vercel** som hosting | Gratis at starte. `vercel.json` migrerer databasen ved hver deploy og kører påmindelser |

## Sådan virker det

**Ledige tider** (`src/lib/availability.ts`) regnes ud fra medarbejderens arbejdstid den ugedag, minus eksisterende bookinger, i kvarters intervaller og tidligst en time frem. Alt gemmes i UTC og vises i salonens tidszone, også henover skift til og fra sommertid.

**Dobbeltbooking** forhindres ved at låse medarbejderen i en transaktion og tjekke tiden igen, lige før bookingen gemmes.

**Depositum** (`src/lib/booking.ts`):

1. Har ydelsen et depositum, holdes tiden i 15 minutter, mens kunden betaler med MobilePay.
2. Når MobilePay melder at beløbet er reserveret, bekræftes tiden og kunden får en SMS.
3. Kommer betalingen for sent, og tiden er givet væk, frigives beløbet automatisk.
4. Aflyser kunden mindst 24 timer før (kan ændres pr. salon), frigives depositum. Senere end det beholder salonen det.
5. Udebliver kunden, trækkes depositum. Aflyser salonen, får kunden det altid tilbage.

**Påmindelser** sendes 24 timer før til bekræftede tider, der er booket mere end et døgn i forvejen. `GET /api/cron/reminders` med `Authorization: Bearer $CRON_SECRET` kører dem, og det kan kaldes så ofte man vil uden dobbelte SMS'er. `vercel.json` kører dem én gang i døgnet kl. 7 UTC, da Vercels gratis plan ikke tillader oftere. Med Pro kan tidsplanen sættes til hver time (`0 * * * *`).

## Det mangler før rigtige kunder

- **Rigtig SMS-udbyder.** Implementér `SmsProvider` i `src/lib/sms.ts`, fx med GatewayAPI (dansk og billig), og sæt `SMS_PROVIDER`.
- **Rigtig MobilePay.** Implementér `PaymentProvider` i `src/lib/payments.ts` mod Vipps MobilePay ePayment API, og tilføj en webhook-route der kalder `handlePaymentEvent`. Kræver en MobilePay-aftale og nøgler.
- **Flere saloner og logins pr. medarbejder.** Datamodellen har allerede `salon_id` overalt, men admin styrer i dag én salon (`SALON_SLUG`) med ét fælles kodeord.
- **Booking fra salonens side**, fx når en kunde ringer. Indtil da kan personalet bruge bookingsiden.
- Fra researchen, næste runde: venteliste der fylder huller via SMS, farve med virketid, genbooking efter fast interval og import fra Planway og Fresha.

## Miljøvariabler

Se `.env.example`. I produktion skal `DATABASE_URL`, `ADMIN_PASSWORD` og `CRON_SECRET` sættes. `APP_URL` er valgfri på Vercel.
