# Platforma za ocjenjivanje učinkovitosti rada

Jezgra koja vodi postupak ocjenjivanja opisan podacima. Ne sadrži ništa što vrijedi samo za
jednog kupca ili jednu vrstu ustanove: pravila dolaze kroz pakete pravila, a vrijednosti koje
paket ostavlja otvorenima kroz postavke kupca.

Svaki kupac ima vlastitu instancu: aplikaciju na Cloudflare Workersima, D1 bazu i R2 spremište
(oboje s jurisdikcijom „eu“) te poddomenu.

## Što je izrađeno (prvi korak)

- projekt u Astru, stranice se slažu na poslužitelju
- shema baze za organizaciju, pristup i revizijski trag (`src/db/shema.ts`, `migrations/`)
- prijava bez lozinke: jednokratni kod e-poštom, zatim obvezni kod iz aplikacije
- sjednice u bazi instance: istek nakon 30 minuta neaktivnosti i najkasnije nakon 12 sati
- revizijski trag koji se samo dodaje, s lancem kontrolnih zbrojeva; izmjenu i brisanje odbija i baza
- skripte za otvaranje instance, migracije i prvog administratora (`scripts/`)

Još nije izrađeno: paketi pravila, postupak, obrasci, dokumenti, uvoz organizacije i slanje
e-pošte u produkciji (pružatelj nije odabran; postoji samo razvojna izvedba koja kod ispisuje
u zapis rada).

## Lokalni rad

```bash
npm install
cp .dev.vars.example .dev.vars        # upisati ključ: openssl rand -base64 32
npx wrangler d1 migrations apply DB --local
node scripts/prvi-administrator.mjs --eposta ime@primjer.hr --lokalno
npm run dev
```

Kod za prijavu na lokalnoj instanci ispisuje se u zapis razvojnog poslužitelja.

## Provjere

```bash
npm test          # testovi prijave, sjednica, revizijskog traga i skripti
npm run check     # tipovi
npm run build
```

## Shema i migracije

Shema se mijenja u `src/db/shema.ts`, a `npm run db:generate` izrađuje SQL migraciju.
Migracije primjenjuje isključivo Wrangler (`scripts/migriraj.mjs`), bazu po bazu. Idu samo unaprijed.

## Instance

`instance/<oznaka>.json` je središnji popis instanci: oznaka, adresa, baza, spremište, verzija.
Ne sadrži osobne podatke.

```bash
node scripts/otvori-instancu.mjs --oznaka <oznaka> --naziv "<naziv>" --domena <naša domena> \
  --administrator <e-pošta> --eposta-nacin <način> --proba
```

`--proba` ispisuje naredbe bez izvršavanja. Skripta bez `--proba` još nije pokrenuta na stvarnom
Cloudflare računu.

## Raspored koda

| Mapa | Sadržaj |
| --- | --- |
| `src/db` | shema i pristup bazi |
| `src/lib` | jezgra: prijava, sjednice, ovlasti, revizija, kriptografija |
| `src/platforma` | jedino mjesto koje dodiruje Cloudflare (veze i tajne) |
| `src/pages`, `src/layouts` | stranice |
| `scripts` | upravljanje instancama |
| `test` | testovi nad lokalnom D1 bazom |
