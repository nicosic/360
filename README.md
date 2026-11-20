# Platforma za ocjenjivanje učinkovitosti rada

Jezgra koja vodi postupak ocjenjivanja opisan podacima. Ne sadrži ništa što vrijedi samo za
jednog kupca ili jednu vrstu ustanove: pravila dolaze kroz pakete pravila, a vrijednosti koje
paket ostavlja otvorenima kroz postavke kupca.

Svaki kupac ima vlastitu instancu: aplikaciju na Cloudflare Workersima, D1 bazu i R2 spremište
(oboje s jurisdikcijom „eu“) te poddomenu.

## Što je izrađeno

- prijava bez lozinke s obveznim drugim faktorom, sjednice u bazi instance
- revizijski trag koji se samo dodaje, s lancem kontrolnih zbrojeva
- paketi pravila (`src/paketi/`): postupak opisan podacima, s izvorom uz svako pravilo;
  prvi paket je za javne službe (Uredba NN 127/24)
- postavke kupca: posebni kriteriji, broj članova tijela, zaokruživanje kvota
- uvoz organizacije iz CSV-a, s probnim prolazom
- postupak (`src/lib/postupak/`): otvaranje ciklusa, evidencija rada, samoprocjena, prijedlog,
  uvid, očitovanje, glasovanje Povjerenstva i Odbora s izuzećima, odluka, dostava, unos u registar
- kvote, bodovi, ispis dokumenata za potpis i popis odluka za Registar zaposlenih
- skripte za otvaranje instance, postavljanje, migracije i prvog administratora (`scripts/`)

Još nije izrađeno: paket za državna tijela, ocjenjivanje čelnika, više razdoblja i više
nadređenih u godini, rad kod više poslodavaca, učitavanje skenova, obavijesti e-poštom i
slanje e-pošte u produkciji (pružatelj nije odabran).

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
